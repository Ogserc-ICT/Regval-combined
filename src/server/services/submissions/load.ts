/**
 * Loads a submission with everything the rules need and assesses it.
 */
import { and, asc, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { yearOf } from "@/domain/dates";
import { assess, type Assessment } from "@/domain/registration/assess";
import type { AssessContext, Filing, RefData, Status, SubmissionFacts } from "@/domain/registration/types";
import type { Settings } from "@/domain/settings";
import { all, type DbOrTx } from "../../db/connect";
import {
  documentChecklist,
  evaluationAnswers,
  evaluations,
  payments,
  submissionLicences,
  submissionOtherActivities,
  submissions,
} from "../../db/schema";
import { notFound } from "../../errors";
import { lagosToday } from "../../time";
import { getSettings } from "../settings";
import { loadRef, signatoriesReady } from "../reference";

export type SubmissionRow = typeof submissions.$inferSelect;

export type LoadedSubmission = {
  row: SubmissionRow;
  otherActivities: string[];
  licences: { licenceNo: string | null; expiryDate: string | null }[];
  evaluation: typeof evaluations.$inferSelect | null;
  answers: Record<string, string>;
  payments: (typeof payments.$inferSelect)[];
  facts: SubmissionFacts;
  ctx: AssessContext;
  a: Assessment;
  settings: Settings;
  ref: RefData;
};

const COND: Record<string, keyof SubmissionRow> = {
  multi_state_licensee: "condMultiState",
  generation_for_sale: "condGenerationForSale",
  grid_connected: "condGridConnected",
  interconnected_minigrid: "condInterconnectedMinigrid",
  f_distribution: "condFDistribution",
  f_trading: "condFTrading",
  g_disco_bulk_supply: "condDiscoBulkSupply",
  sub_franchise: "condSubFranchise",
};
export const CONDITION_COLUMNS = COND;

export function toFacts(
  row: SubmissionRow,
  deemed: string | null,
  others: string[],
  licences: SubmissionFacts["licences"],
): SubmissionFacts {
  return {
    ackNo: row.ackNo,
    status: (row.status as Status | null) ?? null,
    filingType: row.filingType as Filing,
    formFiled: row.formFiled,
    linkedRegistrationNo: row.linkedRegistrationNo,
    registeredName: row.registeredName,
    dateSubmitted: row.dateSubmitted,
    deemedReceiptDate: deemed,
    registrantType: row.registrantType,
    cacNo: row.cacNo,
    principalLga: row.principalLga,
    primaryActivity: row.primaryActivity,
    otherActivities: others,
    installedCapacityMw: row.installedCapacityMw,
    licenceStatus: row.licenceStatus,
    licences,
    operatingOnEffectiveDate: (row.operatingOnEffectiveDate as "Y" | "N" | null) ?? null,
    plannedStartDate: row.plannedStartDate,
    approvedWaiver: row.approvedWaiver,
    categoryOverride: row.categoryOverride,
    overrideReason: row.overrideReason,
    conditions: Object.fromEntries(Object.entries(COND).map(([k, col]) => [k, row[col] as boolean | null])),
    formSectionsNotComplete: row.formSectionsNotComplete,
    capacityInSectionsMw: row.capacityInSectionsMw,
    confirmedCategory: row.confirmedCategory,
    categoryConfirmedReason: row.categoryConfirmedReason,
    releasedOn: row.releasedOn,
    dateSubmissionComplete: row.dateSubmissionComplete,
    deficiencyNoticeDate: row.deficiencyNoticeDate,
    showCauseDate: row.showCauseDate,
    certificateIssueDate: row.certificateIssueDate,
    registrationNo: row.registrationNo,
    priced: row.pricedCategory
      ? {
          category: row.pricedCategory,
          fee: row.pricedFee ?? 0,
          lateInitial: row.pricedLateInitial ?? 0,
          lateDaily: row.pricedLateDaily ?? 0,
          lateCap: row.pricedLateCap ?? 0,
          deadline: row.pricedDeadline,
          effectiveDate: row.pricedEffectiveDate ?? "",
        }
      : null,
    createdBy: row.createdBy,
  };
}

const familyOf = (row: Pick<SubmissionRow, "id" | "linkedSubmissionId">) => row.linkedSubmissionId ?? row.id;

/** Duplicate CAC / name on a saved submission of another family (para 11(4)). */
export async function duplicateChecks(db: DbOrTx, row: Pick<SubmissionRow, "id" | "linkedSubmissionId" | "cacNo" | "registeredName">) {
  const family = familyOf(row);
  const otherFamily = sql`coalesce(${submissions.linkedSubmissionId}, ${submissions.id}) <> ${family}`;
  const cac = row.cacNo?.trim().toLowerCase();
  const name = row.registeredName?.trim().toLowerCase();
  const [c] = cac
    ? await db
        .select({ ack: submissions.ackNo, name: submissions.registeredName })
        .from(submissions)
        .where(and(isNotNull(submissions.status), sql`lower(trim(${submissions.cacNo})) = ${cac}`, otherFamily))
        .limit(1)
    : [];
  const [n] = name
    ? await db
        .select({ ack: submissions.ackNo })
        .from(submissions)
        .where(and(isNotNull(submissions.status), sql`lower(trim(${submissions.registeredName})) = ${name}`, otherFamily))
        .limit(1)
    : [];
  return { cac: c ?? null, name: n ?? null };
}

export type ListedSubmission = { row: SubmissionRow; deemed: string | null; a: Assessment; evaluation: typeof evaluations.$inferSelect | null };

/**
 * Assess many submissions with a fixed number of queries (Register list,
 * queues, dashboard). Same rules as loadSubmission.
 */
export async function assessMany(db: DbOrTx, rows: SubmissionRow[], today = lagosToday()): Promise<ListedSubmission[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [others, lics, evs, answers, pays, checks, settings, ref, sigs, allSaved] = await all(db, [
    () => db.select().from(submissionOtherActivities).where(inArray(submissionOtherActivities.submissionId, ids)),
    () => db.select().from(submissionLicences).where(inArray(submissionLicences.submissionId, ids)),
    () => db.select().from(evaluations).where(inArray(evaluations.submissionId, ids)),
    () => db.select().from(evaluationAnswers).where(inArray(evaluationAnswers.submissionId, ids)),
    () => db.select().from(payments).where(and(eq(payments.ownerType, "submission"), inArray(payments.ownerId, ids))),
    () => db.select().from(documentChecklist).where(and(eq(documentChecklist.ownerType, "submission"), inArray(documentChecklist.ownerId, ids))),
    () => getSettings(db),
    () => loadRef(db),
    () => signatoriesReady(db),
    () => db
      .select({
        id: submissions.id,
        linked: submissions.linkedSubmissionId,
        cac: submissions.cacNo,
        name: submissions.registeredName,
        status: submissions.status,
        filing: submissions.filingType,
        date: submissions.dateSubmitted,
        cert: submissions.certificateIssueDate,
        regNo: submissions.registrationNo,
      })
      .from(submissions)
      .where(isNotNull(submissions.status)),
  ]);
  const byId = new Map(allSaved.map((s) => [s.id, s]));
  const fam = (s: { id: string; linked: string | null }) => s.linked ?? s.id;
  const norm = (v: string | null) => v?.trim().toLowerCase() || null;
  const cacFamilies = new Map<string, Set<string>>();
  const nameFamilies = new Map<string, Set<string>>();
  for (const s of allSaved) {
    const c = norm(s.cac);
    if (c) (cacFamilies.get(c) ?? cacFamilies.set(c, new Set()).get(c)!).add(fam(s));
    const n = norm(s.name);
    if (n) (nameFamilies.get(n) ?? nameFamilies.set(n, new Set()).get(n)!).add(fam(s));
  }
  const otherFamily = (m: Map<string, Set<string>>, key: string | null, family: string) => {
    if (!key) return false;
    const set = m.get(key);
    return !!set && [...set].some((f) => f !== family);
  };
  const year = yearOf(today);
  const annualThisYear = new Set(
    allSaved
      .filter((s) => s.filing === "ANNUAL" && s.linked && Number(s.date.slice(0, 4)) === year && !["Refused", "Lapsed", "Cancelled"].includes(s.status ?? ""))
      .map((s) => s.linked!),
  );
  return rows.map((row) => {
    const o = others.filter((x) => x.submissionId === row.id).sort((a, b) => a.position - b.position).map((x) => x.activity);
    const l = lics.filter((x) => x.submissionId === row.id).sort((a, b) => a.position - b.position).map((x) => ({ licenceNo: x.licenceNo, expiryDate: x.expiryDate }));
    const ev = evs.find((e) => e.submissionId === row.id) ?? null;
    const ans = Object.fromEntries(answers.filter((x) => x.submissionId === row.id).map((x) => [x.checkId, x.value]));
    const deemed = row.deemedReceiptDate;
    const facts = toFacts(row, deemed, o, l);
    const parent = row.linkedSubmissionId ? byId.get(row.linkedSubmissionId) : undefined;
    const family = row.linkedSubmissionId ?? row.id;
    const ctx: AssessContext = {
      today,
      settings,
      ref,
      payments: pays
        .filter((p) => p.ownerId === row.id)
        .map((p) => ({ amount: p.amount, dateReceived: p.dateReceived, financeStatus: p.financeStatus, reversed: p.reversed })),
      checklist: Object.fromEntries(checks.filter((c) => c.ownerId === row.id).map((c) => [c.key, c.value])),
      evaluation: ev
        ? {
            evaluatingOfficerId: ev.evaluatingOfficerId,
            reviewingSupervisorId: ev.reviewingSupervisorId,
            approvingOfficerId: ev.approvingOfficerId,
            startedOn: ev.startedOn,
            flagOverrideReason: ev.flagOverrideReason,
            finalDecision: ev.finalDecision,
            answers: ans,
          }
        : null,
      linked: parent ? { status: (parent.status as Status | null) ?? null, certificateIssueDate: parent.cert, registrationNo: parent.regNo } : null,
      duplicates: {
        cac: otherFamily(cacFamilies, norm(row.cacNo), family),
        name: otherFamily(nameFamilies, norm(row.registeredName), family),
        registrationNo: false,
      },
      annualFiledThisYear: annualThisYear.has(row.id),
      signatories: sigs,
    };
    return { row, deemed, a: assess(facts, ctx), evaluation: ev };
  });
}

export async function loadSubmission(db: DbOrTx, id: string, today = lagosToday()): Promise<LoadedSubmission> {
  const [row] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!row) throw notFound("Submission");
  const [others, lics, [evaluation], answerRows, pays, checklistRows, settings, ref, sigs] = await all(db, [
    () => db.select().from(submissionOtherActivities).where(eq(submissionOtherActivities.submissionId, id)).orderBy(asc(submissionOtherActivities.position)),
    () => db.select().from(submissionLicences).where(eq(submissionLicences.submissionId, id)).orderBy(asc(submissionLicences.position)),
    () => db.select().from(evaluations).where(eq(evaluations.submissionId, id)),
    () => db.select().from(evaluationAnswers).where(eq(evaluationAnswers.submissionId, id)),
    () => db.select().from(payments).where(and(eq(payments.ownerType, "submission"), eq(payments.ownerId, id))).orderBy(asc(payments.recordedAt)),
    () => db.select().from(documentChecklist).where(and(eq(documentChecklist.ownerType, "submission"), eq(documentChecklist.ownerId, id))),
    () => getSettings(db),
    () => loadRef(db),
    () => signatoriesReady(db),
  ]);
  const licences = lics.map((l) => ({ licenceNo: l.licenceNo, expiryDate: l.expiryDate }));
  const facts = toFacts(row, row.deemedReceiptDate, others.map((o) => o.activity), licences);

  let linked: AssessContext["linked"] = null;
  if (row.linkedSubmissionId) {
    const [p] = await db.select().from(submissions).where(eq(submissions.id, row.linkedSubmissionId));
    if (p) linked = { status: (p.status as Status | null) ?? null, certificateIssueDate: p.certificateIssueDate, registrationNo: p.registrationNo };
  }
  const dups = await duplicateChecks(db, row);
  let annualFiledThisYear = false;
  if (row.filingType === "NEW" && row.status === "Registered") {
    const y = yearOf(today);
    const [a] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.linkedSubmissionId, id),
          eq(submissions.filingType, "ANNUAL"),
          isNotNull(submissions.status),
          notInArray(submissions.status, ["Refused", "Lapsed", "Cancelled"]),
          sql`extract(year from ${submissions.dateSubmitted}) = ${y}`,
          ne(submissions.id, id),
        ),
      )
      .limit(1);
    annualFiledThisYear = !!a;
  }
  const answers = Object.fromEntries(answerRows.map((r) => [r.checkId, r.value]));
  const ctx: AssessContext = {
    today,
    settings,
    ref,
    payments: pays.map((p) => ({ amount: p.amount, dateReceived: p.dateReceived, financeStatus: p.financeStatus, reversed: p.reversed })),
    checklist: Object.fromEntries(checklistRows.map((c) => [c.key, c.value])),
    evaluation: evaluation
      ? {
          evaluatingOfficerId: evaluation.evaluatingOfficerId,
          reviewingSupervisorId: evaluation.reviewingSupervisorId,
          approvingOfficerId: evaluation.approvingOfficerId,
          startedOn: evaluation.startedOn,
          flagOverrideReason: evaluation.flagOverrideReason,
          finalDecision: evaluation.finalDecision,
          answers,
        }
      : null,
    linked,
    duplicates: { cac: !!dups.cac, name: !!dups.name, registrationNo: false },
    annualFiledThisYear,
    signatories: sigs,
  };
  return {
    row,
    otherActivities: facts.otherActivities,
    licences,
    evaluation: evaluation ?? null,
    answers,
    payments: pays,
    facts,
    ctx,
    a: assess(facts, ctx),
    settings,
    ref,
  };
}
