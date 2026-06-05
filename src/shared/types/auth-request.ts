import { z } from "zod";

/**
 * Plan types relevant to prior-authorization rules. Drives which synthetic
 * criteria profile the Payer agent applies.
 */
export const PlanTypeSchema = z.enum([
  "commercial",
  "medicare-advantage",
  "medicaid",
]);
export type PlanType = z.infer<typeof PlanTypeSchema>;

/**
 * A single supporting document in the clinical package the Provider sends to
 * the Payer. `kind` lets the Payer reason about completeness without parsing
 * free text (e.g. did a conservative-treatment-history doc arrive?).
 */
export const ClinicalDocumentSchema = z.object({
  kind: z.enum([
    "office-note",
    "imaging-report",
    "conservative-treatment-history",
    "lab-result",
    "operative-note",
    "supplemental",
  ]),
  title: z.string(),
  content: z.string(),
});
export type ClinicalDocument = z.infer<typeof ClinicalDocumentSchema>;

/**
 * The authorization request the Provider agent submits to the Payer agent.
 * This is the payload that travels inside an A2A message DataPart. No PHI:
 * patient is a synthetic identifier only.
 */
export const AuthRequestSchema = z.object({
  requestId: z.string(),
  /** Synthetic patient handle. Never a real MRN or name. */
  patientRef: z.string(),
  cptCode: z.string(),
  cptDescription: z.string(),
  icd10Code: z.string(),
  icd10Description: z.string(),
  planType: PlanTypeSchema,
  /** Synthetic payer profile id, keys into embedded-synthetic criteria. */
  payerProfile: z.string(),
  clinicalNotes: z.string(),
  documents: z.array(ClinicalDocumentSchema),
  /**
   * Scenario id keys deterministic mock-LLM responses. Carried end to end so
   * the Payer's mock reasoner returns the documented outcome for the demo.
   */
  scenarioId: z.string().optional(),
});
export type AuthRequest = z.infer<typeof AuthRequestSchema>;
