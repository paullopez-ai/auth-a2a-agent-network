/**
 * Embedded synthetic prior-authorization criteria.
 *
 * SYNTHETIC / DEMO DATA ONLY. Authored for this prototype. Loosely modeled on
 * the *shape* of public-domain CMS coverage rules but containing no proprietary
 * policy text and no PHI. This is the fallback knowledge source used by
 * CriteriaLookupNode when clinical-rules-mcp-server is not running.
 */

export interface CriteriaCriterion {
  criterionId: string;
  description: string;
  /** Document kinds that, if present, satisfy this criterion. */
  satisfiedByDocs?: string[];
  required: boolean;
}

export interface CoverageCriteria {
  cptCode: string;
  cptDescription: string;
  /** Plan types this policy applies to; empty = all. */
  appliesToPlans: string[];
  authRequired: boolean;
  criteria: CriteriaCriterion[];
  source: "embedded-synthetic";
}

const CRITERIA: Record<string, CoverageCriteria> = {
  "99213": {
    cptCode: "99213",
    cptDescription: "Office/outpatient visit, established patient",
    appliesToPlans: [],
    authRequired: false,
    source: "embedded-synthetic",
    criteria: [
      {
        criterionId: "99213-doc",
        description: "Office note documenting the encounter is present",
        satisfiedByDocs: ["office-note"],
        required: true,
      },
    ],
  },
  "27447": {
    cptCode: "27447",
    cptDescription: "Total knee arthroplasty",
    appliesToPlans: ["medicare-advantage", "commercial"],
    authRequired: true,
    source: "embedded-synthetic",
    criteria: [
      {
        criterionId: "27447-imaging",
        description: "Imaging confirming advanced osteoarthritis (KL grade 3-4)",
        satisfiedByDocs: ["imaging-report"],
        required: true,
      },
      {
        criterionId: "27447-conservative",
        description:
          "Documented 3+ months of failed conservative treatment (PT, NSAIDs, or injections)",
        satisfiedByDocs: ["conservative-treatment-history"],
        required: true,
      },
      {
        criterionId: "27447-note",
        description: "Office note establishing functional impairment",
        satisfiedByDocs: ["office-note"],
        required: true,
      },
    ],
  },
  "43239": {
    cptCode: "43239",
    cptDescription: "Upper GI endoscopy with biopsy",
    appliesToPlans: ["commercial", "medicare-advantage"],
    authRequired: true,
    source: "embedded-synthetic",
    criteria: [
      {
        criterionId: "43239-symptoms",
        description: "Documented persistent symptoms despite 4+ weeks of PPI therapy",
        satisfiedByDocs: ["office-note"],
        required: true,
      },
      {
        criterionId: "43239-necessity",
        description: "Medical necessity for direct visualization clearly established",
        satisfiedByDocs: ["office-note", "imaging-report"],
        required: true,
      },
    ],
  },
};

/** Returns the synthetic coverage policy for a CPT code, or undefined. */
export function lookupEmbeddedCriteria(
  cptCode: string,
): CoverageCriteria | undefined {
  return CRITERIA[cptCode];
}
