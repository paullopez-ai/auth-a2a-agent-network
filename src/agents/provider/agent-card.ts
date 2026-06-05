import type { AgentCard } from "@a2a-js/sdk";

const PROVIDER_PORT = process.env.PROVIDER_PORT ?? "4001";
const PROVIDER_URL =
  process.env.PROVIDER_URL ?? `http://localhost:${PROVIDER_PORT}`;

/**
 * Provider Agent Card — served at /.well-known/agent-card.json on the Provider
 * port. The Provider is both an A2A server (it accepts submission requests) and
 * an A2A client (it negotiates with the Payer). This card advertises the
 * server side.
 */
export const providerAgentCard: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Provider Authorization Agent",
  description:
    "Builds prior-authorization request packages, submits them to a Payer agent " +
    "over A2A, and negotiates multi-turn appeals (input-required) on the member's " +
    "behalf. Surfaces the Payer's determination with full audit trail.",
  url: PROVIDER_URL,
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
      id: "submit-authorization",
      name: "Submit Authorization Request",
      description:
        "Build and submit a prior-authorization request to a Payer agent and " +
        "negotiate the determination, including automatic appeal of input-required.",
      tags: ["healthcare", "prior-authorization", "a2a-client"],
      examples: [
        "Submit a total knee arthroplasty request and appeal if more records are needed.",
        "Submit an office-visit authorization and return the determination.",
      ],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
};
