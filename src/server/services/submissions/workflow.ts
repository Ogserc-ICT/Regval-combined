/**
 * Status workflow (SPEC §11.3, §13; modWorkflow, modPayments.TryRelease/GateOk,
 * modIntake.ConfirmCategoryFor/RecalculatePricingFor). Every action lists all
 * its blocking reasons at once and is audited.
 */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { addDays, diffDays, longDate, yearOf } from "@/domain/dates";
import { formatNaira } from "@/domain/money";
import { OUTCOMES, AUTO_CHECKS, DECISION_CHECKS, POST_APPROVAL_CHECKS } from "@/domain/registration/checks";
import { separationOfDuties } from "@/domain/registration/assess";
import { currentPricing } from "@/domain/registration/pricing";
import { CLOSED_STATUSES, ST } from "@/domain/registration/types";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import {
  deficiencyNotices,
  documentChecklist,
  evaluationAnswers,
  evaluations,
  submissionLicences,
  submissionOtherActivities,
  submissions,
  userRoles,
} from "../../db/schema";
import { blocked, forbidden, needsConfirmation, notFound, Problems, ServiceError } from "../../errors";
import { issueNumber } from "../../numbering";
import { lagosToday } from "../../time";
import { evaluationOfficers, notify, submissionHref } from "../notifications";
import { listValues } from "../reference";
import { getSettings } from "../settings";
import { loadSubmission, type LoadedSubmission } from "./load";

const audit = (tx: Tx, actor: Actor, l: LoadedSubmission, action: string, detail: string, data?: unknown) =>
  writeAudit(tx, {
    actor: auditActor(actor),
    action,
    module: "registration",
    entityType: "submission",
    entityId: l.row.id,
    reference: l.row.ackNo,
    detail,
    data,
  });

async function lockAndLoad(tx: Tx, id: string): Promise<LoadedSubmission> {
  const [r] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, id)).for("update");
  if (!r) throw notFound("Submission");
  return loadSubmission(tx, id);
}

/**
 * Release for evaluation once confirmed payments clear the gate (SPEC §11.3).
 * Returns true if released.
 */
export async function tryRelease(tx: Tx, actor: Actor | null, id: string): Promise<boolean> {
  const l = await loadSubmission(tx, id);
  if (l.row.status !== ST.AWAITING || !l.a.gateCleared) return false;
  const today = l.ctx.today;
  await tx.update(submissions).set({ status: ST.RECEIVED, releasedOn: today, updatedAt: new Date() }).where(eq(submissions.id, id));
  if (l.evaluation?.evaluatingOfficerId && !l.evaluation.startedOn) {
    await tx.update(evaluations).set({ startedOn: today, updatedAt: new Date() }).where(eq(evaluations.submissionId, id));
  }
  await writeAudit(tx, {
    actor: actor ? auditActor(actor) : { id: null, name: "System" },
    action: "Released for evaluation",
    module: "registration",
    entityType: "submission",
    entityId: id,
    reference: l.row.ackNo,
    detail: `Confirmed payments ${formatNaira(l.a.payments.amountPaid)} cover ${formatNaira(l.a.releaseRequires)}`,
  });
  const evaluator = l.evaluation?.evaluatingOfficerId;
  await notify(tx, actor, {
    kind: "submission:released",
    title: evaluator ? `Ready to evaluate: ${l.row.ackNo}` : `Released, officers to assign: ${l.row.ackNo}`,
    body: `${l.row.registeredName ?? "Submission"} is cleared by Finance and released for evaluation`,
    reference: l.row.ackNo,
    href: submissionHref(id, "evaluation"),
    to: evaluator ? { users: [evaluator] } : { roles: ["supervisor"] },
  });
  return true;
}

class GateBlocked extends Error {
  constructor(readonly ack: string, readonly id: string, readonly reason: string) {
    super(reason);
  }
}

/**
 * Runs an evaluation action behind the Finance gate. A blocked attempt is
 * audited ("Blocked - awaiting Finance confirmation") in its own transaction
 * so the record survives the refusal.
 */
async function gated<T>(db: Db, actor: Actor, id: string, actionName: string, fn: (tx: Tx, l: LoadedSubmission) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tryRelease(tx, actor, id);
      const l = await lockAndLoad(tx, id);
      if (!l.a.closed && !l.a.gateCleared) throw new GateBlocked(l.row.ackNo, id, l.a.gateReason);
      return fn(tx, l);
    });
  } catch (e) {
    if (e instanceof GateBlocked) {
      await db.transaction((tx) =>
        writeAudit(tx, {
          actor: auditActor(actor),
          action: "Blocked - awaiting Finance confirmation",
          module: "registration",
          entityType: "submission",
          entityId: e.id,
          reference: e.ack,
          detail: `${actionName}: ${e.reason}`,
        }),
      );
      throw blocked(`${actionName} is blocked. ${e.reason}.`);
    }
    throw e;
  }
}

