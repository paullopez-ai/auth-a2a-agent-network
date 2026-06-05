/**
 * Scenario 3 — Human Review Intercept.
 * CPT 43239 upper GI endoscopy, ambiguous medical necessity. Payer's
 * EvaluationNode yields confidence 0.65 → HumanReviewNode interrupt-before
 * fires (Supervised band) → task pauses in `input-required`. A human reviewer
 * decides; here the CLI plays the reviewer (resolving PRD open question #2:
 * Scenario 3 is demonstrable without the Review UI). The decision is sent to
 * the Payer on the same task and the determination finalizes.
 */
import {
  banner,
  printDetermination,
  sendHumanDecisionToPayer,
  submitToProvider,
} from "./_shared.ts";
import { scenario3Request } from "./_data.ts";

async function main() {
  banner("SCENARIO 3 · Human Review Intercept (CPT 43239)");
  console.log("\n  Step 1 — Provider submits; Payer routes to human review:\n");

  const { state, result } = await submitToProvider(scenario3Request);
  printDetermination(result?.determination);

  if (state !== "input-required" || result?.status !== "pending-human") {
    console.log(`\n  ✗ FAIL — expected input-required/pending-human, got ${state}/${result?.status}\n`);
    process.exit(1);
  }
  if (!result.payerTaskId || !result.payerContextId) {
    console.log("\n  ✗ FAIL — Provider did not surface Payer task linkage\n");
    process.exit(1);
  }

  console.log(
    `\n  HumanReviewNode interrupt fired on Payer task ${result.payerTaskId.slice(0, 8)}.` +
      "\n  (In the full demo this surfaces in the Review UI; here the CLI decides.)",
  );
  console.log("\n  Step 2 — Human reviewer 'Dr. Reyes' approves:\n");

  const decision = await sendHumanDecisionToPayer(
    result.payerTaskId,
    result.payerContextId,
    {
      approve: true,
      reviewer: "Dr. Reyes",
      note: "PPI trial confirmed adequate on chart review; necessity established.",
    },
    scenario3Request.requestId,
  );

  printDetermination(decision.determination);

  const det = decision.determination;
  const ok =
    decision.state === "completed" &&
    det?.outcome === "approved" &&
    String(det?.decidedBy).startsWith("human:");
  console.log(
    `\n  ${ok ? "✓ PASS" : "✗ FAIL"} — expected completed/approved by a named human\n`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Scenario 3 error:", err);
  process.exit(1);
});
