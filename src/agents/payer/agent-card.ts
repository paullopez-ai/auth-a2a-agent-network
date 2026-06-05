import type { AgentCard } from "@a2a-js/sdk";

const PAYER_PORT = process.env.PAYER_PORT ?? "4002";
const PAYER_URL = process.env.PAYER_URL ?? `http://localhost:${PAYER_PORT}`;

/**
 * Payer Agent Card — the machine-readable capability spec served at
 * /.well-known/agent-card.json. This is the interface the Provider discovers
 * via ClientFactory; neither agent knows the other's implementation.
 */
export const payerAgentCard: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Payer Authorization Agent",
  description:
    "Evaluates prior-authorization requests against clinical criteria and " +
    "returns structured determinations with confidence, rationale, and a trust " +
    "boundary classification. Supports multi-turn negotiation (input-required) " +
    "and human-in-the-loop review for ambiguous cases.",
  url: PAYER_URL,
  version: "1.0.0",
  preferredTransport: "JSONRPC",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["application/json", "text/plain"],
  defaultOutputModes: ["application/json", "text/plain"],
  skills: [
    {
      id: "evaluate-authorization",
      name: "Evaluate Authorization Request",
      description:
        "Evaluate a prior-authorization request against coverage criteria and " +
        "return an approve/deny/needs-info/needs-human determination.",
      tags: ["healthcare", "prior-authorization", "claims"],
      examples: [
        "Evaluate CPT 27447 (total knee arthroplasty) for a Medicare Advantage member.",
        "Re-evaluate an appealed request with supplemental conservative-treatment records.",
      ],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
};