/** A final decision: the Registry acts on it, and the evaluating officer hears the outcome. */
export async function notifyDecision(tx: Tx, actor: Actor | null, id: string, ack: string, title: string, body: string | null) {
  const { evaluator } = await evaluationOfficers(tx, id);
  await notify(tx, actor, { kind: "submission:decision", title, body, reference: ack, href: submissionHref(id), to: { roles: ["registry"], users: [evaluator] } });
}

function requireEvaluatorOrSupervisor(actor: Actor, l: LoadedSubmission) {
  const ev = l.evaluation;
  if (actor.id !== ev?.evaluatingOfficerId && actor.id !== ev?.reviewingSupervisorId) {
    throw forbidden("Only the assigned evaluating officer or reviewing supervisor can do this.");
  }
}

// ---------------------------------------------------------------- officers and checks

export type OfficerAssignment = { evaluatingOfficerId?: string | null; reviewingSupervisorId?: string | null; approvingOfficerId?: string | null };

/** Assign the three officers ([G2]: from user accounts with the role; [G8]: four different people). */
export async function assignOfficers(db: Db, actor: Actor | null, id: string, input: OfficerAssignment): Promise<void> {
  authorize(actor, "evaluation:assign");
  await db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    if (!l.row.status) throw blocked("Save the Register entry first.");
    if (l.evaluation?.finalDecision) throw blocked("A final decision is recorded.");
    const next = {
      evaluatingOfficerId: input.evaluatingOfficerId === undefined ? (l.evaluation?.evaluatingOfficerId ?? null) : input.evaluatingOfficerId || null,
      reviewingSupervisorId: input.reviewingSupervisorId === undefined ? (l.evaluation?.reviewingSupervisorId ?? null) : input.reviewingSupervisorId || null,
      approvingOfficerId: input.approvingOfficerId === undefined ? (l.evaluation?.approvingOfficerId ?? null) : input.approvingOfficerId || null,
    };
    const p = new Problems();
    const ids = Object.values(next).filter((x): x is string => !!x);
    const roles = ids.length ? await tx.select().from(userRoles).where(inArray(userRoles.userId, ids)) : [];
    const has = (uid: string | null, role: string) => !uid || roles.some((r) => r.userId === uid && r.role === role);
    if (!has(next.evaluatingOfficerId, "evaluator")) p.field("evaluatingOfficerId", "The evaluating officer must hold the Evaluating officer role.");
    if (!has(next.reviewingSupervisorId, "supervisor")) p.field("reviewingSupervisorId", "The reviewing supervisor must hold the Reviewing supervisor role.");
    if (!has(next.approvingOfficerId, "approver")) p.field("approvingOfficerId", "The approving officer must hold the Approving officer role.");
    for (const msg of separationOfDuties(next, l.row.createdBy)) p.reason(msg);
    p.throwIfAny("blocked");
    const startedOn = next.evaluatingOfficerId && !l.evaluation?.startedOn && l.row.releasedOn ? l.ctx.today : (l.evaluation?.startedOn ?? null);
    await tx
      .insert(evaluations)
      .values({ submissionId: id, ...next, startedOn })
      .onConflictDoUpdate({ target: evaluations.submissionId, set: { ...next, startedOn, updatedAt: new Date() } });
    await audit(tx, actor, l, "Officers assigned", "Evaluating officer, reviewing supervisor and approving officer updated", next);
    const assigned = [
      [next.evaluatingOfficerId, l.evaluation?.evaluatingOfficerId, "evaluating officer"],
      [next.reviewingSupervisorId, l.evaluation?.reviewingSupervisorId, "reviewing supervisor"],
      [next.approvingOfficerId, l.evaluation?.approvingOfficerId, "approving officer"],
    ] as const;
    for (const [now, before, as] of assigned) {
      if (!now || now === before) continue;
      await notify(tx, actor, {
        kind: "submission:assigned",
        title: `You are the ${as}: ${l.row.ackNo}`,
        body: l.row.registeredName,
        reference: l.row.ackNo,
        href: submissionHref(id, "evaluation"),
        to: { users: [now] },
      });
    }
  });
}

