# Protocol layers: A2A + MCP + LangGraph

This prototype runs three agent protocols/layers at once — the full 2026
enterprise agent stack — each doing a distinct job.

```
┌─────────────────────────────────────────────────────────────┐
│  A2A         agent ⇄ agent    Provider ⇄ Payer over the wire │
│  LangGraph   within an agent  the pipeline inside each agent  │
│  Claude      reasoning        the LLM call inside a node      │
│  MCP         agent → tools    optional criteria retrieval     │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Boundary it crosses | In this repo |
|-------|---------------------|--------------|
| **A2A** | Between two *organizations'* agents | Provider ⇄ Payer; the only channel between them. No shared code. |
| **LangGraph** | Between *steps* inside one agent | 5-node Provider graph, 6-node Payer graph; typed state, conditional edges, interrupt-before. |
| **Claude** | Between *deterministic code and judgment* | The reasoning inside `EvaluationNode` / `AppealNode`, behind a mock seam. |
| **MCP** | Between an agent and *external knowledge/tools* | Optional `clinical-rules-mcp-server` lookup in `CriteriaLookupNode`, with embedded fallback. |

## Why keep them separate

Each layer has a different failure mode and a different trust story:

- **A2A** failures are *protocol* failures (a `failed` task, a timed-out SSE
  stream). They are explicit and observable on the wire.
- **LangGraph** failures are *orchestration* failures (a node throws, a branch
  is wrong). They are contained inside one agent.
- **Claude** failures are *judgment* failures (a fluent-but-wrong answer). These
  are the dangerous ones, so confidence routing + HumanReviewNode sit here.
- **MCP** failures are *dependency* failures (the knowledge service is down).
  These degrade gracefully via the embedded-criteria fallback.

Mixing them would blur those boundaries. Keeping them layered means each can be
tested, swapped, and reasoned about independently — and the demo can run any
subset (A2A + LangGraph + mock LLM needs zero external services).

## Persistent vs. session context

`CriteriaLookupNode` deliberately separates two kinds of context:

- **Persistent knowledge** — coverage criteria, from the MCP server or the
  embedded synthetic set. Shared across all requests.
- **Session context** — the specific auth request and its documents, from the
  A2A task payload. Scoped to one negotiation.

They are never mixed: the criteria are looked up, the request is evaluated
against them, and the two stay in distinct state channels.
