# Interview Demo Guide

A tight, repeatable walkthrough. Total time ~15 minutes; the core is Scenario 2.

## Setup (once, ~1 min)

```bash
bun install
```

Open three terminals.

```bash
# Terminal 1
MOCK_LLM=true bun run src/agents/payer/server.ts
# Terminal 2
MOCK_LLM=true bun run src/agents/provider/server.ts
```

Terminal 2 should print: `discovered Payer agent: "Payer Authorization Agent"`.
That line *is* the A2A discovery story — the Provider found the Payer by fetching
its Agent Card, with no shared code.

## 1 · Scenario 2 — the negotiation (8 min, the one to run every time)

```bash
# Terminal 3
bun run demo/scenarios/scenario-2-denial-appeal.ts
```

Narrate the transcript as it streams:

1. Provider builds the request (CPT 27447, total knee) and submits over A2A.
2. Payer evaluates, finds **no conservative-treatment history**, and returns
   **`input-required`** — it is asking for more, not denying outright.
3. The Provider's **AppealNode** constructs a supplemental package and resubmits
   **on the same task id**.
4. Payer re-evaluates and returns **`completed` / approved** (confidence 0.88,
   Autonomous).

The point: **one task id tracked the entire appeal.** A2A models a negotiation,
not just a request/response.

## 2 · Architecture (3 min)

Show `docs/architecture.mermaid` (or the ASCII diagrams in the README):

- Two independent agents, two ports, **zero shared code** — only A2A messages.
- A2A vs. a direct function call: the contract lives in the *protocol* (the Agent
  Card + task states), so either agent could be reimplemented or moved to another
  cloud without the other noticing.
- The protocol stack: A2A (between agents) · LangGraph (inside each) · Claude
  (reasoning) · MCP (optional knowledge). See `docs/protocol-layers.md`.

## 3 · Scenario 3 — the trust gate (5 min)

```bash
bun run demo/scenarios/scenario-3-human-review.ts
```

- Payer evaluation lands at confidence **0.65** → the **Supervised** band.
- `HumanReviewNode` is compiled with `interrupt-before` + a checkpointer, so the
  graph **physically stops** before finalizing. The task pauses in
  `input-required`.
- The CLI plays the human reviewer ("Dr. Reyes" approves); the decision is sent
  to the Payer on the same task and the determination finalizes with
  `decidedBy: human:Dr. Reyes`.

This shows the three-layer interaction in one run: A2A protocol + LangGraph
interrupt + human-in-the-loop. (In the companion Review UI it surfaces as a panel
instead of a CLI prompt.)

## 4 · Design-decision questions you may get

- **A2A vs. a direct API call?** A2A externalizes the contract to the protocol;
  Agent Cards are the interface. It scales to heterogeneous agents across clouds,
  models, and teams. Cost: one protocol hop — fine for this workload.
- **Why TypeScript, not Python?** Portfolio consistency with the existing repos
  and a native official `@a2a-js/sdk`. No GCP dependency.
- **Why the agent isolation rule?** The A2A demo loses its argument if agents
  share code. The protocol is the only channel; isolation mirrors the real
  org boundary between provider and payer.

## 5 · Production path (if asked)

OAuth/mTLS on the agent endpoints, a real criteria source behind MCP, the Payer
task store backed by a database instead of in-memory, and ECS Fargate + Bedrock
deployment (see `infra/terraform/`). Nothing about the A2A contract changes.