/** Answer manual EVAL-01 checks (automatic ones are calculated and cannot be set). */
export async function answerChecks(db: Db, actor: Actor | null, id: string, answers: Record<string, string>, remarks?: string | null): Promise<number> {
  authorize(actor, "evaluation:check");
  return gated(db, actor, id, "Evaluation", async (tx, l) => {
    requireEvaluatorOrSupervisor(actor, l);
    if (l.a.closed || l.evaluation?.finalDecision) throw blocked("A final decision is recorded; the checks are closed.");
    const valid = new Set<string>([...DECISION_CHECKS, ...POST_APPROVAL_CHECKS].filter((c) => !AUTO_CHECKS.has(c)));
    const changes: string[] = [];
    for (const [checkId, raw] of Object.entries(answers)) {
      if (!valid.has(checkId)) continue;
      const value = raw.trim().toUpperCase();
      const before = l.answers[checkId] ?? "";
      if (value === before) continue;
      if (value === "") {
        await tx.delete(evaluationAnswers).where(and(eq(evaluationAnswers.submissionId, id), eq(evaluationAnswers.checkId, checkId)));
      } else if (["Y", "N", "N/A"].includes(value)) {
        await tx
          .insert(evaluationAnswers)
          .values({ submissionId: id, checkId, value, answeredBy: actor.id })
          .onConflictDoUpdate({ target: [evaluationAnswers.submissionId, evaluationAnswers.checkId], set: { value, answeredBy: actor.id, answeredAt: new Date() } });
      } else continue;
      changes.push(`${checkId}: ${before || "(blank)"} → ${value || "(blank)"}`);
    }
    if (remarks !== undefined && (remarks ?? null) !== (l.evaluation?.remarks ?? null)) {
      await tx.update(evaluations).set({ remarks, updatedAt: new Date() }).where(eq(evaluations.submissionId, id));
      changes.push("evaluation remarks changed");
    }
    if (!l.evaluation?.startedOn && changes.length) {
      await tx.update(evaluations).set({ startedOn: l.ctx.today }).where(eq(evaluations.submissionId, id));
    }
    if (changes.length) await audit(tx, actor, l, "Evaluation checks", changes.join("; "));
    return changes.length;
  });
}

/** The written reason that explains (overrides) unresolved data flags (Q11). */
export async function setFlagOverrideReason(db: Db, actor: Actor | null, id: string, reason: string): Promise<void> {
  authorize(actor, "registers:read");
  await db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    const ev = l.evaluation;
    if (actor.id !== ev?.approvingOfficerId && actor.id !== ev?.reviewingSupervisorId) {
      throw forbidden("Only the assigned approving officer or reviewing supervisor can explain the data flags.");
    }
    if (l.a.closed) throw blocked(`Submission is closed (${l.row.status}).`);
    const value = reason.trim() || null;
    await tx.update(evaluations).set({ flagOverrideReason: value, updatedAt: new Date() }).where(eq(evaluations.submissionId, id));
    await audit(tx, actor, l, "Flag override reason", value ? `${l.a.flags.length} flag(s) explained: ${value}` : "Override reason cleared");
  });
}

// ---------------------------------------------------------------- documents

export async function setDocument(db: Db, actor: Actor | null, id: string, key: string, value: string | null, remarks?: string | null): Promise<void> {
  authorize(actor, "documents:update");
  await db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    if (l.a.closed) throw blocked(`Submission is closed (${l.row.status}).`);
    const item = l.a.documents.items.find((i) => i.key === key);
    if (!item) throw blocked("That document is not on this submission's current list.");
    if (item.key === "payment_evidence") throw blocked("Evidence of payment is ticked automatically when Finance confirms the fee.");
    const v = (value ?? "").trim().toUpperCase();
    if (v && !["Y", "N", "N/A"].includes(v)) throw blocked("Choose Y, N or N/A.");
    await tx
      .insert(documentChecklist)
      .values({ ownerType: "submission", ownerId: id, key, form: item.form, value: v || null, remarks: remarks ?? null, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: [documentChecklist.ownerType, documentChecklist.ownerId, documentChecklist.key],
        set: { value: v || null, remarks: remarks ?? null, updatedBy: actor.id, updatedAt: new Date() },
      });
    if ((item.entered || "") !== v) await audit(tx, actor, l, "Document", `${item.document}: ${item.entered || "(blank)"} → ${v || "(blank)"}`);
  });
}

// ---------------------------------------------------------------- category and pricing

