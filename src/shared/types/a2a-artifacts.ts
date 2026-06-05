import { z } from "zod";
import type {
  Artifact,
  DataPart,
  Message,
  Part,
  TextPart,
} from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
import { AuthRequestSchema } from "./auth-request.ts";
import { DeterminationSchema } from "./determination.ts";

/**
 * Typed schemas for the structured payloads carried inside A2A `DataPart`s.
 * The wire format is the contract between the two agents — these schemas are
 * the only thing both sides agree on. Each payload has a `kind` discriminator.
 */

/** Provider → Payer: the authorization request (initial submission). */
export const AuthRequestPayloadSchema = z.object({
  kind: z.literal("auth-request"),
  request: AuthRequestSchema,
});

/** Provider → Payer: supplemental documents in response to input-required. */
export const AppealPayloadSchema = z.object({
  kind: z.literal("appeal"),
  requestId: z.string(),
  supplementalDocuments: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      content: z.string(),
    }),
  ),
  note: z.string(),
});

/** Human reviewer → Payer: the decision that resolves a Supervised pause. */
export const HumanDecisionPayloadSchema = z.object({
  kind: z.literal("human-decision"),
  requestId: z.string(),
  approve: z.boolean(),
  reviewer: z.string(),
  note: z.string().optional(),
});

/** Payer → Provider: the final/structured determination artifact. */
export const DeterminationPayloadSchema = z.object({
  kind: z.literal("determination"),
  determination: DeterminationSchema,
});

export type AuthRequestPayload = z.infer<typeof AuthRequestPayloadSchema>;
export type AppealPayload = z.infer<typeof AppealPayloadSchema>;
export type HumanDecisionPayload = z.infer<typeof HumanDecisionPayloadSchema>;
export type DeterminationPayload = z.infer<typeof DeterminationPayloadSchema>;

/** Any structured payload the Provider may send the Payer on a task. */
export const InboundPayloadSchema = z.discriminatedUnion("kind", [
  AuthRequestPayloadSchema,
  AppealPayloadSchema,
  HumanDecisionPayloadSchema,
]);
export type InboundPayload = z.infer<typeof InboundPayloadSchema>;

// --- A2A wire helpers -------------------------------------------------------

export function textPart(text: string): TextPart {
  return { kind: "text", text };
}

export function dataPart(data: Record<string, unknown>): DataPart {
  return { kind: "data", data };
}

/** Builds a `user`-role A2A message carrying a structured payload + summary. */
export function buildMessage(
  payload: Record<string, unknown>,
  summary: string,
  opts: { taskId?: string; contextId?: string } = {},
): Message {
  return {
    kind: "message",
    role: "user",
    messageId: uuidv4(),
    parts: [textPart(summary), dataPart(payload)],
    ...(opts.taskId ? { taskId: opts.taskId } : {}),
    ...(opts.contextId ? { contextId: opts.contextId } : {}),
  };
}

/** Builds an A2A artifact carrying a structured determination payload. */
export function buildArtifact(
  name: string,
  payload: Record<string, unknown>,
  summary: string,
): Artifact {
  return {
    artifactId: uuidv4(),
    name,
    parts: [textPart(summary), dataPart(payload)],
  };
}

/** Extracts the first structured DataPart from a message or artifact parts. */
export function firstDataPart(parts: Part[] | undefined): Record<string, unknown> | undefined {
  const part = parts?.find((p): p is DataPart => p.kind === "data");
  return part?.data;
}

/** Concatenates all text parts (used for human-readable summaries/logging). */
export function joinTextParts(parts: Part[] | undefined): string {
  return (parts ?? [])
    .filter((p): p is TextPart => p.kind === "text")
    .map((p) => p.text)
    .join(" ");
}
