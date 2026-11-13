/**
 * The four registration documents (Phase 10; SPEC §24.1; templates in docs/templates/).
 * Each loader gathers what one document prints, from the current records, as plain data
 * for its PDF component in src/server/pdf/. The deficiency notice prints what was frozen
 * when it was issued.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { addDays, type LocalDate } from "@/domain/dates";
import { FILING_LABELS, UNLICENSED } from "@/domain/registration/types";
import { POST_APPROVAL_CHECKS } from "@/domain/registration/checks";
import type { DbOrTx } from "../db/connect";
import { deficiencyNotices, signatories, users, type DeficiencyContents } from "../db/schema";
import { notFound, blocked } from "../errors";
import { lagosToday } from "../time";
import { loadSubmission, type LoadedSubmission } from "./submissions/load";

export type Letterhead = { address: string; email: string };

const letterhead = (l: LoadedSubmission): Letterhead => ({ address: l.settings.letterAddress, email: l.settings.letterEmail });

async function namesOf(db: DbOrTx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

const activityName = (l: LoadedSubmission, code: string | null) => (code ? (l.ref.activities.find((a) => a.code === code)?.name ?? code) : null);
const categoryText = (l: LoadedSubmission, cat: string | null) => {
  if (!cat) return null;
  const d = l.ref.fees.find((f) => f.category === cat)?.description;
  return d ? `${cat} — ${d}` : cat;
};

/** What a deficiency notice says, frozen into the notice when it is issued (issueDeficiency). */
export function deficiencyContents(l: LoadedSubmission, issuedByName: string | null): DeficiencyContents {
  const text = new Map(l.ref.checks.map((c) => [c.id, c.text]));
  return {
    documents: l.a.documents.items.filter((i) => i.value !== "Y" && i.value !== "N/A").map((i) => `${i.no}. ${i.document}`),
    checks: l.a.checks.results.filter((r) => r.value === "N").map((r) => `${text.get(r.id) ?? "Evaluation check"} (check ${r.id})`),
    remarks: l.evaluation?.remarks?.trim() || null,
    category: l.a.categoryApplied,
    totalDue: l.a.totalDue,
    paid: l.a.payments.amountPaid,
    balance: Math.max(0, l.a.balance),
    issuedByName,
  };
}

// ---------------------------------------------------------------------------
// Acknowledgement letter (para 10(3))

export type AcknowledgementData = {
  head: Letterhead;
  ackNo: string;
  date: LocalDate;
  filing: "NEW" | "UPDATE" | "ANNUAL";
  filingLabel: string;
  linkedRegistrationNo: string | null;
  to: string;
  address: string | null;
  attention: string | null;
  receivedAt: Date;
  dateSubmitted: LocalDate;
  deemedReceiptDate: LocalDate;
  channel: string;
  activities: string[];
  capacityMw: number | null;
  category: string | null;
  categoryConfirmed: boolean;
  fee: number;
  waiver: number;
  lateCharge: number;
  daysLate: number;
  deadline: LocalDate | null;
  totalDue: number;
  paid: number;
  balance: number;
  newOperator: boolean;
  received: string[];
  pending: string[];
  unlicensed: boolean;
  licenceApplicationDue: LocalDate | null;
  days: { determination: number; deficiency: number; showCause: number };
  signedBy: string;
};

export async function acknowledgementData(db: DbOrTx, id: string, printedBy: string): Promise<AcknowledgementData> {
  const l = await loadSubmission(db, id);
  const { row, a } = l;
  if (!row.status) throw blocked("Save the submission before printing its acknowledgement letter.");
  const names = await namesOf(db, [l.evaluation?.evaluatingOfficerId]);
  const docs = a.documents.items;
  return {
    head: letterhead(l),
    ackNo: row.ackNo,
    date: lagosToday(),
    filing: row.filingType as AcknowledgementData["filing"],
    filingLabel: FILING_LABELS[row.filingType as keyof typeof FILING_LABELS],
    linkedRegistrationNo: row.linkedRegistrationNo,
    to: row.registeredName,
    address: row.registeredAddress,
    attention: row.complianceOfficer,
    receivedAt: row.receivedAt,
    dateSubmitted: row.dateSubmitted,
    deemedReceiptDate: row.deemedReceiptDate,
    channel: row.submissionChannel,
    activities: [row.primaryActivity, ...l.otherActivities].map((c) => activityName(l, c)).filter((x): x is string => !!x),
    capacityMw: row.installedCapacityMw,
    category: categoryText(l, a.categoryApplied),
    categoryConfirmed: !!row.confirmedCategory,
    fee: a.registrationFee,
    waiver: row.approvedWaiver,
    lateCharge: a.lateCharge,
    daysLate: a.daysLate,
    deadline: a.deadline,
    totalDue: a.totalDue,
    paid: a.payments.amountPaid,
    balance: Math.max(0, a.balance),
    newOperator: row.operatingOnEffectiveDate === "N",
    received: docs.filter((i) => i.value === "Y").map((i) => `${i.no}. ${i.document}`),
    pending: docs.filter((i) => i.value !== "Y" && i.value !== "N/A").map((i) => `${i.no}. ${i.document}`),
    unlicensed: row.licenceStatus === UNLICENSED,
    licenceApplicationDue: a.licenceApplicationDue,
    days: { determination: l.settings.determinationDays, deficiency: l.settings.deficiencyResponseDays, showCause: l.settings.showCauseDays },
    // Q28b default: the assigned evaluating officer, else the officer printing it.
    signedBy: names.get(l.evaluation?.evaluatingOfficerId ?? "") ?? printedBy,
  };
}