/** Confirm category (SPEC §13.3; check 1.10). */
export async function confirmCategory(db: Db, actor: Actor | null, id: string, category: string, reason: string | null): Promise<string> {
  authorize(actor, "evaluation:check");
  return gated(db, actor, id, "Category confirmation", async (tx, l) => {
    requireEvaluatorOrSupervisor(actor, l);
    const p = new Problems();
    if (l.a.closed) p.reason(`The category cannot be confirmed now: submission is closed (${l.row.status}).`);
    if (l.evaluation?.finalDecision) p.reason("The category cannot be confirmed now: a final decision is already recorded.");
    const cat = category.trim().toUpperCase();
    if (!l.ref.fees.some((f) => f.category === cat) || cat === "I") p.field("category", "Choose a Schedule 3 category (A to K, not I).");
    const formCat = l.a.formCategory;
    const why = reason?.trim() || null;
    if (cat !== formCat && !why) p.field("reason", `A reason is required: the form filed (${l.row.formFiled}) is for Category ${formCat}.`);
    p.throwIfAny();
    const prev = l.row.confirmedCategory;
    await tx
      .update(submissions)
      .set({ confirmedCategory: cat, categoryConfirmedReason: cat !== formCat ? why : null, updatedAt: new Date() })
      .where(eq(submissions.id, id));
    let notes = `Category ${cat} confirmed (form filed ${l.row.formFiled})`;
    if (prev && prev !== cat) notes += `; was ${prev}`;
    if (cat !== formCat) {
      notes +=
        l.settings.wrongFormHandling === "Accept and re-categorise"
          ? `; accepted and re-categorised: ${why}; documents now follow REG-01${cat}`
          : `; differs from the form: ${why}; the applicant must file on REG-01${cat}`;
    }
    if (l.a.categoryApplied && l.a.categoryApplied !== cat) {
      notes += `; Category ${l.a.categoryApplied} is charged: correct the details or override, then an admin recalculates`;
    }
    await audit(tx, actor, l, "Category confirmed", notes);
    return notes;
  });
}

async function recalcOne(tx: Tx, actor: Actor, id: string, reason: string): Promise<{ before: string; after: string } | null> {
  const l = await lockAndLoad(tx, id);
  if (l.row.registrationNo) return null;
  const now = currentPricing(l.facts, l.ref, l.settings);
  const before = `${l.row.pricedCategory ?? "?"} ${formatNaira(l.row.pricedFee ?? 0)} deadline ${l.row.pricedDeadline ? longDate(l.row.pricedDeadline) : "none"}`;
  await tx
    .update(submissions)
    .set({
      pricedCategory: now?.category ?? null,
      pricedFee: now?.fee ?? null,
      pricedLateInitial: now?.lateInitial ?? null,
      pricedLateDaily: now?.lateDaily ?? null,
      pricedLateCap: now?.lateCap ?? null,
      pricedDeadline: now?.deadline ?? null,
      pricedEffectiveDate: now ? l.settings.effectiveDate : null,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, id));
  const after = `${now?.category ?? "?"} ${formatNaira(now?.fee ?? 0)} deadline ${now?.deadline ? longDate(now.deadline) : "none"}`;
  await audit(tx, actor, l, "Pricing recalculated", `${before} → ${after}; reason: ${reason}`);
  await tryRelease(tx, actor, id);
  return { before, after };
}

/** Recalculate one submission's pricing (Admin, reason required; refused once a registration number exists). */
export async function recalculatePricing(db: Db, actor: Actor | null, id: string, reason: string): Promise<string> {
  authorize(actor, "pricing:recalculate");
  if (!reason.trim()) new Problems().field("reason", "A reason is required.").throwIfAny();
  return db.transaction(async (tx) => {
    const r = await recalcOne(tx, actor, id, reason.trim());
    if (!r) throw blocked("Recalculation is refused once the registration number is locked.");
    return r.after;
  });
}

/** Q6: one click, one reason, every open submission without a registration number. */
export async function recalculateAllOpen(db: Db, actor: Actor | null, reason: string): Promise<{ recalculated: number; skipped: string[] }> {
  authorize(actor, "pricing:recalculate");
  if (!reason.trim()) new Problems().field("reason", "A reason is required.").throwIfAny();
  const rows = await db
    .select({ id: submissions.id, ack: submissions.ackNo, regNo: submissions.registrationNo, status: submissions.status })
    .from(submissions)
    .where(isNotNull(submissions.status));
  let recalculated = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    if (CLOSED_STATUSES.includes(r.status as never)) continue;
    if (r.regNo) {
      skipped.push(`${r.ack} (registration number ${r.regNo})`);
      continue;
    }
    await db.transaction(async (tx) => {
      if (await recalcOne(tx, actor, r.id, reason.trim())) recalculated += 1;
    });
  }
  return { recalculated, skipped };
}

