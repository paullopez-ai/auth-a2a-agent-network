import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import type { Client } from "@a2a-js/sdk/client";
import type { Message } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
import type { AuthRequest } from "../../src/shared/types/auth-request.ts";

const PROVIDER_URL = process.env.PROVIDER_URL ?? "http://localhost:4001";
const PAYER_URL = process.env.PAYER_URL ?? "http://localhost:4002";

function makeFactory(): ClientFactory {
  return new ClientFactory({ transports: [new JsonRpcTransportFactory()] });
}

export function providerClient(): Promise<Client> {
  return makeFactory().createFromUrl(PROVIDER_URL);
}
export function payerClient(): Promise<Client> {
  return makeFactory().createFromUrl(PAYER_URL);
}

const R   = "\x1b[0m";
const IN  = `\x1b[1;36m⟸${R}`;            // bold cyan
const ART = `\x1b[1;33martifact${R}`;       // bold yellow

function dataPart(parts: Message["parts"] | undefined): Record<string, unknown> | undefined {
  const p = parts?.find((x) => x.kind === "data");
  return p && p.kind === "data" ? p.data : undefined;
}
function textParts(parts: Message["parts"] | undefined): string {
  return (parts ?? [])
    .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
    .map((p) => p.text)
    .join(" ");
}

export interface ProviderResult {
  status: string;
  determination?: Record<string, unknown>;
  payerTaskId?: string;
  payerContextId?: string;
  transcript?: string[];
}

/** Streams a message to a client, printing each A2A event, and returns the
 * final task's first structured artifact payload. */
async function streamPrint(
  client: Client,
  message: Message,
  label: string,
): Promise<{ state: string; artifact?: Record<string, unknown> }> {
  let state = "submitted";
  let artifact: Record<string, unknown> | undefined;
  for await (const event of client.sendMessageStream({ message })) {
    switch (event.kind) {
      case "task":
        state = event.status.state;
        console.log(`  ${label} ${IN} task ${event.id.slice(0, 8)} (${state})`);
        break;
      case "status-update": {
        state = event.status.state;
        const msg = textParts(event.status.message?.parts);
        console.log(
          `  ${label} ${IN} status: ${state}${event.final ? " [final]" : ""}` +
            (msg ? `\n        ${msg}` : ""),
        );
        break;
      }
      case "artifact-update": {
        const d = dataPart(event.artifact.parts);
        if (d) artifact = d;
        console.log(`  ${label} ${IN} ${ART}: ${event.artifact.name}`);
        break;
      }
    }
  }
  return { state, artifact };
}

/** Submit an authorization request to the Provider agent over A2A. */
export async function submitToProvider(
  request: AuthRequest,
): Promise<{ state: string; result?: ProviderResult }> {
  const client = await providerClient();
  const message: Message = {
    kind: "message",
    role: "user",
    messageId: uuidv4(),
    parts: [
      { kind: "text", text: `Authorize CPT ${request.cptCode}` },
      { kind: "data", data: { kind: "auth-request", request } },
    ],
  };
  const { state, artifact } = await streamPrint(client, message, "provider");
  return { state, result: artifact as ProviderResult | undefined };
}

/** Send a human review decision to the Payer agent on an existing task. */
export async function sendHumanDecisionToPayer(
  payerTaskId: string,
  payerContextId: string,
  decision: { approve: boolean; reviewer: string; note?: string },
  requestId: string,
): Promise<{ state: string; determination?: Record<string, unknown> }> {
  const client = await payerClient();
  const message: Message = {
    kind: "message",
    role: "user",
    messageId: uuidv4(),
    taskId: payerTaskId,
    contextId: payerContextId,
    parts: [
      { kind: "text", text: `Human review decision by ${decision.reviewer}` },
      { kind: "data", data: { kind: "human-decision", requestId, ...decision } },
    ],
  };
  const { state, artifact } = await streamPrint(client, message, "payer");
  const det = (artifact?.determination as Record<string, unknown>) ?? artifact;
  return { state, determination: det };
}

export function banner(title: string): void {
  console.log("\n" + "═".repeat(68));
  console.log("  " + title);
  console.log("═".repeat(68));
}

export function printDetermination(det: Record<string, unknown> | undefined): void {
  if (!det) {
    console.log("  (no determination)");
    return;
  }
  console.log("\n  ── Determination ───────────────────────────────────────");
  console.log(`     outcome      : ${det.outcome}`);
  console.log(`     confidence   : ${det.confidence}`);
  console.log(`     trust band   : ${det.trustBoundary}`);
  console.log(`     decided by   : ${det.decidedBy}`);
  console.log(`     rationale    : ${String(det.rationale).split("\n")[0]}`);
}
