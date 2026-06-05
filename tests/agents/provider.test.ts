import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExchangeResult } from "../../src/agents/provider/a2a-client.ts";
import type { Determination } from "../../src/shared/types/determination.ts";
import { TrustBoundaryClassification } from "../../src/shared/types/determination.ts";
import type { ProviderState } from "../../src/agents/provider/pipeline/state.ts";
import { scenario2Request } from "../../demo/scenarios/_data.ts";

// Mock the A2A client so Provider nodes are tested without a live Payer.
const sendAndCollect = vi.fn<(...args: never[]) => Promise<ExchangeResult>>();
vi.mock("../../src/agents/provider/a2a-client.ts", () => ({
  sendAndCollect: (...args: never[]) => sendAndCollect(...args),
  getPayerClient: vi.fn(),
}));

const { requestBuildNode } = await import(
  "../../src/agents/provider/pipeline/nodes/request-build.ts"
);
const { documentationPackageNode } = await import(
  "../../src/agents/provider/pipeline/nodes/documentation-package.ts"
);
const { a2aSubmitNode } = await import(
  "../../src/agents/provider/pipeline/nodes/a2a-submit.ts"
);
const { responseHandlerNode, routeAfterResponse } = await import(
  "../../src/agents/provider/pipeline/nodes/response-handler.ts"
);
const { appealNode } = await import(
  "../../src/agents/provider/pipeline/nodes/appeal.ts"
);

function det(over: Partial<Determination> = {}): Determination {
  return {
    requestId: "req-s2-knee",
    outcome: "approved",
    confidence: 0.88,
    rationale: "ok",
    criteriaEvaluated: [],
    trustBoundary: TrustBoundaryClassification.Autonomous,
    decidedBy: "payer-agent",
    missingItems: [],
    timestamp: new Date().toISOString(),
    ...over,
  };
}

function baseState(over: Partial<ProviderState> = {}): ProviderState {
  return {
    request: scenario2Request,
    determination: undefined,
    status: "submitting",
    payerTaskId: "",
    payerContextId: "",
    needsAppeal: false,
    appealed: false,
    transcript: [],
    ...over,
  } as ProviderState;
}

beforeEach(() => sendAndCollect.mockReset());

describe("Provider nodes", () => {
  it("requestBuildNode assigns a request id and validates", () => {
    const out = requestBuildNode(
      baseState({ request: { ...scenario2Request, requestId: "" } }),
    );
    expect(out.request?.requestId).toBeTruthy();
    expect(out.transcript?.[0]).toContain("27447");
  });

  it("documentationPackageNode reports the package without inventing docs", () => {
    const out = documentationPackageNode(baseState());
    expect(out.transcript?.[0]).toContain("2 document(s)");
  });

  it("a2aSubmitNode records the Payer task id and determination", async () => {
    sendAndCollect.mockResolvedValue({
      taskId: "payer-task-1",
      contextId: "ctx-1",
      finalState: "input-required",
      determination: det({ outcome: "needs-more-info", missingItems: ["x"] }),
      statusMessage: "need more",
      transcript: ["← status: input-required"],
    });
    const out = await a2aSubmitNode(baseState());
    expect(out.payerTaskId).toBe("payer-task-1");
    expect(out.determination?.outcome).toBe("needs-more-info");
  });

  it("responseHandlerNode routes needs-more-info to appeal", () => {
    const state = baseState({
      determination: det({ outcome: "needs-more-info", missingItems: ["x"] }),
    });
    const out = responseHandlerNode(state);
    expect(out.needsAppeal).toBe(true);
    expect(routeAfterResponse({ ...state, ...out })).toBe("appeal");
  });

  it("responseHandlerNode flags pending-human for needs-human-review", () => {
    const out = responseHandlerNode(
      baseState({
        determination: det({ outcome: "needs-human-review", confidence: 0.65 }),
        payerTaskId: "pt",
      }),
    );
    expect(out.status).toBe("pending-human");
  });

  it("responseHandlerNode treats approved as terminal", () => {
    const state = baseState({ determination: det({ outcome: "approved" }) });
    const out = responseHandlerNode(state);
    expect(out.status).toBe("approved");
    expect(routeAfterResponse({ ...state, ...out })).toBe("done");
  });

  it("appealNode resubmits on the same task and returns the new determination", async () => {
    sendAndCollect.mockResolvedValue({
      taskId: "payer-task-1",
      contextId: "ctx-1",
      finalState: "completed",
      determination: det({ outcome: "approved", confidence: 0.88 }),
      statusMessage: "approved",
      transcript: ["← status: completed"],
    });
    const out = await appealNode(
      baseState({
        determination: det({
          outcome: "needs-more-info",
          missingItems: ["conservative tx"],
        }),
        payerTaskId: "payer-task-1",
        payerContextId: "ctx-1",
      }),
    );
    expect(out.appealed).toBe(true);
    expect(out.status).toBe("approved");
    // Appeal must continue the SAME task, not open a new one.
    const sentMessage = sendAndCollect.mock.calls[0]?.[0] as
      | { taskId?: string }
      | undefined;
    expect(sentMessage?.taskId).toBe("payer-task-1");
  });
});
