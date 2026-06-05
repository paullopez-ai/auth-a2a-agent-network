import { z } from "zod";

/**
 * Trust boundary classification on every determination the Payer produces.
 * The band is a function of model confidence and decides where authority sits:
 *
 *   Autonomous (> 0.8)  — the agent may finalize without a human.
 *   Supervised (0.5–0.8) — HumanReviewNode interrupt-before fires; a human
 *                          must approve before the task can reach `completed`.
 *   Restricted (< 0.5)  — below the minimum confidence to act on; reserved for
 *                          escalation, never auto-finalized.
 */
export enum TrustBoundaryClassification {
  Autonomous = "Autonomous",
  Supervised = "Supervised",
  Restricted = "Restricted",
}

export const CONFIDENCE_AUTONOMOUS_MIN = 0.8;
export const CONFIDENCE_SUPERVISED_MIN = 0.5;

/** Maps a raw confidence score to its trust band. */
export function classifyTrustBoundary(
  confidence: number,
): TrustBoundaryClassification {
  if (confidence >= CONFIDENCE_AUTONOMOUS_MIN) {
    return TrustBoundaryClassification.Autonomous;
  }
  if (confidence >= CONFIDENCE_SUPERVISED_MIN) {
    return TrustBoundaryClassification.Supervised;
  }
  return TrustBoundaryClassification.Restricted;
}

/** Per-criterion evaluation result, part of the audit trail. */
export const CriterionResultSchema = z.object({
  criterionId: z.string(),
  description: z.string(),
  met: z.boolean(),
  note: z.string().optional(),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

/**
 * The decision the Payer reaches. `approved`/`denied` are terminal. The two
 * `needs-*` recommendations pause the A2A task in `input-required`:
 *   needs-more-info     → Provider should appeal with supplemental documents.
 *   needs-human-review  → a human must decide (Supervised trust band).
 */
export const PayerOutcomeSchema = z.enum([
  "approved",
  "denied",
  "needs-more-info",
  "needs-human-review",
]);
export type PayerOutcome = z.infer<typeof PayerOutcomeSchema>;

/**
 * The full, audit-complete determination. Every field here is part of the
 * trust story: a determination is never returned without confidence,
 * rationale, the criteria it was evaluated against, who decided, and when.
 */
export const DeterminationSchema = z.object({
  requestId: z.string(),
  outcome: PayerOutcomeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  criteriaEvaluated: z.array(CriterionResultSchema),
  trustBoundary: z.nativeEnum(TrustBoundaryClassification),
  /** "payer-agent" for autonomous decisions, or a named human reviewer. */
  decidedBy: z.string(),
  /** Items the Provider must supply when outcome is needs-more-info. */
  missingItems: z.array(z.string()).default([]),
  timestamp: z.string(),
});
export type Determination = z.infer<typeof DeterminationSchema>;