// ---------------------------------------------------------------------------
// Deficiency notice (para 13(1)(b))

export type DeficiencyData = {
  head: Letterhead;
  defNo: string;
  ackNo: string;
  /** The date sent; until it is sent the notice is a draft dated today. */
  date: LocalDate;
  responseDue: LocalDate;
  draft: boolean;
  to: string;
  address: string | null;
  attention: string | null;
  submissionDate: LocalDate;
  contents: DeficiencyContents;
};

/** The latest notice on the submission, or the one asked for. */
export async function deficiencyData(db: DbOrTx, id: string, noticeId?: string | null): Promise<DeficiencyData> {
  const l = await loadSubmission(db, id);
  const where = noticeId ? and(eq(deficiencyNotices.submissionId, id), eq(deficiencyNotices.id, noticeId)) : eq(deficiencyNotices.submissionId, id);
  const [notice] = await db.select().from(deficiencyNotices).where(where).orderBy(desc(deficiencyNotices.issuedAt)).limit(1);
  if (!notice) throw notFound("Deficiency notice");
  // Notices issued before Phase 10 froze nothing: rebuild them from the current records.
  let contents = notice.contents;
  if (!contents) {
    const names = await namesOf(db, [notice.issuedBy]);
    contents = deficiencyContents(l, names.get(notice.issuedBy ?? "") ?? null);
  }
  const today = lagosToday();
  const sent = notice.sentOn;
  return {
    head: letterhead(l),
    defNo: notice.defNo,
    ackNo: l.row.ackNo,
    date: sent ?? today,
    responseDue: notice.responseDue ?? addDays(sent ?? today, l.settings.deficiencyResponseDays),
    draft: !sent,
    to: l.row.registeredName,
    address: l.row.registeredAddress,
    attention: l.row.complianceOfficer,
    submissionDate: l.row.deemedReceiptDate,
    contents,
  };
}

// ---------------------------------------------------------------------------
// EVAL-01 (internal)

export type EvalCheckLine = { id: string; text: string; value: string; automatic: boolean; applicable: boolean };
export type EvaluationData = {
  head: Letterhead;
  ackNo: string;
  registrant: string;
  filingLabel: string;
  categoryActivity: string;
  evaluator: string | null;
  supervisor: string | null;
  approver: string | null;
  startedOn: LocalDate | null;
  stages: { title: string; checks: EvalCheckLine[] }[];
  postApproval: EvalCheckLine[];
  counts: { satisfied: number; failed: number; notApplicable: number; pending: number };
  recommendedOutcome: string;
  finalDecision: string | null;
  approvalDate: LocalDate | null;
  reasons: string | null;
  remarks: string | null;
  flags: string[];
  flagOverrideReason: string | null;
  registrationNo: string | null;
  printedOn: LocalDate;
};

