import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Optional orchestrator — starts both agents in one process for convenience.
 * The two-terminal flow in the README is the canonical demo; this is a
 * single-command alternative (`bun run src/orchestrator/index.ts`).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function start(name: string, entry: string, port: string) {
  const child = spawn("bun", ["run", entry], {
    cwd: root,
    env: { ...process.env, MOCK_LLM: process.env.MOCK_LLM ?? "true" },
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    console.log(`[orchestrator] ${name} (port ${port}) exited with code ${code}`);
  });
  return child;
}

console.log("[orchestrator] starting Payer (4002) then Provider (4001)…");
const payer = start("payer", "src/agents/payer/server.ts", "4002");

// Give the Payer a moment so the Provider discovers it cleanly at startup.
setTimeout(() => start("provider", "src/agents/provider/server.ts", "4001"), 1000);

function shutdown() {
  console.log("\n[orchestrator] shutting down…");
  payer.kill("SIGINT");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
