import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import type { Client } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from "uuid";
import { startAgents, type RunningAgents } from "../helpers/servers.ts";
import { firstDataPart } from "../../src/shared/types/a2a-artifacts.ts";
import { scenario1Request, scenario2Request } from "../../demo/scenarios/_data.ts";

let agents: RunningAgents;
let payer: Client;

beforeAll(async () => {
  agents = await startAgents(14102, 14101);
  payer = await new ClientFactory({
    transports: [new JsonRpcTransportFactory()],
  }).createFromUrl(agents.payerUrl);
}, 30_000);

afterAll(() => agents?.stop());

describe("A2A message exchange (real round trip)", () => {
  it("serves a valid Agent Card at the well-known path", async () => {
    const card = await payer.getAgentCard();
    expect(card.name).toBe("Payer Authorization Agent");
    expect(card.skills.map((s) => s.id)).toContain("evaluate-authorization");
  });

  it("completes a single round trip to a determination artifact", async () => {
    const result = await payer.sendMessage({
      message: {
        kind: "message",
        role: "user",
        messageId: uuidv4(),
        parts: [
          { kind: "data", data: { kind: "auth-request", request: scenario1Request } },
        ],
      },
    });
    expect(result.kind).toBe("task");
    if (result.kind !== "task") return;
    expect(result.status.state).toBe("completed");
    const data = firstDataPart(result.artifacts?.[0]?.parts);
    expect((data as { determination: { outcome: string } }).determination.outcome).toBe(
      "approved",
    );
  });

  it("exposes the input-required state on the multi-turn path", async () => {
    const result = await payer.sendMessage({
      message: {
        kind: "message",
        role: "user",
        messageId: uuidv4(),
        parts: [
          { kind: "data", data: { kind: "auth-request", request: scenario2Request } },
        ],
      },
    });
    expect(result.kind).toBe("task");
    if (result.kind !== "task") return;
    expect(result.status.state).toBe("input-required");
  });
});
