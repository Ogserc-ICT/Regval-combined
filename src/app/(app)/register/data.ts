import "server-only";
import { lagosMinuteOfDay } from "@/domain/dates";
import type { LoadedSubmission } from "@/server/services/submissions/load";
import { registrationLists } from "@/server/services/reference";
import type { DbOrTx } from "@/server/db/connect";
import type { SubmissionFormLists, SubmissionFormValues } from "./submission-form";

export async function formLists(db: DbOrTx): Promise<SubmissionFormLists> {
  const l = await registrationLists(db);
  return {
    lga: l.lga,
    registrantType: l.registrantType,
    licenceStatus: l.licenceStatus,
    channel: l.channel,
    activities: l.ref.activities.filter((a) => a.active !== false).map((a) => ({ code: a.code, name: a.name })),
    forms: l.ref.forms.map((f) => ({ form: f.form, title: f.title, category: f.category })),
    categories: l.ref.fees.filter((f) => f.category !== "I").map((f) => f.category),
    conditions: l.ref.conditions,
  };
}

const hhmm = (d: Date) => {
  const m = lagosMinuteOfDay(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function blankValues(today: string): SubmissionFormValues {
  return {
    filingType: "NEW",
    formFiled: "",
    linkedRegistrationNo: "",
    registeredName: "",
    tradingName: "",
    dateSubmitted: today,
    received: null,
    registrantType: "",
    cacNo: "",
    tin: "",
    registeredAddress: "",
    principalLga: "",
    otherLgas: "",
    townsEstates: "",
    primaryActivity: "",
    otherActivities: [],
    installedCapacityMw: "",
    customers: "",
    licenceStatus: "",
    licences: [],
    complianceOfficer: "",
    phone: "",
    email: "",
    operatingOnEffectiveDate: "",
    plannedStartDate: "",
    approvedWaiver: "",
    categoryOverride: "",
    overrideReason: "",
    conditions: {},
    formSectionsNotComplete: "",
    capacityInSectionsMw: "",
    remarks: "",
  };
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function valuesFrom(l: LoadedSubmission): SubmissionFormValues {
  return valuesFromParts(l.row, l.otherActivities, l.licences);
}

export function valuesFromParts(
  r: LoadedSubmission["row"],
  otherActivities: string[],
  licences: { licenceNo: string | null; expiryDate: string | null }[],
): SubmissionFormValues {
  const yn = (v: boolean | null | undefined) => (v === true ? "Y" : v === false ? "N" : "");
  return {
    id: r.id,
    filingType: r.filingType,
    formFiled: str(r.formFiled),
    linkedRegistrationNo: str(r.linkedRegistrationNo),
    registeredName: r.registeredName,
    tradingName: str(r.tradingName),
    dateSubmitted: r.dateSubmitted,
    received: { time: hhmm(r.receivedAt), channel: r.submissionChannel, deemed: r.deemedReceiptDate },
    registrantType: str(r.registrantType),
    cacNo: str(r.cacNo),
    tin: str(r.tin),
    registeredAddress: str(r.registeredAddress),
    principalLga: str(r.principalLga),
    otherLgas: str(r.otherLgas),
    townsEstates: str(r.townsEstates),
    primaryActivity: str(r.primaryActivity),
    otherActivities,
    installedCapacityMw: str(r.installedCapacityMw),
    customers: str(r.customers),
    licenceStatus: str(r.licenceStatus),
    licences: licences.map((x) => ({ licenceNo: str(x.licenceNo), expiryDate: str(x.expiryDate) })),
    complianceOfficer: str(r.complianceOfficer),
    phone: str(r.phone),
    email: str(r.email),
    operatingOnEffectiveDate: str(r.operatingOnEffectiveDate),
    plannedStartDate: str(r.plannedStartDate),
    approvedWaiver: r.approvedWaiver ? String(r.approvedWaiver / 100) : "",
    categoryOverride: str(r.categoryOverride),
    overrideReason: str(r.overrideReason),
    conditions: {
      multi_state_licensee: yn(r.condMultiState),
      generation_for_sale: yn(r.condGenerationForSale),
      grid_connected: yn(r.condGridConnected),
      interconnected_minigrid: yn(r.condInterconnectedMinigrid),
      f_distribution: yn(r.condFDistribution),
      f_trading: yn(r.condFTrading),
      g_disco_bulk_supply: yn(r.condDiscoBulkSupply),
      sub_franchise: yn(r.condSubFranchise),
    },
    formSectionsNotComplete: str(r.formSectionsNotComplete),
    capacityInSectionsMw: str(r.capacityInSectionsMw),
    remarks: str(r.remarks),
  };
}
