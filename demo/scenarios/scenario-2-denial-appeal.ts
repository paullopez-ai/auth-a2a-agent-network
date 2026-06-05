/**
 * Scenario 2 — Denial with Appeal (PRIMARY interview scenario).
 * CPT 27447 total knee arthroplasty, missing conservative-treatment history.
 * Provider submits → Payer returns `input-required` → Provider's AppealNode
 * constructs a supplemental package and resubmits ON THE SAME TASK ID → Payer
 * re-evaluates → approved. One task id tracks the entire negotiation.
 */
import {
  banner,
  printDetermination,
  submitToProvider,
} from "./_shared.ts";
import { scenario2Request } from "./_data.ts";

async function main() {
  banner("SCENARIO 2 · Denial with Appeal (CPT 27447)");
  console.log(
    "\n  Watch the task move: submitted → working → input-required →\n" +
      "  (appeal on same task id) → working → completed\n",
  );

  const { state, result } = await submitToProvider(scenario2Request);

  console.log("\n  ── Full A2A transcript (Provider ↔ Payer) ───────────────");
  for (const line of result?.transcript ?? []) console.log("     " + line);

  printDetermination(result?.determination);
  console.log(`\n  Provider task: ${state} · outcome: ${result?.status}`);

  const ok = state === "completed" && result?.status === "approved";
  console.log(
    `\n  ${ok ? "✓ PASS" : "✗ FAIL"} — expected completed/approved after appeal\n`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Scenario 2 error:", err);
  process.exit(1);
});
