import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface RunningAgents {
  providerUrl: string;
  payerUrl: string;
  stop: () => void;
}

async function waitForCard(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/.well-known/agent-card.json`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`agent at ${url} did not become ready in ${timeoutMs}ms`);
}

function spawnAgent(entry: string, env: Record<string, string>): ChildProcess {
  return spawn("bun", ["run", entry], {
    cwd: root,
    env: {
      ...process.env,
      MOCK_LLM: "true",
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      ...env,
    },
    stdio: "ignore",
  });
}

/**
 * Starts the Payer and Provider A2A servers on dedicated test ports and waits
 * until both Agent Cards are reachable. The Provider is told the Payer's URL so
 * it discovers it at startup — exactly the production wiring, just on localhost.
 */
export async function startAgents(
  payerPort = 14002,
  providerPort = 14001,
): Promise<RunningAgents> {
  const payerUrl = `http://localhost:${payerPort}`;
  const providerUrl = `http://localhost:${providerPort}`;

  const payer = spawnAgent("src/agents/payer/server.ts", {
    PAYER_PORT: String(payerPort),
    PAYER_URL: payerUrl,
  });
  const provider = spawnAgent("src/agents/provider/server.ts", {
    PROVIDER_PORT: String(providerPort),
    PROVIDER_URL: providerUrl,
    PAYER_URL: payerUrl,
  });

  await Promise.all([waitForCard(payerUrl), waitForCard(providerUrl)]);

  return {
    providerUrl,
    payerUrl,
    stop: () => {
      payer.kill("SIGKILL");
      provider.kill("SIGKILL");
    },
  };
}