// ---------------------------------------------------------------- decisions

/** Mark complete (SPEC §13.3; Q7: the date is set once and never reset). */
export async function markComplete(db: Db, actor: Actor | null, id: string): Promise<string> {
  authorize(actor, "evaluation:check");
  return gated(db, actor, id, "Mark complete", async (tx, l) => {
    requireEvaluatorOrSupervisor(actor, l);
    if (l.a.closed) throw blocked(`Cannot mark complete: submission is closed (${l.row.status}).`);
    if (!l.a.submissionComplete) {
      const required = l.settings.lateBlocksComplete === "Y" ? l.a.totalDue : l.a.netFee;
      const shortfall = Math.max(0, required - l.a.payments.amountPaid);
      throw blocked(
        "The submission is not complete.",
        ...l.a.documents.outstandingText.map((d) => `Outstanding: ${d}`),
        ...(shortfall > 0 ? [`Unpaid: ${formatNaira(shortfall)}`] : []),
        "Obtain these, or issue a deficiency notice (para 13(1)(b)).",
      );
    }
    const reopens = l.row.status === ST.DEFICIENCY;
    if (l.row.dateSubmissionComplete && !reopens) {
      throw blocked(`Already complete; determination due ${longDate(l.a.determinationDue!)}.`);
    }
    const date = l.row.dateSubmissionComplete ?? l.ctx.today;
    await tx
      .update(submissions)
      .set({ dateSubmissionComplete: date, ...(reopens ? { status: ST.RECEIVED } : {}), updatedAt: new Date() })
      .where(eq(submissions.id, id));
    const due = addDays(date, l.settings.determinationDays);
    await audit(
      tx,
      actor,
      l,
      "Submission complete",
      `Determination due ${longDate(due)}${reopens ? `; response to the deficiency notice received ${longDate(l.ctx.today)}, back to Received - Under Review` : ""}`,
    );
    await notify(tx, actor, {
      kind: "submission:complete",
      title: `Ready for decision: ${l.row.ackNo}`,
      body: `${l.row.registeredName ?? "Submission"} is complete; determination due ${longDate(due)}`,
      reference: l.row.ackNo,
      href: submissionHref(id, "evaluation"),
      to: { users: [l.evaluation?.reviewingSupervisorId, l.evaluation?.approvingOfficerId] },
    });
    return `Marked complete. Determination due ${longDate(due)} (para 13(1)).`;
  });
}

/** Issue a deficiency notice (SPEC §13.3; Q4 numbering; Q9: the assigned supervisor). */
export async function issueDeficiency(db: Db, actor: Actor | null, id: string, opts: { confirm?: boolean } = {}): Promise<string> {
  authorize(actor, "evaluation:deficiency");
  return gated(db, actor, id, "Deficiency notice", async (tx, l) => {
    const ev = l.evaluation;
    if (!ev?.reviewingSupervisorId) throw blocked("Assign a reviewing supervisor first: only the reviewing supervisor issues deficiency notices.");
    if (actor.id !== ev.reviewingSupervisorId) throw forbidden("Only the assigned reviewing supervisor issues deficiency notices.");
    if (l.a.closed) throw blocked(`A deficiency notice cannot be issued: submission is closed (${l.row.status}).`);
    if (l.row.status === ST.DEFICIENCY) throw blocked("A deficiency notice is already outstanding: mark the submission complete or lapse it.");
    if (l.a.checks.failed === 0 && l.a.submissionComplete && !opts.confirm) {
      throw needsConfirmation("No checks have failed and the submission is complete. Issue a deficiency notice anyway?");
    }
    const today = l.ctx.today;
    const { number } = await issueNumber(tx, "DEF", { year: yearOf(today) });
    const due = addDays(today, l.settings.deficiencyResponseDays);
    const docsOut = l.a.documents.outstanding + l.a.documents.pending;
    await tx.update(submissions).set({ status: ST.DEFICIENCY, deficiencyNoticeDate: today, updatedAt: new Date() }).where(eq(submissions.id, id));
    await tx.insert(deficiencyNotices).values({
      submissionId: id,
      defNo: number,
      issuedOn: today,
      responseDue: due,
      documentsOutstanding: docsOut,
      balance: Math.max(0, l.a.balance),
      checksFailed: l.a.checks.failed,
      issuedBy: actor.id,
    });
    await audit(
      tx,
      actor,
      l,
      "Deficiency notice issued",
      `${number}; response due ${longDate(due)}; ${docsOut} document(s) outstanding; balance ${formatNaira(Math.max(0, l.a.balance))}; ${l.a.checks.failed} check(s) failed`,
    );
    await notify(tx, actor, {
      kind: "submission:deficiency",
      title: `Deficiency notice ${number}: ${l.row.ackNo}`,
      body: `${l.row.registeredName ?? "Submission"}; response due ${longDate(due)}`,
      reference: l.row.ackNo,
      href: submissionHref(id),
      to: { roles: ["registry"], users: [ev.evaluatingOfficerId] },
    });
    return `Deficiency notice ${number} recorded; response due ${longDate(due)}.`;
  });
}

