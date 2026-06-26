import type { ProviderState } from "../state.ts";
import { sendAndCollect } from "../../a2a-client.ts";
import { buildMessage } from "../../../../shared/types/a2a-artifacts.ts";
import { OUT } from "../transcript-style.ts";

/**
 * A2ASubmitNode — the protocol hop. Sends the authorization request to the
 * Payer agent and subscribes to its SSE event stream until a terminal state,
 * recording the Payer's task id (for any follow-up on the same task) and the
 * returned determination. SSE timeout + retry live in `sendAndCollect`.
 */
export async function a2aSubmitNode(
  state: ProviderState,
): Promise<Partial<ProviderState>> {
  const message = buildMessage(
    { kind: "auth-request", request: state.request },
    `Prior authorization request for CPT ${state.request.cptCode}`,
  );

  const result = await sendAndCollect(message);

  return {
    payerTaskId: result.taskId,
    payerContextId: result.contextId,
    determination: result.determination,
    transcript: [
      `${OUT} A2A sendMessage ${OUT} Payer (subscribed to SSE stream)`,
      ...result.transcript,
    ],
  };
}
