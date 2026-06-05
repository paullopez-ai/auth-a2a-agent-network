import type { ProviderState, ProviderStatus } from "../state.ts";

/**
 * ResponseHandlerNode — interprets the Payer's determination and decides the
 * next move. This is the branch point of the Provider pipeline:
 *   needs-more-info     → route to AppealNode (auto-construct supplemental docs)
 *   needs-human-review  → stop; a human must decide on the Payer task
 *   approved / denied   → terminal
 */
export function responseHandlerNode(
  state: ProviderState,
): Partial<ProviderState> {
  const det = state.determination;
  if (!det) {
    return {
      status: "unresolved",
      transcript: ["✗ no determination returned by Payer"],
    };
  }

  switch (det.outcome) {
    case "needs-more-info":
      return {
        needsAppeal: true,
        transcript: [
          `← Payer requires more info: ${det.missingItems.join("; ")}`,
          "→ routing to AppealNode",
        ],
      };
    case "needs-human-review":
      return {
        status: "pending-human",
        transcript: [
          "← Payer routed to human review (Supervised band, confidence " +
            `${det.confidence}); awaiting human decision on Payer task ` +
            `${state.payerTaskId}`,
        ],
      };
    default:
      return {
        status: det.outcome as ProviderStatus,
        transcript: [`← determination: ${det.outcome} (confidence ${det.confidence})`],
      };
  }
}

/** Conditional edge target after ResponseHandlerNode. */
export function routeAfterResponse(state: ProviderState): "appeal" | "done" {
  return state.needsAppeal && !state.appealed ? "appeal" : "done";
}