const CHANGE_FIELDS = [
  ["registeredName", "Registered name", true],
  ["tradingName", "Trading name", false],
  ["registrantType", "Registrant type", false],
  ["cacNo", "CAC no.", true],
  ["tin", "TIN", false],
  ["registeredAddress", "Registered address", true],
  ["principalLga", "Principal LGA", true],
  ["otherLgas", "Other LGAs served", true],
  ["townsEstates", "Towns / estates served", true],
  ["primaryActivity", "Primary activity", true],
  ["installedCapacityMw", "Installed capacity (MW)", false],
  ["customers", "Customers", false],
  ["licenceStatus", "Licence status", true],
  ["complianceOfficer", "Compliance officer", false],
  ["phone", "Phone", false],
  ["email", "Email", false],
] as const;

/** Copy each changed field of an approved filing to its registration (modWorkflow.ApplyChanges). */
async function applyChanges(tx: Tx, l: LoadedSubmission): Promise<{ changes: string[]; reissue: boolean; parentAck: string; parentRegNo: string }> {
  const parent = await loadSubmission(tx, l.row.linkedSubmissionId!);
  const changes: string[] = [];
  let reissue = false;
  const set: Record<string, unknown> = {};
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(blank)" : String(v));
  for (const [field, label, cert] of CHANGE_FIELDS) {
    const before = parent.row[field];
    const after = l.row[field];
    if (show(before) !== show(after)) {
      set[field] = after;
      changes.push(`${label}: ${show(before)} → ${show(after)}`);
      if (cert) reissue = true;
    }
  }
  const o1 = parent.otherActivities.join(", ");
  const o2 = l.otherActivities.join(", ");
  if (o1 !== o2) {
    changes.push(`Other activities: ${o1 || "(blank)"} → ${o2 || "(blank)"}`);
    reissue = true;
    await tx.delete(submissionOtherActivities).where(eq(submissionOtherActivities.submissionId, parent.row.id));
    if (l.otherActivities.length) {
      await tx.insert(submissionOtherActivities).values(l.otherActivities.map((activity, i) => ({ submissionId: parent.row.id, position: i + 1, activity })));
    }
  }
  const fmt = (ls: typeof l.licences) => ls.map((x) => `${x.licenceNo ?? ""} ${x.expiryDate ?? ""}`.trim()).join("; ");
  if (fmt(parent.licences) !== fmt(l.licences)) {
    changes.push(`Licences: ${fmt(parent.licences) || "(blank)"} → ${fmt(l.licences) || "(blank)"}`);
    reissue = true;
    await tx.delete(submissionLicences).where(eq(submissionLicences.submissionId, parent.row.id));
    if (l.licences.length) {
      await tx.insert(submissionLicences).values(l.licences.map((x, i) => ({ submissionId: parent.row.id, position: i + 1, ...x })));
    }
  }
  if (reissue) set.certificateNeedsReissue = true;
  if (Object.keys(set).length) await tx.update(submissions).set({ ...set, updatedAt: new Date() }).where(eq(submissions.id, parent.row.id));
  return { changes, reissue, parentAck: parent.row.ackNo, parentRegNo: parent.row.registrationNo ?? "" };
}

