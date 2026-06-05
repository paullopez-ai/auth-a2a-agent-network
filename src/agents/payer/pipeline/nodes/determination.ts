import type { PayerState } from "../state.ts";
import type { Recommendation } from "../../../../shared/reasoning.ts";
import {
  classifyTrustBoundary,
  TrustBoundaryClassification,
  type Determination,
  type PayerOutcome,
} from "../../../../shared/types/determination.ts";

/**
 * DeterminationNode — turns an evaluation into a draft determination and
 * stamps the trust boundary. Routing happens off this node's output
 * (see `routeAfterDetermination`):
 *   - refer-human → HumanReviewNode (interrupt-before; Supervised band)
 *   - everything else → ResponseNode
 *
 * For a `refer-human` recommendation the determination is a DRAFT pending the
 * human decision; it is not finalized until HumanReviewNode runs.
 */
export function determinationNode(state: PayerState): Partial<PayerState> {
  const evaluation = state.evaluation;
  if (!evaluation) {
    throw new Error("DeterminationNode reached without an evaluation");
  }

  const outcome = recommendationToOutcome(evaluation.recommendation);
  const determination: Determination = {
    requestId: state.request.requestId,
    outcome,
    confidence: evaluation.confidence,
    rationale: evaluation.rationale,
    criteriaEvaluated: evaluation.criteriaEvaluated,
    trustBoundary: classifyTrustBoundary(evaluation.confidence),
    decidedBy: "payer-agent",
    missingItems: evaluation.missingItems,
    timestamp: new Date().toISOString(),
  };

  return { determination };
}

/** Conditional edge target after DeterminationNode. */
export function routeAfterDetermination(
  state: PayerState,
): "humanReview" | "response" {
  return state.determination?.outcome === "needs-human-review"
    ? "humanReview"
    : "response";
}

function recommendationToOutcome(recommendation: Recommendation): PayerOutcome {
  switch (recommendation) {
    case "approve":
      return "approved";
    case "deny":
      return "denied";
    case "request-info":
      return "needs-more-info";
    case "refer-human":
      return "needs-human-review";
    default:
      return "needs-human-review";
  }
}

export { TrustBoundaryClassification };
