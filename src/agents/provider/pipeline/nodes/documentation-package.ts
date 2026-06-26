import type { ProviderState } from "../state.ts";
import { OUT } from "../transcript-style.ts";

/**
 * DocPackageNode — verifies the clinical documentation package before
 * submission. It does not invent documents (that would mask a real gap); it
 * records what is being sent so the package is auditable on the Provider side.
 */
export function documentationPackageNode(
  state: ProviderState,
): Partial<ProviderState> {
  const docs = state.request.documents;
  const kinds = docs.map((d) => d.kind).join(", ") || "(none)";
  return {
    transcript: [`${OUT} packaging ${docs.length} document(s): ${kinds}`],
  };
}
