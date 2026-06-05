import { AuthRequestSchema } from "../../../../shared/types/auth-request.ts";
import type { PayerState } from "../state.ts";

/**
 * RequestParseNode — validates the inbound authorization request against the
 * shared schema. A malformed request fails fast here rather than producing a
 * plausible-but-wrong determination downstream.
 */
export function requestParseNode(state: PayerState): Partial<PayerState> {
  const parsed = AuthRequestSchema.parse(state.request);
  return { request: parsed };
}
