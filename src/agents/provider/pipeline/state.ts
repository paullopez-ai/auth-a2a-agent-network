import { Annotation } from "@langchain/langgraph";
import type { AuthRequest } from "../../../shared/types/auth-request.ts";
import type { Determination } from "../../../shared/types/determination.ts";

/** Where the Provider's orchestration ended up. */
export type ProviderStatus =
  | "submitting"
  | "approved"
  | "denied"
  | "pending-human"
  | "unresolved";

/**
 * Typed LangGraph state for the Provider pipeline. The Provider acts as an A2A
 * *client* to the Payer; this state carries the request out and the Payer's
 * determination back, plus the task linkage needed to continue the negotiation.
 */
export const ProviderStateAnnotation = Annotation.Root({
  request: Annotation<AuthRequest>(),
  determination: Annotation<Determination | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  status: Annotation<ProviderStatus>({
    reducer: (_prev, next) => next,
    default: () => "submitting",
  }),
  /** Payer-side task identifiers, for appeals and human-review continuation. */
  payerTaskId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  payerContextId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  needsAppeal: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  appealed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  /** Human-readable log of the A2A exchange, surfaced to the demo/UI. */
  transcript: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type ProviderState = typeof ProviderStateAnnotation.State;
