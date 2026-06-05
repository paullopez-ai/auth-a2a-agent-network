import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from "@a2a-js/sdk/server";
import type {
  Task,
  TaskState,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "@a2a-js/sdk";
import { buildPayerGraph, type PayerGraph } from "./pipeline/graph.ts";
import type { PayerState } from "./pipeline/state.ts";
import {
  InboundPayloadSchema,
  buildArtifact,
  firstDataPart,
} from "../../shared/types/a2a-artifacts.ts";
import type { AuthRequest } from "../../shared/types/auth-request.ts";
import type { Determination } from "../../shared/types/determination.ts";

interface PendingTask {
  request: AuthRequest;
  contextId: string;
  pause: "human" | "info";
  turn: number;
}

/**
 * PayerAgentExecutor — bridges the A2A task lifecycle to the LangGraph pipeline.
 *
 * Outcome → A2A state mapping (this is where the protocol earns its keep):
 *   approved / denied          → completed
 *   needs-more-info            → input-required (Provider should appeal)
 *   needs-human-review         → input-required (awaiting a human decision)
 *
 * Every response — including the two input-required pauses — carries a typed
 * determination artifact with confidence, rationale, criteria, trust boundary,
 * decided-by, and timestamp. That is the audit trail (Skill 5).
 */
export class PayerAgentExecutor implements AgentExecutor {
  private graph: PayerGraph = buildPayerGraph();
  private pending = new Map<string, PendingTask>();

  async execute(
    ctx: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const taskId = ctx.taskId;
    const contextId = ctx.contextId;

    try {
      const raw = firstDataPart(ctx.userMessage.parts);
      const payload = InboundPayloadSchema.parse(raw);

      // Establish the task on first contact; emit working for every turn.
      if (!ctx.task) {
        eventBus.publish(this.initialTask(ctx));
      }
      this.publishStatus(eventBus, taskId, contextId, "working", false);

      let determination: Determination;

      if (payload.kind === "auth-request") {
        determination = await this.runInitial(taskId, contextId, payload.request);
      } else if (payload.kind === "appeal") {
        determination = await this.runAppeal(taskId, payload);
      } else {
        determination = await this.runHumanDecision(taskId, payload);
      }

      // Always emit the determination artifact (audit trail), then the final
      // status mapped from the outcome.
      eventBus.publish(
        this.artifactEvent(taskId, contextId, determination),
      );
      this.publishFinal(eventBus, taskId, contextId, determination);
    } catch (err) {
      // Explicit failure — never a silent drop, never a fake `completed`.
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
    this.pending.delete(taskId);
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId: taskId,
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    eventBus.finished();
  }

  // --- pipeline drivers -----------------------------------------------------

  private async runInitial(
    taskId: string,
    contextId: string,
    request: AuthRequest,
  ): Promise<Determination> {
    const config = { configurable: { thread_id: taskId } };
    await this.graph.invoke({ request, turn: 1 }, config);
    const snapshot = await this.graph.getState(config);
    const state = snapshot.values as PayerState;

    if (snapshot.next.includes("humanReview")) {
      // Interrupted before HumanReviewNode — Supervised band, awaiting a human.
      this.pending.set(taskId, { request, contextId, pause: "human", turn: 1 });
      return required(state.determination);
    }

    const determination = required(state.determination);
    if (determination.outcome === "needs-more-info") {
      this.pending.set(taskId, { request, contextId, pause: "info", turn: 1 });
    }
    return determination;
  }

  private async runAppeal(
    taskId: string,
    payload: { requestId: string; supplementalDocuments: Array<{ kind: string; title: string; content: string }> },
  ): Promise<Determination> {
    const prior = this.pending.get(taskId);
    if (!prior || prior.pause !== "info") {
      throw new Error(`No pending input-required task to appeal for ${taskId}`);
    }
    const turn = prior.turn + 1;
    const mergedRequest: AuthRequest = {
      ...prior.request,
      documents: [
        ...prior.request.documents,
        ...payload.supplementalDocuments.map((d) => ({
          kind: d.kind as AuthRequest["documents"][number]["kind"],
          title: d.title,
          content: d.content,
        })),
      ],
    };
    // Fresh thread for the re-evaluation turn (the prior run reached END).
    const config = { configurable: { thread_id: `${taskId}:t${turn}` } };
    const result = (await this.graph.invoke(
      { request: mergedRequest, turn },
      config,
    )) as PayerState;
    this.pending.delete(taskId);
    return required(result.determination);
  }

  private async runHumanDecision(
    taskId: string,
    payload: { approve: boolean; reviewer: string; note?: string },
  ): Promise<Determination> {
    const prior = this.pending.get(taskId);
    if (!prior || prior.pause !== "human") {
      throw new Error(`No pending human-review task for ${taskId}`);
    }
    const config = { configurable: { thread_id: taskId } };
    // Inject the human decision, then resume past the interrupt.
    await this.graph.updateState(config, {
      humanDecision: {
        approve: payload.approve,
        reviewer: payload.reviewer,
        note: payload.note,
      },
    });
    const result = (await this.graph.invoke(null, config)) as PayerState;
    this.pending.delete(taskId);
    return required(result.determination);
  }

  // --- A2A event helpers ----------------------------------------------------

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
    const event: TaskStatusUpdateEvent = {
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
    };
    eventBus.publish(event);
  }

  private publishFinal(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    determination: Determination,
  ): void {
    const { state, message } = mapOutcome(determination);
    this.publishStatus(eventBus, taskId, contextId, state, true, message);
  }

  private artifactEvent(
    taskId: string,
    contextId: string,
    determination: Determination,
  ): TaskArtifactUpdateEvent {
    const summary =
      `Determination: ${determination.outcome} ` +
      `(confidence ${determination.confidence}, ${determination.trustBoundary})`;
    return {
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: buildArtifact(
        "determination",
        { kind: "determination", determination },
        summary,
      ),
      append: false,
      lastChunk: true,
    };
  }
}

function required(d: Determination | undefined): Determination {
  if (!d) throw new Error("Pipeline finished without a determination");
  return d;
}

/** Maps a determination outcome to its terminal A2A state + status message. */
function mapOutcome(d: Determination): { state: TaskState; message: string } {
  switch (d.outcome) {
    case "approved":
    case "denied":
      return { state: "completed", message: `Determination: ${d.outcome}.` };
    case "needs-more-info":
      return {
        state: "input-required",
        message:
          "Additional documentation required: " +
          d.missingItems.join("; ") +
          ". Resubmit on this task with the supplemental records.",
      };
    case "needs-human-review":
      return {
        state: "input-required",
        message:
          "Confidence in the Supervised band — awaiting human review decision " +
          "on this task before finalizing.",
      };
  }
}