/** Approve and register, or apply an update / annual confirmation (SPEC §13.3, §16). */
export async function approve(db: Db, actor: Actor | null, id: string): Promise<string> {
  authorize(actor, "evaluation:decide");
  return db.transaction(async (tx) => {
    await tryRelease(tx, actor, id);
    const l = await lockAndLoad(tx, id);
    const reasons = [...l.a.approvalBlockers];
    if (l.evaluation?.approvingOfficerId && actor.id !== l.evaluation.approvingOfficerId) reasons.unshift("Only the assigned approving officer can decide");
    if (reasons.length) throw new ServiceError("blocked", reasons);
    const today = l.ctx.today;
    const overridden = l.a.flags.length ? `; ${l.a.flags.length} data flag(s) overridden: ${l.evaluation?.flagOverrideReason}` : "";
    await tx
      .update(evaluations)
      .set({ reviewDate: l.evaluation?.reviewDate ?? today, approvalDate: today, updatedAt: new Date() })
      .where(eq(evaluations.submissionId, id));
    if (l.row.filingType !== "NEW") {
      const { changes, reissue, parentAck, parentRegNo } = await applyChanges(tx, l);
      await tx
        .update(submissions)
        .set({ status: ST.APPLIED, dateSubmissionComplete: l.row.dateSubmissionComplete ?? today, updatedAt: new Date() })
        .where(eq(submissions.id, id));
      await tx.update(evaluations).set({ finalDecision: OUTCOMES.APPLY }).where(eq(evaluations.submissionId, id));
      await writeAudit(tx, {
        actor: auditActor(actor),
        action: changes.length === 0 && l.row.filingType === "ANNUAL" ? "Annual confirmation accepted" : "Changes applied",
        module: "registration",
        entityType: "submission",
        entityId: l.row.linkedSubmissionId,
        reference: parentAck,
        detail: `${l.row.ackNo}: ${changes.length ? changes.join("; ") : "no changes"}${reissue ? "; certificate needs reissue" : ""}`,
      });
      await audit(tx, actor, l, "Changes applied", `Approved by ${actor.name}; changes applied to ${parentRegNo}: ${changes.length} change(s)${reissue ? "; certificate needs reissue" : ""}${overridden}`);
      await notifyDecision(tx, actor, id, l.row.ackNo, `Changes applied: ${l.row.ackNo}`, `${parentRegNo}: ${changes.length} change(s)${reissue ? "; certificate needs reissue" : ""}`);
      return `Changes applied to ${parentRegNo} (${changes.length} change(s)).${reissue ? " The certificate needs reissue." : ""}`;
    }
    const scope = `${l.a.categoryApplied}-${l.a.primaryCode}`;
    const { number } = await issueNumber(tx, "REG", { year: yearOf(today), scope });
    await tx
      .update(submissions)
      .set({ status: ST.REGISTERED, registrationNo: number, certificateIssueDate: today, dateSubmissionComplete: l.row.dateSubmissionComplete ?? today, updatedAt: new Date() })
      .where(eq(submissions.id, id));
    await tx.update(evaluations).set({ finalDecision: OUTCOMES.REGISTER }).where(eq(evaluations.submissionId, id));
    await audit(tx, actor, l, "Registered", `${number} - approved by ${actor.name}${overridden}`);
    await notifyDecision(tx, actor, id, l.row.ackNo, `Registered: ${l.row.ackNo} as ${number}`, l.row.registeredName);
    return `Registered as ${number}.`;
  });
}

/** Lapse (SPEC §13.3; Q9: the assigned approving officer). */
export async function lapse(db: Db, actor: Actor | null, id: string): Promise<string> {
  authorize(actor, "evaluation:decide");
  return db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    const p = new Problems();
    if (l.evaluation?.approvingOfficerId !== actor.id) p.reason("Only the assigned approving officer can lapse a submission");
    if (l.row.status !== ST.DEFICIENCY) p.reason("Only a submission with a deficiency notice issued can lapse");
    else if (!l.a.deficiencyResponseDue) p.reason("No deficiency notice date recorded");
    else if (!(l.ctx.today > l.a.deficiencyResponseDue)) p.reason(`The response period runs until ${longDate(l.a.deficiencyResponseDue)}`);
    p.throwIfAny("blocked");
    await tx.update(submissions).set({ status: ST.LAPSED, updatedAt: new Date() }).where(eq(submissions.id, id));
    await tx.update(evaluations).set({ finalDecision: OUTCOMES.LAPSE, approvalDate: l.ctx.today, updatedAt: new Date() }).where(eq(evaluations.submissionId, id));
    await audit(tx, actor, l, "Lapsed", `No complete response by ${longDate(l.a.deficiencyResponseDue!)} (para 13(2))`);
    await notifyDecision(tx, actor, id, l.row.ackNo, `Lapsed: ${l.row.ackNo}`, l.row.registeredName);
    return `${l.row.ackNo} has lapsed (para 13(2)). A fresh application is needed.`;
  });
}

