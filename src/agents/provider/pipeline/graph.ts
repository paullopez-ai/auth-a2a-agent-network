import { StateGraph, START, END } from "@langchain/langgraph";
import { ProviderStateAnnotation } from "./state.ts";
import { requestBuildNode } from "./nodes/request-build.ts";
import { documentationPackageNode } from "./nodes/documentation-package.ts";
import { a2aSubmitNode } from "./nodes/a2a-submit.ts";
import {
  responseHandlerNode,
  routeAfterResponse,
} from "./nodes/response-handler.ts";
import { appealNode } from "./nodes/appeal.ts";

/**
 * Provider pipeline — a five-node LangGraph StateGraph:
 *
 *   requestBuild → docPackage → a2aSubmit → responseHandler
 *                                                 │
 *                                  ┌──────────────┴─────────────┐
 *                           (needs-more-info)              (otherwise)
 *                                  ▼                            ▼
 *                               appeal ──────────────────────► END
 *
 * No interrupt/checkpointer here — the Provider's only async boundary is the
 * A2A call to the Payer, handled inside a2aSubmit / appeal.
 */
export function buildProviderGraph() {
  const graph = new StateGraph(ProviderStateAnnotation)
    .addNode("requestBuild", requestBuildNode)
    .addNode("docPackage", documentationPackageNode)
    .addNode("a2aSubmit", a2aSubmitNode)
    .addNode("responseHandler", responseHandlerNode)
    .addNode("appeal", appealNode)
    .addEdge(START, "requestBuild")
    .addEdge("requestBuild", "docPackage")
    .addEdge("docPackage", "a2aSubmit")
    .addEdge("a2aSubmit", "responseHandler")
    .addConditionalEdges("responseHandler", routeAfterResponse, {
      appeal: "appeal",
      done: END,
    })
    .addEdge("appeal", END);

  return graph.compile();
}

export type ProviderGraph = ReturnType<typeof buildProviderGraph>;
