import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from "@a2a-js/sdk/server";
import type {
  Task,
  TaskState,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import { buildProviderGraph, type ProviderGraph } from "./pipeline/graph.ts";
import type { ProviderState } from "./pipeline/state.ts";
import { AuthRequestPayloadSchema, buildArtifact, firstDataPart } from "../../shared/types/a2a-artifacts.ts";

/**
 * ProviderAgentExecutor — runs the Provider pipeline when an auth-request
 * arrives. The pipeline performs the real A2A negotiation with the Payer; this
 * executor reports the outcome on the Provider's own task.
 *
 * Provider status → A2A state:
 *   approved / denied  → completed
 *   pending-human      → input-required (a human must still decide on the Payer
 *                        task; the artifact carries the Payer task linkage)
 *   unresolved         → failed
 */
export class ProviderAgentExecutor implements AgentExecutor {
  private graph: ProviderGraph = buildProviderGraph();

  async execute(
    ctx: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { taskId, contextId } = ctx;
    try {
      const payload = AuthRequestPayloadSchema.parse(
        firstDataPart(ctx.userMessage.parts),
      );

      if (!ctx.task) eventBus.publish(this.initialTask(ctx));
      this.publishStatus(eventBus, taskId, contextId, "working", false);

      const result = (await this.graph.invoke({
        request: payload.request,
      })) as ProviderState;

      for (const line of result.transcript) console.log(`[provider] ${line}`);

      eventBus.publish({
        kind: "artifact-update",
        taskId,
        contextId,
        artifact: buildArtifact(
          "provider-result",
          {
            kind: "provider-result",
            status: result.status,
            determination: result.determination,
            payerTaskId: result.payerTaskId,
            payerContextId: result.payerContextId,
            transcript: result.transcript,
          },
          `Provider result: ${result.status}`,
        ),
        append: false,
        lastChunk: true,
      });

      const { state, message } = this.mapStatus(result);
      this.publishStatus(eventBus, taskId, contextId, state, true, message);
    } catch (err) {
      this.publishStatus(
        eventBus,
        taskId,
        contextId,
        "failed",
        true,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      eventBus.finished();
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId: taskId,
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    eventBus.finished();
  }

  private mapStatus(result: ProviderState): { state: TaskState; message: string } {
    switch (result.status) {
      case "approved":
      case "denied":
        return { state: "completed", message: `Determination: ${result.status}.` };
      case "pending-human":
        return {
          state: "input-required",
          message:
            "Payer routed to human review. A human decision is required on Payer " +
            `task ${result.payerTaskId} before this authorization can finalize.`,
        };
      default:
        return { state: "failed", message: "Authorization could not be resolved." };
    }
  }

  private initialTask(ctx: RequestContext): Task {
    return {
      kind: "task",
      id: ctx.taskId,
      contextId: ctx.contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [ctx.userMessage],
      artifacts: [],
    };
  }

  private publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: TaskState,
    final: boolean,
    message?: string,
  ): void {
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state,
        timestamp: new Date().toISOString(),
        ...(message
          ? {
              message: {
                kind: "message",
                role: "agent",
                messageId: `${taskId}-${state}`,
                parts: [{ kind: "text", text: message }],
                taskId,
                contextId,
              },
            }
          : {}),
      },
      final,
    } satisfies TaskStatusUpdateEvent);
  }
}