/** Record the show-cause notice date (para 20). */
export async function setShowCauseDate(db: Db, actor: Actor | null, id: string, date: string | null): Promise<void> {
  authorize(actor, "registers:read");
  await db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    const ev = l.evaluation;
    if (actor.id !== ev?.approvingOfficerId && actor.id !== ev?.reviewingSupervisorId) {
      throw forbidden("Only the assigned approving officer or reviewing supervisor records the show-cause date.");
    }
    if (l.a.closed) throw blocked(`Submission is closed (${l.row.status}).`);
    if (date && (date > l.ctx.today || !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw blocked("Enter a show-cause date that is not in the future.");
    await tx.update(submissions).set({ showCauseDate: date, updatedAt: new Date() }).where(eq(submissions.id, id));
    await audit(tx, actor, l, "Show-cause date", `${l.row.showCauseDate ?? "(blank)"} → ${date ?? "(blank)"}`);
  });
}

/** Refuse after the show-cause period (SPEC §13.3; paras 13(3), 20). */
export async function refuse(db: Db, actor: Actor | null, id: string, ground: string, details: string | null): Promise<string> {
  authorize(actor, "evaluation:decide");
  return db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    const grounds = await listValues(tx, "refusal_ground");
    const p = new Problems();
    if (l.a.closed) p.reason(`Submission is closed (${l.row.status})`);
    if (!l.row.showCauseDate) p.reason("No show-cause notice date recorded");
    else if (diffDays(l.row.showCauseDate, l.ctx.today) < l.settings.showCauseDays) p.reason(`The ${l.settings.showCauseDays}-day show-cause period has not ended`);
    const ev = l.evaluation;
    if (!ev?.approvingOfficerId) p.reason("No approving officer assigned");
    else if (ev.approvingOfficerId !== actor.id) p.reason("Only the assigned approving officer can decide");
    for (const m of separationOfDuties(ev, l.row.createdBy)) p.reason(m);
    if (!grounds.includes(ground)) p.reason("Grounds must be one allowed by the Order");
    p.throwIfAny("blocked");
    const reasons = ground + (details?.trim() ? `: ${details.trim()}` : "");
    await tx.update(submissions).set({ status: ST.REFUSED, updatedAt: new Date() }).where(eq(submissions.id, id));
    await tx
      .update(evaluations)
      .set({ finalDecision: OUTCOMES.REFUSE, reasons, approvalDate: l.ctx.today, updatedAt: new Date() })
      .where(eq(evaluations.submissionId, id));
    await audit(tx, actor, l, "Refused", reasons);
    await notifyDecision(tx, actor, id, l.row.ackNo, `Refused: ${l.row.ackNo}`, l.row.registeredName ? `${l.row.registeredName}: ${reasons}` : reasons);
    return `${l.row.ackNo} refused: ${reasons}`;
  });
}

/** Cancel (Admin; para 14). */
export async function cancel(db: Db, actor: Actor | null, id: string, reason: string): Promise<string> {
  authorize(actor, "submission:cancel");
  return db.transaction(async (tx) => {
    const l = await lockAndLoad(tx, id);
    const st = l.row.status;
    if (!st) throw blocked("Save the Register entry first.");
    if ([ST.CANCELLED, ST.REFUSED, ST.LAPSED, ST.APPLIED].includes(st as never)) throw blocked(`Submission is already closed (${st}).`);
    if (!reason.trim()) new Problems().field("reason", "A reason is required.").throwIfAny();
    await tx.update(submissions).set({ status: ST.CANCELLED, updatedAt: new Date() }).where(eq(submissions.id, id));
    await audit(tx, actor, l, "Cancelled", `${reason.trim()} (was ${st})`);
    return `${l.row.ackNo} cancelled.`;
  });
}

/** New registrations past determination (the daily review applies the same rule). */
export async function overdueForProvisional(db: Db, today = lagosToday()) {
  const settings = await getSettings(db);
  const rows = await db
    .select({ id: submissions.id, complete: submissions.dateSubmissionComplete })
    .from(submissions)
    .where(and(eq(submissions.status, ST.RECEIVED), eq(submissions.filingType, "NEW"), isNotNull(submissions.dateSubmissionComplete), isNull(submissions.registrationNo)));
  return rows.filter((r) => addDays(r.complete!, settings.determinationDays) < today).map((r) => r.id);
}
