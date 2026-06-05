import type { ProviderState, ProviderStatus } from "../state.ts";
import { getReasoner } from "../../../../shared/llm.ts";
import { sendAndCollect } from "../../a2a-client.ts";
import { buildMessage } from "../../../../shared/types/a2a-artifacts.ts";

/**
 * AppealNode — multi-turn A2A continuation. When the Payer returns
 * input-required for missing documentation, this node constructs a supplemental
 * package and sends it back ON THE SAME TASK ID (and context id). The Payer
 * resumes evaluation from that state rather than starting over — the whole
 * point of A2A's stateful task model.
 */
export async function appealNode(
  state: ProviderState,
): Promise<Partial<ProviderState>> {
  const missingItems = state.determination?.missingItems ?? [];
  const reasoner = getReasoner();
  const appeal = await reasoner.buildAppeal({
    request: state.request,
    missingItems,
  });

  const message = buildMessage(
    {
      kind: "appeal",
      requestId: state.request.requestId,
      supplementalDocuments: appeal.supplementalDocuments,
      note: appeal.note,
    },
    "Appeal with supplemental documentation",
    { taskId: state.payerTaskId, contextId: state.payerContextId },
  );

  const result = await sendAndCollect(message);
  const det = result.determination;

  return {
    appealed: true,
    needsAppeal: false,
    determination: det,
    status: (det?.outcome as ProviderStatus) ?? "unresolved",
    transcript: [
      `→ AppealNode: resubmitting on task ${state.payerTaskId} with ` +
        `${appeal.supplementalDocuments.length} supplemental doc(s)`,
      ...result.transcript,
    ],
  };
}
