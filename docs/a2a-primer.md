# A2A in 90 seconds

**A2A (Agent-to-Agent)** is an open protocol for one AI agent to call another
over standard HTTP — without sharing code, memory, or framework. It is governed
by the Linux Foundation and has broad enterprise adoption in 2026.

## The three things that matter here

1. **Agent Card** — a machine-readable capability spec served at
   `/.well-known/agent-card.json`. It advertises the agent's name, URL, skills,
   transports, and input/output modes. A client *discovers* an agent by fetching
   its card (`ClientFactory.createFromUrl()`), so neither side hard-codes the
   other's implementation.

2. **Task** — a unit of work with a lifecycle, not a one-shot request. States:

   ```
   submitted → working → input-required → completed
                                    └────→ failed
   ```

   `input-required` is the key one: it lets an agent *pause and ask for more*,
   then resume on the **same task id** when the caller responds. That is what
   turns a request/response into a negotiation.

3. **Message & Artifact** — a `Message` carries `Part`s (text or structured
   `data`). The Provider sends the auth request as a `data` part; the Payer
   returns its determination as an `Artifact` (also `data` parts). The wire
   format is the only contract between the two agents.

## How this repo uses it

- Both agents run as independent Express servers via `@a2a-js/sdk/server`
  (`DefaultRequestHandler` + `A2AExpressApp`).
- The Provider is also an A2A *client* to the Payer
  (`@a2a-js/sdk/client` `ClientFactory`), and streams the Payer's task updates
  over SSE with `sendMessageStream`.
- The whole appeal in Scenario 2 — submit, get `input-required`, send a
  supplemental package, get `completed` — happens on one task id.

For how A2A composes with MCP and LangGraph, see
[`protocol-layers.md`](protocol-layers.md).
