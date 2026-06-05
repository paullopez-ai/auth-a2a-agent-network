import type { AuthRequest, ClinicalDocument } from "./types/auth-request.ts";
import type { CriterionResult } from "./types/determination.ts";
import type { CoverageCriteria } from "./criteria/embedded-synthetic.ts";

/**
 * The reasoning layer is abstracted behind a `Reasoner` interface so the
 * pipelines never call an LLM directly. `MOCK_LLM=true` swaps in deterministic,
 * scenario-keyed responses (required for the Demo track and all tests);
 * otherwise a real Claude reasoner is used.
 */

export type Recommendation =
  | "approve"
  | "deny"
  | "request-info"
  | "refer-human";

export interface EvaluationInput {
  request: AuthRequest;
  criteria: CoverageCriteria | undefined;
  /** 1 on first submission, 2+ after an appeal supplies more documents. */
  turn: number;
}

export interface EvaluationResult {
  confidence: number;
  recommendation: Recommendation;
  rationale: string;
  criteriaEvaluated: CriterionResult[];
  /** Human-readable items the Provider must supply (request-info only). */
  missingItems: string[];
}

export interface AppealInput {
  request: AuthRequest;
  missingItems: string[];
}

export interface AppealResult {
  supplementalDocuments: ClinicalDocument[];
  note: string;
}

export interface Reasoner {
  readonly name: string;
  /** Payer: evaluate a request against criteria. */
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
  /** Provider: construct a supplemental package answering an input-required. */
  buildAppeal(input: AppealInput): Promise<AppealResult>;
}
