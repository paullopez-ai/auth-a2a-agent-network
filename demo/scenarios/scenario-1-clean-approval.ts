/**
 * Scenario 1 — Clean Approval.
 * CPT 99213 office visit, complete documentation. Provider submits, Payer
 * evaluates (confidence 0.91, Autonomous band), approves in one round trip.
 */
import {
  banner,
  printDetermination,
  submitToProvider,
} from "./_shared.ts";
import { scenario1Request } from "./_data.ts";

async function main() {
  banner("SCENARIO 1 · Clean Approval (CPT 99213)");
  console.log("\n  Provider → Payer over A2A:\n");

  const { state, result } = await submitToProvider(scenario1Request);

  printDetermination(result?.determination);
  console.log(`\n  Provider task: ${state} · outcome: ${result?.status}`);

  const ok = state === "completed" && result?.status === "approved";
  console.log(`\n  ${ok ? "✓ PASS" : "✗ FAIL"} — expected completed/approved\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Scenario 1 error:", err);
  process.exit(1);
});
