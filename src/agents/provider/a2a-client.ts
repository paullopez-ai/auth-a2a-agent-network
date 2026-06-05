import { ClientFactory } from "@a2a-js/sdk/client";
import { JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import type { Client } from "@a2a-js/sdk/client";
import type {
  Message,
  Task,
  TaskState,
  Artifact,
} from "@a2a-js/sdk";
import { firstDataPart } from "../../shared/types/a2a-artifacts.ts";
import {
  DeterminationSchema,
  type Determination,
} from "../../shared/types/determination.ts";

const PAYER_URL = process.env.PAYER_URL ?? "http://localhost:4002";
const SSE_TIMEOUT_MS = Number(process.env.A2A_SSE_TIMEOUT_MS ?? 15_000);

let clientPromise: Promise<Client> | undefined;

/**
 * Discovers the Payer agent from its Agent Card and builds an A2A client.
 * The Provider never imports Payer code — it only knows the URL and the card.
 */
export function getPayerClient(): Promise<Client> {
  if (!clientPromise) {
    const factory = new ClientFactory({
      transports: [new JsonRpcTransportFactory()],
    });
    // Don't cache a rejected promise: if discovery fails (e.g. Payer not up
    // yet), reset so the next call retries instead of failing forever.
    clientPromise = factory.createFromUrl(PAYER_URL).catch((err) => {
      clientPromise = undefined;
      throw err;
    });
  }
  return clientPromise;
}

export interface ExchangeResult {
  taskId: string;
  contextId: string;
  finalState: TaskState;
  determination?: Determination;
  /** Agent-side status message text on the final event (e.g. what's missing). */
  statusMessage: string;
  /** Human-readable transcript of the streamed A2A events. */
  transcript: string[];
}

/**
 * Sends a message to the Payer and consumes the SSE event stream to a terminal
 * state, returning the determination. Includes an SSE timeout and one retry on
 * connection failure (Skill 4): a slow Payer never silently drops the task.
 */
export async function sendAndCollect(message: Message): Promise<ExchangeResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await streamOnce(message);
    } catch (err) {
      lastErr = err;
      if (attempt === 1) {
        // brief backoff before the single retry
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
  throw new Error(
    `A2A exchange failed after retry: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

async function streamOnce(message: Message): Promise<ExchangeResult> {
  const client = await getPayerClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);

  const transcript: string[] = [];
  let taskId = message.taskId ?? "";
  let contextId = message.contextId ?? "";
  let finalState: TaskState = "submitted";
  let statusMessage = "";
  let determination: Determination | undefined;

  try {
    const stream = client.sendMessageStream(
      { message },
      { signal: controller.signal },
    );
    for await (const event of stream) {
      switch (event.kind) {
        case "task": {
          const t = event as Task;
          taskId = t.id;
          contextId = t.contextId;
          finalState = t.status.state;
          transcript.push(`← task created (${t.status.state})`);
          break;
        }
        case "status-update": {
          finalState = event.status.state;
          taskId = event.taskId;
          contextId = event.contextId;
          const msg = textOf(event.status.message?.parts);
          if (msg) statusMessage = msg;
          transcript.push(
            `← status: ${event.status.state}${event.final ? " (final)" : ""}` +
              (msg ? ` — ${truncate(msg)}` : ""),
          );
          break;
        }
        case "artifact-update": {
          const det = extractDetermination(event.artifact);
          if (det) {
            determination = det;
            transcript.push(
              `← artifact: determination = ${det.outcome} ` +
                `(conf ${det.confidence}, ${det.trustBoundary})`,
            );
          }
          break;
        }
        case "message": {
          transcript.push(`← message: ${textOf(event.parts)}`);
          break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return { taskId, contextId, finalState, determination, statusMessage, transcript };
}

function extractDetermination(artifact: Artifact): Determination | undefined {
  const data = firstDataPart(artifact.parts);
  if (data && data.kind === "determination") {
    const parsed = DeterminationSchema.safeParse(
      (data as { determination: unknown }).determination,
    );
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function textOf(parts: Message["parts"] | undefined): string {
  return (parts ?? [])
    .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
    .map((p) => p.text)
    .join(" ");
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
