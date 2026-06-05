import express from "express";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { providerAgentCard } from "./agent-card.ts";
import { ProviderAgentExecutor } from "./executor.ts";
import { getPayerClient } from "./a2a-client.ts";

/**
 * Provider Agent A2A server. Serves its Agent Card on the Provider port and, at
 * startup, discovers the Payer agent via ClientFactory (resolving the Payer's
 * Agent Card). This is the discovery step the success criteria call for.
 */
const PORT = Number(process.env.PROVIDER_PORT ?? 4001);

const requestHandler = new DefaultRequestHandler(
  providerAgentCard,
  new InMemoryTaskStore(),
  new ProviderAgentExecutor(),
);

const app = express();
new A2AExpressApp(requestHandler).setupRoutes(app);

app.listen(PORT, async () => {
  const mode = process.env.MOCK_LLM === "true" ? "MOCK_LLM" : "live-claude";
  console.log(`[provider] A2A agent listening on http://localhost:${PORT} (${mode})`);
  console.log(`[provider] agent card: http://localhost:${PORT}/.well-known/agent-card.json`);
  try {
    const client = await getPayerClient();
    const card = await client.getAgentCard();
    console.log(`[provider] discovered Payer agent: "${card.name}" at ${card.url}`);
  } catch (err) {
    console.warn(
      `[provider] could not discover Payer agent yet: ${
        err instanceof Error ? err.message : String(err)
      } (will retry on first request)`,
    );
  }
});
