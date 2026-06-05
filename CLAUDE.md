# CLAUDE.md — auth-a2a-agent-network

## Project Identity
Two-agent prior authorization system demonstrating the Google A2A protocol.
A **Provider Agent** and a **Payer Agent** communicate exclusively over A2A
(HTTP / SSE / JSON-RPC 2.0). Each runs as an independent Express server using
`@a2a-js/sdk`. A2A is the only communication channel between them; there are no
direct imports between agent code.

## Stack
- Runtime: TypeScript on **bun**
- A2A SDK: `@a2a-js/sdk` v0.3.x (official, from `a2aproject/a2a-js`)
- Agent framework: LangGraph.js (`@langchain/langgraph`), in-process StateGraph
- LLM: Anthropic Claude via `@anthropic-ai/sdk` (or AWS Bedrock); abstracted
  behind `src/shared/reasoning.ts` so a deterministic mock can replace it
- HTTP server: Express (peer dep of `@a2a-js/sdk/server/express`)
- Testing: Vitest

## Critical Constraints
- Agents communicate ONLY via A2A; no imports between `src/agents/provider/` and
  `src/agents/payer/`. Shared code lives in `src/shared/` only.
- Each agent must be startable independently.
- `MOCK_LLM=true` for all tests; never call real Claude in the test suite.
- No proprietary or PHI data anywhere; criteria are synthetic / public-domain CMS.

## Architecture Principles
A2A is the protocol; LangGraph is the orchestration inside each agent; Claude is
the reasoning layer; MCP is the optional knowledge-retrieval layer. The protocol
boundary between the two agents is the entire point — neither knows the other's
implementation, only its Agent Card.

## A2A SDK Patterns (as used here)
- Server: `DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor)`
  mounted with `new A2AExpressApp(handler).setupRoutes(app)`. This serves the
  Agent Card at `/.well-known/agent-card.json` and JSON-RPC at the root.
- Executor: implement `AgentExecutor` (`execute(ctx, eventBus)` + `cancelTask`).
  Publish a `task` (submitted), then `status-update` (working), then
  `artifact-update`, then a final `status-update`. Call `eventBus.finished()`.
- Client: `new ClientFactory({ transports: [new JsonRpcTransportFactory()] })`
  then `factory.createFromUrl(url)`; `client.sendMessageStream(params)` to consume
  the SSE event stream.
- Task states used: `submitted → working → input-required | completed | failed`.

## LangGraph Patterns
- `StateGraph(Annotation.Root({...}))`; nodes are `(state) => Partial<State>`.
- IMPORTANT: a node name may not equal a state channel name. The Payer's
  evaluation/determination *channels* exist, so the *nodes* are named `evaluate`
  and `determine`.
- HumanReviewNode uses a real interrupt: the Payer graph compiles with a
  `MemorySaver` checkpointer and `interruptBefore: ["humanReview"]`. The executor
  resumes with `graph.updateState(config, { humanDecision })` then
  `graph.invoke(null, config)`.

## Outcome → A2A state mapping (Payer executor)
- approved / denied → `completed`
- needs-more-info → `input-required` (Provider should appeal)
- needs-human-review → `input-required` (awaiting a human decision)
Every response carries a typed determination artifact (confidence, rationale,
criteria, trust boundary, decidedBy, timestamp) — the audit trail.

## Mock LLM Mode
- `MOCK_LLM=true` selects `MockReasoner` (`src/shared/mock-llm.ts`), which returns
  deterministic responses keyed to `scenarioId`. Required for the Demo track and
  all tests. `src/shared/llm.ts` picks mock vs. live Claude.

## MCP Server Integration (optional, soft dependency)
- If `MCP_SERVER_URL` is set and reachable, `CriteriaLookupNode` fetches criteria
  from `clinical-rules-mcp-server`; otherwise it falls back to
  `src/shared/criteria/embedded-synthetic.ts`. Never a hard dependency.

## Environment Variables
See `.env.example`. Key ones: `PROVIDER_PORT` (4001), `PAYER_PORT` (4002),
`PAYER_URL`/`PROVIDER_URL` (discovery), `MOCK_LLM`, `ANTHROPIC_API_KEY`,
`USE_BEDROCK`, `MCP_SERVER_URL`.

## Dev note (bun transpiler cache)
Bun's runtime transpiler cache can occasionally serve stale output after rapid
edits, surfacing as a confusing LangGraph "node name == channel" error. If that
happens during development, prefix commands with
`BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`. A clean clone is unaffected.

## Run
```bash
bun install
# terminal 1
MOCK_LLM=true bun run src/agents/payer/server.ts
# terminal 2
MOCK_LLM=true bun run src/agents/provider/server.ts
# terminal 3
bun run demo/scenarios/scenario-2-denial-appeal.ts
# or boot both agents at once:
bun run src/orchestrator/index.ts
```

## Build status
- [x] Phase 1: Payer + Provider servers, Agent Cards, ClientFactory discovery
- [x] Phase 1: `docs/architecture.mermaid` (graph TD + sequenceDiagram)
- [x] Phase 2: Payer LangGraph pipeline (6 nodes + interrupt-before HumanReview)
- [x] Phase 3: Provider LangGraph pipeline (5 nodes + AppealNode)
- [x] Phase 4: three scenario scripts + Vitest suite (23 tests, real A2A round trip)
- [ ] Phase 5: AWS Terraform infra (scaffold in `infra/terraform/`)
- [ ] Phase 6: Review UI (separate session in `auth-a2a-agent-network-ui`)
```
