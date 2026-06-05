import type { PayerState } from "../state.ts";
import { TrustBoundaryClassification } from "../../../../shared/types/determination.ts";

/**
 * HumanReviewNode — the trust gate. The Payer graph is compiled with
 * `interruptBefore: ["humanReview"]`, so when DeterminationNode routes here the
 * pipeline PHYSICALLY STOPS before this node runs. It cannot proceed to a
 * `completed` determination until a human decision is injected into state
 * (via the executor's resume path) and the graph is resumed.
 *
 * When the node finally runs, `state.humanDecision` is present and it finalizes
 * the draft determination with the human's outcome and attribution. The trust
 * boundary remains Supervised: a human, not the model, held final authority.
 */
export function humanReviewNode(state: PayerState): Partial<PayerState> {
  const draft = state.determination;
  const decision = state.humanDecision;

  if (!draft) {
    throw new Error("HumanReviewNode reached without a draft determination");
  }
  if (!decision) {
    // Should never happen: interrupt-before guarantees a decision is supplied
    // before the node executes. Guard so we never silently auto-approve.
    throw new Error(
      "HumanReviewNode ran without a human decision — refusing to finalize",
    );
  }

  return {
    determination: {
      ...draft,
      outcome: decision.approve ? "approved" : "denied",
      decidedBy: `human:${decision.reviewer}`,
      trustBoundary: TrustBoundaryClassification.Supervised,
      rationale:
        `${draft.rationale}\n\nHuman review (${decision.reviewer}): ` +
        `${decision.approve ? "APPROVED" : "DENIED"}.` +
        (decision.note ? ` ${decision.note}` : ""),
      timestamp: new Date().toISOString(),
    },
  };
}
