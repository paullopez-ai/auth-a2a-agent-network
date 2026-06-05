import express from "express";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { payerAgentCard } from "./agent-card.ts";
import { PayerAgentExecutor } from "./executor.ts";

/**
 * Payer Agent A2A server. Independent Express process; the only way in is the
 * A2A protocol. Serves its Agent Card at /.well-known/agent-card.json and the
 * JSON-RPC surface at the root.
 */
const PORT = Number(process.env.PAYER_PORT ?? 4002);

const requestHandler = new DefaultRequestHandler(
  payerAgentCard,
  new InMemoryTaskStore(),
  new PayerAgentExecutor(),
);

const app = express();
new A2AExpressApp(requestHandler).setupRoutes(app);

app.listen(PORT, () => {
  const mode = process.env.MOCK_LLM === "true" ? "MOCK_LLM" : "live-claude";
  console.log(`[payer] A2A agent listening on http://localhost:${PORT} (${mode})`);
  console.log(`[payer] agent card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
