import { Annotation } from "@langchain/langgraph";
import type { AuthRequest } from "../../../shared/types/auth-request.ts";
import type { Determination } from "../../../shared/types/determination.ts";
import type { EvaluationResult } from "../../../shared/reasoning.ts";
import type { CoverageCriteria } from "../../../shared/criteria/embedded-synthetic.ts";

/** Human decision injected on resume to clear a HumanReviewNode interrupt. */
export interface HumanDecision {
  approve: boolean;
  reviewer: string;
  note?: string;
}

/**
 * Typed LangGraph state for the Payer pipeline. Each node returns a
 * Partial<PayerState>; the channels below are last-write-wins reducers.
 */
export const PayerStateAnnotation = Annotation.Root({
  request: Annotation<AuthRequest>(),
  /** 1 on initial submission, incremented when an appeal supplies more docs. */
  turn: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 1,
  }),
  criteria: Annotation<CoverageCriteria | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  criteriaSource: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "none",
  }),
  evaluation: Annotation<EvaluationResult | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  determination: Annotation<Determination | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  /** Present only after a human resolves a Supervised interrupt. */
  humanDecision: Annotation<HumanDecision | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type PayerState = typeof PayerStateAnnotation.State;
