import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { PayerStateAnnotation } from "./state.ts";
import { requestParseNode } from "./nodes/request-parse.ts";
import { criteriaLookupNode } from "./nodes/criteria-lookup.ts";
import { evaluationNode } from "./nodes/evaluation.ts";
import {
  determinationNode,
  routeAfterDetermination,
} from "./nodes/determination.ts";
import { humanReviewNode } from "./nodes/human-review.ts";
import { responseNode } from "./nodes/response.ts";

/**
 * Payer pipeline — a six-node LangGraph StateGraph:
 *
 *   requestParse → criteriaLookup → evaluation → determination
 *                                                    │
 *                          ┌─────────────────────────┴───────────┐
 *                   (refer-human)                          (everything else)
 *                          ▼                                      ▼
 *                     humanReview ───────────────────────────► response → END
 *
 * Compiled with a MemorySaver checkpointer and `interruptBefore: ["humanReview"]`
 * so the Supervised trust band is a real interrupt, not a UI flag: the run stops
 * before humanReview until a human decision is injected and the graph resumed.
 */
export function buildPayerGraph() {
  const graph = new StateGraph(PayerStateAnnotation)
    .addNode("requestParse", requestParseNode)
    .addNode("criteriaLookup", criteriaLookupNode)
    .addNode("evaluate", evaluationNode)
    .addNode("determine", determinationNode)
    .addNode("humanReview", humanReviewNode)
    .addNode("response", responseNode)
    .addEdge(START, "requestParse")
    .addEdge("requestParse", "criteriaLookup")
    .addEdge("criteriaLookup", "evaluate")
    .addEdge("evaluate", "determine")
    .addConditionalEdges("determine", routeAfterDetermination, {
      humanReview: "humanReview",
      response: "response",
    })
    .addEdge("humanReview", "response")
    .addEdge("response", END);

  return graph.compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ["humanReview"],
  });
}

export type PayerGraph = ReturnType<typeof buildPayerGraph>;
