/** FormData → SubmissionInput for the submission form (kept out of the "use server" file so it can be tested). */
import { CONDITION_KEYS } from "@/domain/registration/types";
import { parseNairaToKobo } from "@/lib/format";
import type { SubmissionInput } from "@/server/services/submissions/save";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const num = (f: FormData, k: string): number | null => {
  const v = s(f, k).replace(/,/g, "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function parseSubmission(f: FormData): SubmissionInput {
  const licNos = f.getAll("licenceNo").map(String);
  const licExp = f.getAll("licenceExpiry").map(String);
  const conditions: Record<string, boolean | null> = {};
  for (const k of CONDITION_KEYS) {
    if (k === "holds_any_licence") continue;
    const v = s(f, `cond_${k}`);
    conditions[k] = v === "Y" ? true : v === "N" ? false : null;
  }
  return {
    filingType: s(f, "filingType"),
    formFiled: s(f, "formFiled"),
    linkedRegistrationNo: s(f, "linkedRegistrationNo"),
    registeredName: s(f, "registeredName"),
    tradingName: s(f, "tradingName"),
    dateSubmitted: s(f, "dateSubmitted"),
    timeReceived: s(f, "timeReceived"),
    submissionChannel: s(f, "submissionChannel"),
    registrantType: s(f, "registrantType"),
    cacNo: s(f, "cacNo"),
    tin: s(f, "tin"),
    registeredAddress: s(f, "registeredAddress"),
    principalLga: s(f, "principalLga"),
    otherLgas: s(f, "otherLgas"),
    townsEstates: s(f, "townsEstates"),
    primaryActivity: s(f, "primaryActivity"),
    otherActivities: f.getAll("otherActivities").map(String).filter(Boolean),
    installedCapacityMw: num(f, "installedCapacityMw"),
    customers: num(f, "customers"),
    licenceStatus: s(f, "licenceStatus"),
    licences: licNos.map((no, i) => ({ licenceNo: no, expiryDate: licExp[i] ?? "" })),
    complianceOfficer: s(f, "complianceOfficer"),
    phone: s(f, "phone"),
    email: s(f, "email"),
    operatingOnEffectiveDate: s(f, "operatingOnEffectiveDate"),
    plannedStartDate: s(f, "plannedStartDate"),
    approvedWaiver: parseNairaToKobo(f.get("approvedWaiver")),
    categoryOverride: s(f, "categoryOverride"),
    overrideReason: s(f, "overrideReason"),
    conditions,
    formSectionsNotComplete: s(f, "formSectionsNotComplete"),
    capacityInSectionsMw: num(f, "capacityInSectionsMw"),
    remarks: s(f, "remarks"),
  };
}

