import type { PayerState } from "../state.ts";
import { getReasoner } from "../../../../shared/llm.ts";

/**
 * EvaluationNode — runs the reasoning layer (mock or Claude) over the request
 * and criteria, producing a confidence score, a recommendation, per-criterion
 * results, and any missing items. The confidence score is what gates the trust
 * boundary downstream, so a low-signal evaluation is surfaced rather than
 * smoothed over.
 */
export async function evaluationNode(
  state: PayerState,
): Promise<Partial<PayerState>> {
  const reasoner = getReasoner();
  const evaluation = await reasoner.evaluate({
    request: state.request,
    criteria: state.criteria,
    turn: state.turn,
  });
  return { evaluation };
}
