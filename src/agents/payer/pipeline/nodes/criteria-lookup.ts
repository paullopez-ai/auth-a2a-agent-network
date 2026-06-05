import type { PayerState } from "../state.ts";
import {
  lookupEmbeddedCriteria,
  type CoverageCriteria,
} from "../../../../shared/criteria/embedded-synthetic.ts";

const MCP_TIMEOUT_MS = 1500;

/**
 * CriteriaLookupNode — the context layer. Retrieves coverage criteria for the
 * requested CPT code from clinical-rules-mcp-server when it is running, and
 * falls back to embedded synthetic criteria otherwise.
 *
 * This is a SOFT dependency by design (Skill 4 / Skill 6): the MCP server is
 * persistent knowledge, the request payload is session context, and the two are
 * never mixed. The pipeline must never hard-fail because the MCP server is down.
 */
export async function criteriaLookupNode(
  state: PayerState,
): Promise<Partial<PayerState>> {
  const cpt = state.request.cptCode;
  const mcpUrl = process.env.MCP_SERVER_URL?.trim();

  if (mcpUrl) {
    try {
      const fromMcp = await fetchFromMcp(mcpUrl, cpt);
      if (fromMcp) {
        return { criteria: fromMcp, criteriaSource: "clinical-rules-mcp-server" };
      }
    } catch {
      // Swallow and degrade gracefully — never cascade an MCP outage.
    }
  }

  const embedded = lookupEmbeddedCriteria(cpt);
  return { criteria: embedded, criteriaSource: "embedded-synthetic" };
}

/**
 * Best-effort MCP retrieval. A full implementation would speak the MCP
 * JSON-RPC protocol; here we probe a thin HTTP surface with a short timeout so
 * the soft-dependency + fallback behavior is exercised without coupling the
 * demo to a running server.
 */
async function fetchFromMcp(
  baseUrl: string,
  cpt: string,
): Promise<CoverageCriteria | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/criteria/${cpt}`, {
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    return (await res.json()) as CoverageCriteria;
  } finally {
    clearTimeout(timer);
  }
}
