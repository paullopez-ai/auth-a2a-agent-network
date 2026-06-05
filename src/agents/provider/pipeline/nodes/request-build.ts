import { v4 as uuidv4 } from "uuid";
import { AuthRequestSchema } from "../../../../shared/types/auth-request.ts";
import type { ProviderState } from "../state.ts";

/**
 * RequestBuildNode — assembles the canonical authorization request from the
 * seed inputs, assigning a request id if one was not supplied and validating
 * the shape before anything is sent over the wire.
 */
export function requestBuildNode(state: ProviderState): Partial<ProviderState> {
  const request = AuthRequestSchema.parse({
    ...state.request,
    requestId: state.request.requestId || `req-${uuidv4().slice(0, 8)}`,
  });
  return {
    request,
    transcript: [
      `→ building request ${request.requestId}: CPT ${request.cptCode} ` +
        `(${request.cptDescription}), ${request.planType}`,
    ],
  };
}
