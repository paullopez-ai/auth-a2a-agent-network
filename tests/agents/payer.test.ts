import { describe, it, expect } from "vitest";
import { requestParseNode } from "../../src/agents/payer/pipeline/nodes/request-parse.ts";
import { criteriaLookupNode } from "../../src/agents/payer/pipeline/nodes/criteria-lookup.ts";
import { evaluationNode } from "../../src/agents/payer/pipeline/nodes/evaluation.ts";
import {
  determinationNode,
  routeAfterDetermination,
} from "../../src/agents/payer/pipeline/nodes/determination.ts";
import { humanReviewNode } from "../../src/agents/payer/pipeline/nodes/human-review.ts";
import { responseNode } from "../../src/agents/payer/pipeline/nodes/response.ts";
import { buildPayerGraph } from "../../src/agents/payer/pipeline/graph.ts";
import type { PayerState } from "../../src/agents/payer/pipeline/state.ts";
import { TrustBoundaryClassification } from "../../src/shared/types/determination.ts";
import {
  scenario1Request,
  scenario2Request,
  scenario3Request,
} from "../../demo/scenarios/_data.ts";

function baseState(over: Partial<PayerState> = {}): PayerState {
  return {
    request: scenario1Request,
    turn: 1,
    criteria: undefined,
    criteriaSource: "none",
    evaluation: undefined,
    determination: undefined,
    humanDecision: undefined,
    ...over,
  } as PayerState;
}

describe("Payer nodes", () => {
  it("requestParseNode validates and returns the request", () => {
    const out = requestParseNode(baseState());
    expect(out.request?.cptCode).toBe("99213");
  });

  it("requestParseNode throws on a malformed request", () => {
    const bad = baseState({ request: { cptCode: 5 } as never });
    expect(() => requestParseNode(bad)).toThrow();
  });

  it("criteriaLookupNode falls back to embedded synthetic criteria (no MCP)", async () => {
    const out = await criteriaLookupNode(baseState({ request: scenario2Request }));
    expect(out.criteriaSource).toBe("embedded-synthetic");
    expect(out.criteria?.cptCode).toBe("27447");
  });

  it("evaluationNode produces a scenario-keyed confidence (mock)", async () => {
    const out = await evaluationNode(baseState());
    expect(out.evaluation?.confidence).toBe(0.91);
    expect(out.evaluation?.recommendation).toBe("approve");
  });

  it("determinationNode maps recommendation→outcome and stamps trust band", () => {
    const evaluation = {
      confidence: 0.65,
      recommendation: "refer-human" as const,
      rationale: "ambiguous",
      criteriaEvaluated: [],
      missingItems: [],
    };
    const out = determinationNode(baseState({ evaluation }));
    expect(out.determination?.outcome).toBe("needs-human-review");
    expect(out.determination?.trustBoundary).toBe(
      TrustBoundaryClassification.Supervised,
    );
  });

  it("routeAfterDetermination sends needs-human-review to humanReview", () => {
    const state = baseState({
      determination: { outcome: "needs-human-review" } as never,
    });
    expect(routeAfterDetermination(state)).toBe("humanReview");
    const approved = baseState({
      determination: { outcome: "approved" } as never,
    });
    expect(routeAfterDetermination(approved)).toBe("response");
  });

  it("humanReviewNode finalizes a draft with the human decision", () => {
    const draft = {
      requestId: "r",
      outcome: "needs-human-review" as const,
      confidence: 0.65,
      rationale: "draft",
      criteriaEvaluated: [],
      trustBoundary: TrustBoundaryClassification.Supervised,
      decidedBy: "payer-agent",
      missingItems: [],
      timestamp: new Date().toISOString(),
    };
    const out = humanReviewNode(
      baseState({
        determination: draft,
        humanDecision: { approve: true, reviewer: "Dr. Reyes" },
      }),
    );
    expect(out.determination?.outcome).toBe("approved");
    expect(out.determination?.decidedBy).toBe("human:Dr. Reyes");
  });

  it("humanReviewNode refuses to finalize without a decision", () => {
    const draft = { outcome: "needs-human-review" } as never;
    expect(() =>
      humanReviewNode(baseState({ determination: draft })),
    ).toThrow(/without a human decision/);
  });

  it("responseNode validates the determination schema", () => {
    const determination = {
      requestId: "r",
      outcome: "approved" as const,
      confidence: 0.9,
      rationale: "ok",
      criteriaEvaluated: [],
      trustBoundary: TrustBoundaryClassification.Autonomous,
      decidedBy: "payer-agent",
      missingItems: [],
      timestamp: new Date().toISOString(),
    };
    const out = responseNode(baseState({ determination }));
    expect(out.determination?.outcome).toBe("approved");
  });
});

describe("Payer pipeline (full graph, mock LLM)", () => {
  it("scenario 1: clean approval, Autonomous", async () => {
    const graph = buildPayerGraph();
    const result = (await graph.invoke(
      { request: scenario1Request, turn: 1 },
      { configurable: { thread_id: "t-s1" } },
    )) as PayerState;
    expect(result.determination?.outcome).toBe("approved");
    expect(result.determination?.trustBoundary).toBe(
      TrustBoundaryClassification.Autonomous,
    );
  });

  it("scenario 2: first pass needs more info", async () => {
    const graph = buildPayerGraph();
    const result = (await graph.invoke(
      { request: scenario2Request, turn: 1 },
      { configurable: { thread_id: "t-s2" } },
    )) as PayerState;
    expect(result.determination?.outcome).toBe("needs-more-info");
    expect(result.determination?.missingItems.length).toBeGreaterThan(0);
  });

  it("scenario 3: interrupt-before HumanReviewNode fires, then resumes", async () => {
    const graph = buildPayerGraph();
    const config = { configurable: { thread_id: "t-s3" } };
    await graph.invoke({ request: scenario3Request, turn: 1 }, config);

    // The graph must pause BEFORE humanReview — the trust gate is real.
    const snapshot = await graph.getState(config);
    expect(snapshot.next).toContain("humanReview");

    // Inject the human decision and resume past the interrupt.
    await graph.updateState(config, {
      humanDecision: { approve: true, reviewer: "Dr. Reyes" },
    });
    const resumed = (await graph.invoke(null, config)) as PayerState;
    expect(resumed.determination?.outcome).toBe("approved");
    expect(resumed.determination?.decidedBy).toBe("human:Dr. Reyes");
  });
});
