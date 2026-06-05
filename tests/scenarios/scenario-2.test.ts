import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import type { Client } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from "uuid";
import { startAgents, type RunningAgents } from "../helpers/servers.ts";
import { firstDataPart } from "../../src/shared/types/a2a-artifacts.ts";
import { scenario2Request } from "../../demo/scenarios/_data.ts";

let agents: RunningAgents;
let provider: Client;

beforeAll(async () => {
  agents = await startAgents(14202, 14201);
  provider = await new ClientFactory({
    transports: [new JsonRpcTransportFactory()],
  }).createFromUrl(agents.providerUrl);
}, 30_000);

afterAll(() => agents?.stop());

describe("Scenario 2 — denial with appeal (end to end over A2A)", () => {
  it("negotiates submitted → input-required → appeal → completed/approved", async () => {
    const result = await provider.sendMessage({
      message: {
        kind: "message",
        role: "user",
        messageId: uuidv4(),
        parts: [
          { kind: "text", text: "Authorize CPT 27447" },
          { kind: "data", data: { kind: "auth-request", request: scenario2Request } },
        ],
      },
    });

    expect(result.kind).toBe("task");
    if (result.kind !== "task") return;

    // The Provider auto-appealed; its task finalizes as completed/approved.
    expect(result.status.state).toBe("completed");

    const data = firstDataPart(result.artifacts?.[0]?.parts) as {
      status: string;
      determination: { outcome: string; confidence: number };
      transcript: string[];
    };
    expect(data.status).toBe("approved");
    expect(data.determination.outcome).toBe("approved");

    // The transcript must show the full multi-turn negotiation on one task.
    const joined = data.transcript.join("\n");
    expect(joined).toMatch(/input-required/);
    expect(joined).toMatch(/AppealNode/);
    expect(joined).toMatch(/completed/);
  });
});
