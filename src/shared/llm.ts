import Anthropic from "@anthropic-ai/sdk";
import type {
  AppealInput,
  AppealResult,
  EvaluationInput,
  EvaluationResult,
  Reasoner,
} from "./reasoning.ts";
import { MockReasoner } from "./mock-llm.ts";

/**
 * Live Claude reasoner. Used only when MOCK_LLM is not "true". Prompts Claude
 * for a strict JSON object and parses it. USE_BEDROCK routes through Amazon
 * Bedrock instead of the direct Anthropic API (Hyperscaler track); the wiring
 * point is marked below.
 */
class ClaudeReasoner implements Reasoner {
  readonly name: string;
  private client: Anthropic;
  private model: string;

  constructor() {
    const useBedrock = process.env.USE_BEDROCK === "true";
    this.name = useBedrock ? "claude-bedrock" : "claude-anthropic";
    // NOTE: For Bedrock, swap in AnthropicBedrock from @anthropic-ai/bedrock-sdk
    // (reads AWS creds + region from the environment). Direct API otherwise.
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = useBedrock
      ? process.env.BEDROCK_MODEL_ID ??
        "anthropic.claude-3-5-sonnet-20241022-v2:0"
      : "claude-sonnet-4-6";
  }

  private async json<T>(system: string, user: string): Promise<T> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM did not return JSON");
    return JSON.parse(match[0]) as T;
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const system =
      "You are a payer prior-authorization reviewer. Evaluate the request " +
      "against the criteria and respond ONLY with JSON: {confidence:number 0-1, " +
      "recommendation:'approve'|'deny'|'request-info'|'refer-human', rationale:string, " +
      "criteriaEvaluated:[{criterionId,description,met:boolean,note}], missingItems:string[]}.";
    return this.json<EvaluationResult>(
      system,
      JSON.stringify({
        request: input.request,
        criteria: input.criteria,
        turn: input.turn,
      }),
    );
  }

  async buildAppeal(input: AppealInput): Promise<AppealResult> {
    const system =
      "You are a provider authorization specialist. Construct a supplemental " +
      "document package answering the payer's missing items. Respond ONLY with " +
      "JSON: {supplementalDocuments:[{kind,title,content}], note:string}.";
    return this.json<AppealResult>(system, JSON.stringify(input));
  }
}

let cached: Reasoner | undefined;

/** Returns the mock reasoner under MOCK_LLM=true, else the live Claude one. */
export function getReasoner(): Reasoner {
  if (!cached) {
    cached =
      process.env.MOCK_LLM === "true" ? new MockReasoner() : new ClaudeReasoner();
  }
  return cached;
}

/** Test/seam helper: force a specific reasoner (or reset with undefined). */
export function setReasoner(r: Reasoner | undefined): void {
  cached = r;
}
