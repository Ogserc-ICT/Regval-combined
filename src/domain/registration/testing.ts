/** Test helpers: reference data from the workbook extract and a blank submission. */
import refJson from "../../../seed/data/reference.json";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import type { AssessContext, RefData, SubmissionFacts } from "./types";

export const REF: RefData = {
  fees: refJson.fees,
  activities: refJson.activities,
  forms: refJson.forms,
  formDocs: refJson.formDocuments,
  conditions: refJson.conditions,
  checks: refJson.checks,
};

export function submission(over: Partial<SubmissionFacts> = {}): SubmissionFacts {
  return {
    ackNo: "OGSERC/ACK/2026/00001",
    status: "Acknowledged - Awaiting Payment",
    filingType: "NEW",
    formFiled: "REG-01D",
    linkedRegistrationNo: null,
    registeredName: "Test Power Ltd",
    dateSubmitted: "2026-11-20",
    deemedReceiptDate: "2026-11-20",
    registrantType: "Company",
    cacNo: "RC123456",
    principalLga: "Sagamu",
    primaryActivity: "GEN",
    otherActivities: [],
    installedCapacityMw: 5,
    licenceStatus: "OGSERC licence/permit",
    licences: [{ licenceNo: "OG/1", expiryDate: "2030-01-01" }],
    operatingOnEffectiveDate: "Y",
    plannedStartDate: null,
    approvedWaiver: 0,
    categoryOverride: null,
    overrideReason: null,
    conditions: {},
    formSectionsNotComplete: null,
    capacityInSectionsMw: null,
    confirmedCategory: null,
    categoryConfirmedReason: null,
    releasedOn: null,
    dateSubmissionComplete: null,
    deficiencyNoticeDate: null,
    showCauseDate: null,
    certificateIssueDate: null,
    registrationNo: null,
    priced: null,
    createdBy: "user-registration",
    ...over,
  };
}

export function context(over: Partial<AssessContext> = {}, settings: Partial<Settings> = {}): AssessContext {
  return {
    today: "2026-11-25",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    ref: REF,
    payments: [],
    checklist: {},
    evaluation: null,
    linked: null,
    duplicates: { cac: false, name: false, registrationNo: false },
    annualFiledThisYear: false,
    signatories: { chairman: true, commissioner: true },
    ...over,
  };
}
