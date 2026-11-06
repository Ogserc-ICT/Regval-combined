/**
 * Plain data shapes the registration rules work on. Services load these from
 * the database; the rules never touch the database themselves.
 */
import type { LocalDate } from "../dates";
import type { Settings } from "../settings";

export type Fee = {
  category: string;
  registrationFee: number;
  lateInitial: number;
  lateDaily: number;
  lateCap: number;
  description: string;
};

export type Activity = {
  code: string;
  name: string;
  cat10MwPlus: string;
  cat1To10Mw: string;
  catBelow1Mw: string;
  capacityBased: boolean;
  /** Switched off by an admin: hidden from new entries; existing records keep it. */
  active?: boolean;
};

export type FormDef = { form: string; category: string; title: string; orderPara: string };
export type FormDoc = { form: string; key: string; no: number; document: string; requiredWhen: string | null };
export type Condition = { key: string; question: string };
export type CheckDef = { id: string; stage: string; text: string; ruleText: string; sort: number };

export type RefData = {
  fees: Fee[];
  activities: Activity[];
  forms: FormDef[];
  formDocs: FormDoc[];
  conditions: Condition[];
  checks: CheckDef[];
};

export const FILING_LABELS = {
  NEW: "New registration",
  UPDATE: "Update: material change (para 16(1))",
  ANNUAL: "Annual confirmation (para 16(2))",
} as const;
export type Filing = keyof typeof FILING_LABELS;

export const ST = {
  AWAITING: "Acknowledged - Awaiting Payment",
  RECEIVED: "Received - Under Review",
  DEFICIENCY: "Deficiency Notice Issued",
  PROVISIONAL: "Provisionally Registered",
  REGISTERED: "Registered",
  LAPSED: "Lapsed",
  REFUSED: "Refused",
  CANCELLED: "Cancelled",
  APPLIED: "Changes Applied",
} as const;
export type Status = (typeof ST)[keyof typeof ST];

export const CLOSED_STATUSES: readonly Status[] = [ST.REGISTERED, ST.REFUSED, ST.LAPSED, ST.CANCELLED, ST.APPLIED];
export const isClosed = (s: Status | null) => !!s && CLOSED_STATUSES.includes(s);

export const UNLICENSED = "Unlicensed";
export const LICENCE_PENDING = "Licence application pending";
export const MULTI_STATE_LICENCE = "NERC licence (multi-State)";

/** Document condition keys (Lists A52:C61) and the submission field that holds each. */
export const CONDITION_KEYS = [
  "holds_any_licence",
  "multi_state_licensee",
  "generation_for_sale",
  "grid_connected",
  "interconnected_minigrid",
  "f_distribution",
  "f_trading",
  "g_disco_bulk_supply",
  "sub_franchise",
] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];
/** Everything except holds_any_licence, which is calculated from the licence status. */
export type EnteredCondition = Exclude<ConditionKey, "holds_any_licence">;

export type Licence = { licenceNo: string | null; expiryDate: LocalDate | null };

/** The pricing snapshot frozen at save (SPEC §8.3). */
export type Pricing = {
  category: string;
  fee: number;
  lateInitial: number;
  lateDaily: number;
  lateCap: number;
  deadline: LocalDate | null;
  effectiveDate: LocalDate;
};

export type SubmissionFacts = {
  ackNo: string;
  status: Status | null;
  filingType: Filing;
  formFiled: string | null;
  linkedRegistrationNo: string | null;
  registeredName: string;
  dateSubmitted: LocalDate;
  /** From the inward item: sets the days late (Q3). */
  deemedReceiptDate: LocalDate | null;
  registrantType: string | null;
  cacNo: string | null;
  principalLga: string | null;
  /** Activity codes. */
  primaryActivity: string | null;
  otherActivities: string[];
  installedCapacityMw: number | null;
  licenceStatus: string | null;
  licences: Licence[];
  operatingOnEffectiveDate: "Y" | "N" | null;
  plannedStartDate: LocalDate | null;
  approvedWaiver: number;
  categoryOverride: string | null;
  overrideReason: string | null;
  conditions: Partial<Record<EnteredCondition, boolean | null>>;
  formSectionsNotComplete: string | null;
  capacityInSectionsMw: number | null;
  confirmedCategory: string | null;
  categoryConfirmedReason: string | null;
  releasedOn: LocalDate | null;
  dateSubmissionComplete: LocalDate | null;
  deficiencyNoticeDate: LocalDate | null;
  showCauseDate: LocalDate | null;
  certificateIssueDate: LocalDate | null;
  registrationNo: string | null;
  priced: Pricing | null;
  createdBy: string | null;
};

export type PaymentFacts = {
  amount: number;
  dateReceived: LocalDate;
  financeStatus: "Pending" | "Confirmed" | "Rejected";
  reversed: boolean;
};

export type EvaluationFacts = {
  evaluatingOfficerId: string | null;
  reviewingSupervisorId: string | null;
  approvingOfficerId: string | null;
  startedOn: LocalDate | null;
  flagOverrideReason: string | null;
  finalDecision: string | null;
  /** Manual answers by check id: "Y" | "N" | "N/A". */
  answers: Record<string, string>;
};

export type AssessContext = {
  today: LocalDate;
  settings: Settings;
  ref: RefData;
  payments: PaymentFacts[];
  /** Checklist entries by document key: "Y" | "N" | "N/A" | null. */
  checklist: Record<string, string | null>;
  evaluation: EvaluationFacts | null;
  /** The registration an update / annual confirmation is linked to. */
  linked: { status: Status | null; certificateIssueDate: LocalDate | null; registrationNo: string | null } | null;
  duplicates: { cac: boolean; name: boolean; registrationNo: boolean };
  /** For a Registered new registration: an annual confirmation was filed this year (not refused, lapsed or cancelled). */
  annualFiledThisYear: boolean;
  /** [G3] Active Chairman / CEO and Commissioner signatories exist. */
  signatories: { chairman: boolean; commissioner: boolean };
};
