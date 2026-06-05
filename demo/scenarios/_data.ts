import type { AuthRequest } from "../../src/shared/types/auth-request.ts";

/** Scenario 1 — clean approval, one round trip (CPT 99213). */
export const scenario1Request: AuthRequest = {
  requestId: "req-s1-officevisit",
  patientRef: "synthetic-patient-001",
  cptCode: "99213",
  cptDescription: "Office/outpatient visit, established patient",
  icd10Code: "J06.9",
  icd10Description: "Acute upper respiratory infection, unspecified",
  planType: "commercial",
  payerProfile: "commercial-default",
  clinicalNotes:
    "Established patient presenting with URI symptoms. Exam and plan documented.",
  documents: [
    {
      kind: "office-note",
      title: "Office Visit Note",
      content: "Complete encounter note with history, exam, assessment, and plan.",
    },
  ],
  scenarioId: "scenario-1-clean-approval",
};

/** Scenario 2 — denial + appeal (CPT 27447), missing conservative-tx history. */
export const scenario2Request: AuthRequest = {
  requestId: "req-s2-knee",
  patientRef: "synthetic-patient-002",
  cptCode: "27447",
  cptDescription: "Total knee arthroplasty",
  icd10Code: "M17.11",
  icd10Description: "Unilateral primary osteoarthritis, right knee",
  planType: "medicare-advantage",
  payerProfile: "ma-default",
  clinicalNotes:
    "Severe right knee osteoarthritis with functional impairment limiting ADLs.",
  documents: [
    {
      kind: "office-note",
      title: "Orthopedic Office Note",
      content: "Functional impairment documented; candidate for arthroplasty.",
    },
    {
      kind: "imaging-report",
      title: "Knee Radiograph",
      content: "Kellgren-Lawrence grade 4 osteoarthritis, bone-on-bone.",
    },
  ],
  scenarioId: "scenario-2-denial-appeal",
};

/** Scenario 3 — human review intercept (CPT 43239), ambiguous necessity. */
export const scenario3Request: AuthRequest = {
  requestId: "req-s3-egd",
  patientRef: "synthetic-patient-003",
  cptCode: "43239",
  cptDescription: "Upper GI endoscopy with biopsy",
  icd10Code: "K21.0",
  icd10Description: "Gastro-esophageal reflux disease with esophagitis",
  planType: "commercial",
  payerProfile: "commercial-default",
  clinicalNotes:
    "Reflux symptoms; documentation ambiguous on duration of prior PPI therapy.",
  documents: [
    {
      kind: "office-note",
      title: "GI Office Note",
      content:
        "Persistent reflux. PPI trial mentioned but duration not clearly stated.",
    },
  ],
  scenarioId: "scenario-3-human-review",
};
