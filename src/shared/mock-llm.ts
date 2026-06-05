import type {
  AppealInput,
  AppealResult,
  EvaluationInput,
  EvaluationResult,
  Reasoner,
} from "./reasoning.ts";
import type { CriterionResult } from "./types/determination.ts";

/**
 * Deterministic, scenario-keyed mock reasoner. MOCK_LLM=true selects this.
 *
 * Why deterministic-by-scenario: in a high-stakes domain the most dangerous
 * test failure is a fluent-but-wrong LLM answer that happens to pass. Keying
 * responses to scenario id removes the model from the test loop entirely, so a
 * green suite means the *pipeline wiring* is correct, not that the LLM guessed
 * right. The documented expected paths in the PRD are encoded here exactly.
 */

function criteriaResults(
  input: EvaluationInput,
  overrides: Record<string, boolean> = {},
): CriterionResult[] {
  const list = input.criteria?.criteria ?? [];
  return list.map((c) => {
    const docPresent = (c.satisfiedByDocs ?? []).some((kind) =>
      input.request.documents.some((d) => d.kind === kind),
    );
    const met = overrides[c.criterionId] ?? docPresent;
    return {
      criterionId: c.criterionId,
      description: c.description,
      met,
      note: met ? "Satisfied by submitted documentation" : "Not evidenced in package",
    };
  });
}

export class MockReasoner implements Reasoner {
  readonly name = "mock-llm";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const scenario = input.request.scenarioId ?? "default";

    switch (scenario) {
      // Scenario 1 — clean approval, one round trip, autonomous band.
      case "scenario-1-clean-approval":
        return {
          confidence: 0.91,
          recommendation: "approve",
          rationale:
            "Office visit (CPT 99213) with complete encounter documentation. " +
            "No prior authorization barrier; criteria satisfied on first pass.",
          criteriaEvaluated: criteriaResults(input),
          missingItems: [],
        };

      // Scenario 2 — denial/appeal. Turn 1 lacks conservative-treatment
      // history → request-info; turn 2 (after appeal) approves.
      case "scenario-2-denial-appeal":
        if (input.turn >= 2) {
          return {
            confidence: 0.88,
            recommendation: "approve",
            rationale:
              "Supplemental package now documents 4 months of failed conservative " +
              "treatment (PT + NSAIDs). Imaging confirms KL grade 4 osteoarthritis. " +
              "All criteria for CPT 27447 met.",
            criteriaEvaluated: criteriaResults(input, {
              "27447-conservative": true,
            }),
            missingItems: [],
          };
        }
        return {
          confidence: 0.72,
          recommendation: "request-info",
          rationale:
            "Total knee arthroplasty (CPT 27447) requires documented failed " +
            "conservative treatment. The submitted package does not include a " +
            "conservative-treatment-history document. Pending additional records.",
          criteriaEvaluated: criteriaResults(input, {
            "27447-conservative": false,
          }),
          missingItems: [
            "Documentation of 3+ months of failed conservative treatment (PT, NSAIDs, or injections)",
          ],
        };

      // Scenario 3 — ambiguous medical necessity → human review band.
      case "scenario-3-human-review":
        return {
          confidence: 0.65,
          recommendation: "refer-human",
          rationale:
            "Upper GI endoscopy (CPT 43239) documentation is ambiguous on whether " +
            "4+ weeks of PPI therapy failed before escalation. Medical necessity is " +
            "plausible but not clearly established. Confidence 0.65 falls in the " +
            "supervised band; routing to human review.",
          criteriaEvaluated: criteriaResults(input, {
            "43239-necessity": false,
          }),
          missingItems: [],
        };

      default:
        return {
          confidence: 0.9,
          recommendation: "approve",
          rationale: "Default mock evaluation: criteria satisfied.",
          criteriaEvaluated: criteriaResults(input),
          missingItems: [],
        };
    }
  }

  async buildAppeal(input: AppealInput): Promise<AppealResult> {
    return {
      supplementalDocuments: [
        {
          kind: "conservative-treatment-history",
          title: "Conservative Treatment History",
          content:
            "Patient completed 16 weeks of physical therapy (2x/week) and a trial " +
            "of NSAIDs (meloxicam 15mg daily) with documented inadequate relief. " +
            "Intra-articular corticosteroid injection x2 with transient benefit only.",
        },
      ],
      note:
        "Supplemental conservative-treatment-history attached in response to " +
        "input-required. Re-submitting on the same A2A task for re-evaluation.",
    };
  }
}
