import type { PayerState } from "../state.ts";
import { DeterminationSchema } from "../../../../shared/types/determination.ts";

/**
 * ResponseNode — the terminal node. Validates the determination against the
 * shared schema so the Payer never emits a structurally invalid artifact, and
 * leaves it in state for the executor to package as the A2A determination
 * artifact. This is the single typed output surface of the Payer pipeline.
 */
export function responseNode(state: PayerState): Partial<PayerState> {
  if (!state.determination) {
    throw new Error("ResponseNode reached without a determination");
  }
  const determination = DeterminationSchema.parse(state.determination);
  return { determination };
}