export async function evaluationData(db: DbOrTx, id: string): Promise<EvaluationData> {
  const l = await loadSubmission(db, id);
  const { row, a } = l;
  const ev = l.evaluation;
  const names = await namesOf(db, [ev?.evaluatingOfficerId, ev?.reviewingSupervisorId, ev?.approvingOfficerId]);
  const name = (uid: string | null | undefined) => (uid ? (names.get(uid) ?? null) : null);
  const post = new Set<string>(POST_APPROVAL_CHECKS);
  const line = (c: (typeof l.ref.checks)[number]): EvalCheckLine => {
    const r = a.checks.results.find((x) => x.id === c.id);
    return { id: c.id, text: c.text, value: r?.value ?? "", automatic: !!r?.automatic, applicable: r?.applicable ?? true };
  };
  const ordered = [...l.ref.checks].sort((x, y) => x.sort - y.sort);
  const stages: EvaluationData["stages"] = [];
  for (const c of ordered.filter((c) => !post.has(c.id))) {
    const last = stages.at(-1);
    if (last?.title === c.stage) last.checks.push(line(c));
    else stages.push({ title: c.stage, checks: [line(c)] });
  }
  const act = activityName(l, row.primaryActivity);
  return {
    head: letterhead(l),
    ackNo: row.ackNo,
    registrant: row.registeredName,
    filingLabel: FILING_LABELS[row.filingType as keyof typeof FILING_LABELS],
    categoryActivity: [a.categoryApplied, act].filter(Boolean).join(" — ") || "Not determined",
    evaluator: name(ev?.evaluatingOfficerId),
    supervisor: name(ev?.reviewingSupervisorId),
    approver: name(ev?.approvingOfficerId),
    startedOn: ev?.startedOn ?? null,
    stages,
    postApproval: ordered.filter((c) => post.has(c.id)).map(line),
    counts: { satisfied: a.checks.satisfied, failed: a.checks.failed, notApplicable: a.checks.notApplicable, pending: a.checks.pending },
    recommendedOutcome: a.recommendedOutcome,
    finalDecision: ev?.finalDecision ?? null,
    approvalDate: ev?.approvalDate ?? null,
    reasons: ev?.reasons ?? null,
    remarks: ev?.remarks ?? null,
    flags: a.flags.map((f) => f.text),
    flagOverrideReason: ev?.flagOverrideReason ?? null,
    registrationNo: row.registrationNo ?? a.registrationNoInUse,
    printedOn: lagosToday(),
  };
}

// ---------------------------------------------------------------------------
// CERT-01 certificate (para 13(5))

export type Signer = { name: string; designation: string; confirmed: boolean };
export type CertificateData = {
  serial: string;
  registrationNo: string;
  registrant: string;
  cacNo: string | null;
  address: string | null;
  category: string;
  primaryActivity: string;
  otherActivities: string[];
  serviceArea: string;
  licence: string;
  issueDate: LocalDate;
  chairman: Signer | null;
  commissioner: Signer | null;
  /** Why the certificate prints as a draft, if it does (Q28e). */
  draftReason: string | null;
  /** Set when the registration is no longer in force. */
  voidReason: string | null;
  needsReissue: boolean;
  submissionId: string;
};

async function signer(db: DbOrTx, role: "chairman_ceo" | "commissioner"): Promise<Signer | null> {
  const rows = await db
    .select()
    .from(signatories)
    .where(and(eq(signatories.role, role), eq(signatories.active, true)))
    .orderBy(desc(signatories.confirmed), asc(signatories.name));
  const s = rows[0];
  return s ? { name: s.name, designation: s.designation, confirmed: s.confirmed } : null;
}

export async function certificateData(db: DbOrTx, id: string): Promise<CertificateData> {
  const l = await loadSubmission(db, id);
  const { row, a } = l;
  if (row.filingType !== "NEW" || !row.registrationNo || !row.certificateIssueDate) {
    throw blocked("A certificate exists only once a new registration is approved and has its registration number.");
  }
  const [chairman, commissioner] = await Promise.all([signer(db, "chairman_ceo"), signer(db, "commissioner")]);
  const missing = [
    !chairman ? "no Chairman / CEO" : !chairman.confirmed ? `${chairman.name} (Chairman / CEO) not confirmed` : null,
    !commissioner ? "no Commissioner" : !commissioner.confirmed ? `${commissioner.name} (Commissioner) not confirmed` : null,
  ].filter(Boolean);
  const area = [row.principalLga, row.otherLgas, row.townsEstates].map((x) => x?.trim()).filter(Boolean).join("; ");
  const licNos = l.licences.map((x) => x.licenceNo?.trim()).filter(Boolean);
  const licence = row.licenceStatus
    ? `${row.licenceStatus}${licNos.length ? `, No. ${licNos.join("; ")}` : ""}`
    : licNos.join("; ") || "None stated";
  return {
    serial: row.certificateSerial ? String(row.certificateSerial).padStart(4, "0") : "—",
    registrationNo: row.registrationNo,
    registrant: row.registeredName,
    cacNo: row.cacNo,
    address: row.registeredAddress,
    category: categoryText(l, a.categoryApplied) ?? "—",
    primaryActivity: activityName(l, row.primaryActivity) ?? "—",
    otherActivities: l.otherActivities.map((c) => activityName(l, c)).filter((x): x is string => !!x),
    serviceArea: area || "—",
    licence,
    issueDate: row.certificateIssueDate,
    chairman,
    commissioner,
    draftReason: missing.length ? `Signatories: ${missing.join("; ")}. Confirm them under Admin › Signatories.` : null,
    voidReason: row.status && row.status !== "Registered" ? row.status : null,
    needsReissue: row.certificateNeedsReissue,
    submissionId: row.id,
  };
}
