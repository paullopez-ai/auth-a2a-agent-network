# auth-a2a-agent-network

Two AI agents negotiating a prior authorization decision over the Google A2A
protocol, in real time.

`prior-auth-radar` and `payer-auth-intelligence` each solve half of prior
authorization in isolation. In real healthcare operations, these two sides
exchange hundreds of messages per patient encounter through a combination of
fax, portal uploads, and phone calls. The protocol is chaos. This prototype
replaces that chaos with A2A: a structured, discoverable, typed protocol for
agent-to-agent communication that works the same way regardless of which cloud
or framework either agent runs on.

**Demo Track:** Two terminals, zero API keys, `MOCK_LLM=true`
**Hyperscaler Track:** AWS (ECS Fargate + Bedrock) — *Terraform scaffold*
**Related Repos:** [prior-auth-radar](https://github.com/paullopez-ai/prior-auth-radar) · [payer-auth-intelligence](https://github.com/paullopez-ai/payer-auth-intelligence) · [clinical-rules-mcp-server](https://github.com/paullopez-ai/clinical-rules-mcp-server)

---

## Status

| Part | State |
|------|-------|
| **Demo Track** — two A2A agents, 3 scenarios, full test suite | ✅ **Runnable now** (this release) |
| Hyperscaler Track — AWS ECS + Bedrock Terraform | 🧱 Scaffold (reviewed, not yet `apply`'d) |
| Review UI — Next.js dashboard | 🔜 Planned ([separate repo](https://github.com/paullopez-ai/auth-a2a-agent-network-ui)) |

What you can run today: start the two agents and watch a prior-authorization
request get **negotiated** between them over A2A — submitted, returned for more
documentation, appealed on the same task, and approved — with a confidence-gated
human-review path. Sample of the primary demo (`scenario-2`):

```
← status: working
← artifact: determination = needs-more-info (conf 0.72, Supervised)
← status: input-required (final) — Additional documentation required: ...
→ routing to AppealNode
→ AppealNode: resubmitting on task 0e3eb6c3… with 1 supplemental doc(s)
← artifact: determination = approved (conf 0.88, Autonomous)
← status: completed (final) — Determination: approved.
✓ PASS — expected completed/approved after appeal
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     auth-a2a-agent-network                     │
│                                                                │
│  Provider Agent (port 4001)        Payer Agent (port 4002)     │
│  ┌──────────────────────┐          ┌──────────────────────┐    │
│  │ RequestBuildNode     │          │ RequestParseNode     │    │
│  │ DocPackageNode       │          │ CriteriaLookupNode   │    │
│  │ A2ASubmitNode        │◄─ A2A ──►│ EvaluationNode       │    │
│  │ ResponseHandlerNode  │  HTTP/   │ DeterminationNode    │    │
│  │ AppealNode           │  SSE/    │ HumanReviewNode      │    │
│  │                      │  JSON-   │ ResponseNode         │    │
│  │ LangGraph StateGraph │  RPC 2.0 │ LangGraph StateGraph │    │
│  └──────────────────────┘          └──────────┬───────────┘    │
│                                               │                │
│                                    ┌──────────▼───────────┐    │
│                                    │ clinical-rules-mcp-  │    │
│                                    │ server (port 3001)   │    │
│                                    │ [optional dependency]│    │
│                                    │ Fallback: embedded   │    │
│                                    │ synthetic criteria   │    │
│                                    └──────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

```
Provider Agent                              Payer Agent
     │  message/send (authRequest, docs)         │
     │──────────────────────────────────────────►│ submitted → working
     │◄──────────────────────────────────────────│ SSE: working
     │◄──────────────────────────────────────────│ input-required (needs docs)
     │  message/send (appeal, same taskId)        │
     │──────────────────────────────────────────►│ working
     │◄──────────────────────────────────────────│ completed
     │  artifact: { determination, rationale,     │
     │              confidence, criteria }        │
```

Each agent is fully independent: separate Express server, separate LangGraph
pipeline, separate port. They share no code. The only thing they exchange is A2A
messages. Think of them as specialists from two different organizations who have
never met but share a common professional language: the Provider Agent knows how
to build an authorization package; the Payer Agent knows how to evaluate one.
A2A gives them the vocabulary to negotiate without either side knowing how the
other works internally.

<!-- DIAGRAM: insert rendered docs/architecture.mermaid image here -->

See [`docs/a2a-primer.md`](docs/a2a-primer.md) for a short A2A explainer and
[`docs/protocol-layers.md`](docs/protocol-layers.md) for how A2A + MCP +
LangGraph compose.

---

## Demonstrated Capabilities

### Multi-Agent Orchestration

> *From the Architect:* The multi-turn exchange in Scenario 2 is the most
> important pattern in this prototype. A real authorization is not a single
> request/response; it is a negotiation. The payer asks for more documentation,
> the provider responds, the payer re-evaluates. A2A models this naturally
> through the `input-required` task state and multi-turn messaging on the same
> task id. One task id tracks the entire appeal lifecycle from initial
> submission to final determination. The five-node Provider pipeline and
> six-node Payer pipeline each break the workflow into agent-sized
> responsibilities with clear handoff logic.

**Key implementation:** [`demo/scenarios/scenario-2-denial-appeal.ts`](demo/scenarios/scenario-2-denial-appeal.ts) — multi-turn A2A negotiation across `submitted → input-required → completed`

### Failure Pattern Recognition

> *From the Architect:* In healthcare AI, the most dangerous failure is a
> plausible but wrong determination that reaches a clinician without triggering
> any alert. Confidence routing prevents this: Payer determinations with
> confidence below 0.8 are intercepted by HumanReviewNode rather than returned
> as `completed`. The criteria lookup falls back to embedded synthetic criteria
> if the MCP server is unavailable so the pipeline degrades gracefully. SSE
> stream handling in the Provider agent includes timeout detection and a retry
> so a slow Payer response never silently drops the task. Every `failed` state
> is explicit and logged.

**Key implementation:** [`src/agents/payer/pipeline/nodes/criteria-lookup.ts`](src/agents/payer/pipeline/nodes/criteria-lookup.ts) — MCP fallback to embedded criteria; [`src/agents/payer/pipeline/nodes/determination.ts`](src/agents/payer/pipeline/nodes/determination.ts) — confidence-based routing

### Trust and Security Design

> *From the Architect:* Every determination produced by the Payer agent carries
> a trust boundary classification: Autonomous for high-confidence approvals
> (> 0.8), Supervised for the human review intercept range (0.5–0.8). The
> HumanReviewNode interrupt-before pattern means the pipeline physically cannot
> proceed past an ambiguous determination without a human decision. Every A2A
> task artifact includes confidence score, criteria evaluated, rationale, and
> timestamp. No determination is returned without attribution. The agent
> isolation rule (no cross-imports between provider and payer code) mirrors the
> real-world boundary between these organizations: they communicate only through
> the shared protocol.

**Key implementation:** [`src/agents/payer/pipeline/nodes/human-review.ts`](src/agents/payer/pipeline/nodes/human-review.ts) — interrupt-before trust boundary; [`src/shared/types/determination.ts`](src/shared/types/determination.ts) — `TrustBoundaryClassification` enum

---

## Demo Track Setup (no API keys)

```bash
# Clone and install
git clone https://github.com/paullopez-ai/auth-a2a-agent-network
cd auth-a2a-agent-network
bun install

# Terminal 1: start Payer Agent
MOCK_LLM=true bun run src/agents/payer/server.ts
# Payer Agent running at http://localhost:4002

# Terminal 2: start Provider Agent
MOCK_LLM=true bun run src/agents/provider/server.ts
# Provider Agent running at http://localhost:4001

# Terminal 3: run Scenario 2 (primary demo)
bun run demo/scenarios/scenario-2-denial-appeal.ts
```

All three scenarios:

| Scenario | Command | Demonstrates |
|----------|---------|--------------|
| 1 · Clean approval | `bun run demo/scenarios/scenario-1-clean-approval.ts` | Single round trip, Autonomous band |
| 2 · Denial + appeal | `bun run demo/scenarios/scenario-2-denial-appeal.ts` | Multi-turn `input-required` negotiation on one task id |
| 3 · Human review | `bun run demo/scenarios/scenario-3-human-review.ts` | `interrupt-before` trust gate + human decision (CLI) |

Run the test suite (forces `MOCK_LLM=true`, includes a real A2A round trip):

```bash
bun run test
```

---

## Hyperscaler Track Setup (AWS)

Container hosting on ECS Fargate, inference via Amazon Bedrock, infrastructure as
Terraform. See [`infra/terraform/README.md`](infra/terraform/README.md).

```bash
cd infra/terraform
terraform init && terraform plan && terraform apply
# ... run Scenario 2 against the live ALB endpoints ...
terraform destroy     # cost guardrail: tear everything down after the demo
```

Estimated cost for a single 2-hour demo session: **< $1.00**. Set a $20/month AWS
budget alert to catch runaway charges.

---

## Interview Demo Guide

A five-minute walkthrough lives in
[`docs/interview-demo-guide.md`](docs/interview-demo-guide.md): start both
agents, run Scenario 2, narrate the SSE stream, then run Scenario 3 to show the
human-review interrupt.

---

## Project Layout

```
src/agents/provider/   Provider A2A server + 5-node LangGraph pipeline
src/agents/payer/      Payer A2A server + 6-node LangGraph pipeline (interrupt-before)
src/shared/            Shared types, synthetic criteria, mock LLM, reasoning seam
demo/scenarios/        Three runnable scenario scripts
tests/                 Vitest: node unit tests + real A2A round-trip integration
docs/                  A2A primer, protocol layers, architecture.mermaid, demo guide
infra/terraform/       AWS ECS + ALB + Bedrock (Hyperscaler track)
```

No proprietary or PHI data is used anywhere. This prototype is a portfolio and
interview asset, not intended for production deployment.
