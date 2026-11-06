/**
 * The combined dashboard (SPEC §24.3): Registry counters beside Registration
 * figures, plus work queues for the signed-in user. Every figure comes from
 * the same domain functions as the registers.
 */
import { asc, eq, isNotNull } from "drizzle-orm";
import { addDays, compareDates, diffDays, lagosDate, type LocalDate } from "@/domain/dates";
import { ST } from "@/domain/registration/types";
import { registrationDeadline } from "@/domain/settings";
import type { Actor } from "../auth/actor";
import { all, type DbOrTx } from "../db/connect";
import { ownUseNotifications, payments, submissions } from "../db/schema";
import { loadRef } from "./reference";
import { listFiles, listFrontDesk, listInward, listOutward, registryCtx } from "./registry/load";
import { assessMany } from "./submissions/load";

export type Bar = { label: string; value: number; hint?: string };

const countBy = <T>(items: T[], key: (x: T) => string | null | undefined): Bar[] => {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = key(x) || "Not set";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
};

/** "YYYY-MM" of a date. */
const month = (d: LocalDate) => d.slice(0, 7);
function monthsFrom(start: LocalDate, n: number): string[] {
  const out: string[] = [];
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

export async function dashboardData(db: DbOrTx, actor: Actor) {
  const ctx = await registryCtx(db);
  const { today, settings } = ctx;
  const weekAgo = addDays(today, -6);
  const [inward, outward, fdAwaiting, files, subRows, pendingPays, ouRows, ref] = await all(db, [
    () => listInward(db, ctx),
    () => listOutward(db, ctx),
    () => listFrontDesk(db, { awaitingOnly: true }, ctx),
    () => listFiles(db, ctx),
    () => db.select().from(submissions).where(isNotNull(submissions.status)),
    () => db.select().from(payments).where(eq(payments.financeStatus, "Pending")).orderBy(asc(payments.recordedAt)),
    () => db.select({ id: ownUseNotifications.id, lga: ownUseNotifications.lga }).from(ownUseNotifications).where(isNotNull(ownUseNotifications.ounNo)),
    () => loadRef(db),
  ]);
  const subs = await assessMany(db, subRows, today);

  // ---------------------------------------------------------------- Registry
  const received = (d: LocalDate) => inward.filter((x) => lagosDate(x.row.receivedAt) === d);
  const closed = inward.filter((x) => x.a.closedOn);
  const closedWithDue = closed.filter((x) => x.a.responseDue);
  const onTime = closedWithDue.filter((x) => compareDates(x.a.closedOn!, x.a.responseDue!) <= 0).length;
  const registry = {
    receivedToday: received(today).length,
    dispatchedToday: outward.filter((x) => x.row.dispatchedOn === today).length,
    awaitingRouting: inward.filter((x) => x.a.status === "Awaiting routing").length,
    awaitingForwarding: inward.filter((x) => x.a.status === "Awaiting forwarding").length,
    incomingOverdue: inward.filter((x) => x.a.status === "Overdue").length,
    notYetDispatched: outward.filter((x) => x.a.status === "Not yet dispatched").length,
    repliesOverdueToUs: outward.filter((x) => x.a.status === "Response overdue").length,
    filesOut: files.filter((f) => f.a.isOut).length,
    filesOverdue: files.filter((f) => f.a.overdue).length,
    itemsLogged: inward.length,
    receivedLast7: inward.filter((x) => lagosDate(x.row.receivedAt) >= weekAgo).length,
    open: inward.filter((x) => !x.a.closedOn).length,
    closed: closed.length,
    noted: inward.filter((x) => x.a.status === "Noted / filed").length,
    closedOnTimePct: closedWithDue.length ? Math.round((onTime / closedWithDue.length) * 100) : null,
    ackNotIssued: inward.filter((x) => !x.row.ackIssuedVia || x.row.ackIssuedVia === "Not yet issued").length,
    afterHours: inward.filter((x) => x.row.deemedReceiptDate !== lagosDate(x.row.receivedAt)).length,
    reg01AfterDeadline: inward.filter((x) => x.a.filedAfterDeadline).length,
    withFlags: inward.filter((x) => x.a.flags.length).length,
    atFrontDesk: fdAwaiting.length,
    awaitingRegisterEntry: inward.filter((x) => x.entry === "Awaiting Register entry" || x.entry.startsWith("Register row started")).length,
    outLogged: outward.length,
    dispatchedLast7: outward.filter((x) => x.row.dispatchedOn && x.row.dispatchedOn >= weekAgo).length,
    deliveryNotConfirmed: outward.filter((x) => x.a.flags.some((f) => f.startsWith("Delivery not confirmed"))).length,
    awaitingResponse: outward.filter((x) => x.a.status === "Awaiting response").length,
    responsesReceived: outward.filter((x) => x.a.status === "Response received").length,
    byUnit: countBy(
      inward.filter((x) => !x.a.closedOn),
      (x) => x.unit?.name,
    ).slice(0, 10),
    byType: countBy(inward, (x) => x.typeName).slice(0, 10),
  };

  // ---------------------------------------------------------------- Registration
  const open = subs.filter((x) => !x.a.closed);
  const sum = (xs: typeof subs, f: (x: (typeof subs)[number]) => number) => xs.reduce((n, x) => n + f(x), 0);
  const live = subs.filter((x) => x.row.status !== ST.CANCELLED && x.row.status !== ST.REFUSED && x.row.status !== ST.LAPSED);
  const totalDue = sum(live, (x) => x.a.totalDue);
  const collected = sum(subs, (x) => x.a.payments.amountPaid);
  const withFinance = sum(subs, (x) => x.a.payments.withFinance);
  const outstanding = sum(live, (x) => Math.max(0, x.a.balance));
  const categories = ref.fees.map((f) => f.category).filter((c) => c !== "I");
  const byCategory = categories.map((c) => {
    const xs = subs.filter((x) => x.a.categoryApplied === c);
    return {
      category: c,
      submissions: xs.length,
      registered: xs.filter((x) => x.row.status === ST.REGISTERED).length,
      fees: sum(xs, (x) => x.a.registrationFee),
      late: sum(xs, (x) => x.a.lateCharge),
      waivers: sum(xs, (x) => x.row.approvedWaiver),
      collected: sum(xs, (x) => x.a.payments.amountPaid),
      outstanding: sum(xs, (x) => (x.a.closed ? 0 : Math.max(0, x.a.balance))),
    };
  });
  const effMonth = settings.effectiveDate.slice(0, 7);
  const months = monthsFrom(`${effMonth}-01`, 12);
  const monthly = months.map((m) => ({ label: m, value: subs.filter((x) => month(x.row.dateSubmitted) === m).length }));
  const activityName = (code: string | null) => ref.activities.find((a) => a.code === code)?.name ?? code;
  const deadline = registrationDeadline(settings);

  const registration = {
    deadline,
    total: subs.length,
    awaitingPayment: subs.filter((x) => x.row.status === ST.AWAITING).length,
    inProgress: subs.filter((x) => x.row.status === ST.RECEIVED || x.row.status === ST.DEFICIENCY).length,
    provisional: subs.filter((x) => x.row.status === ST.PROVISIONAL).length,
    registered: subs.filter((x) => x.row.status === ST.REGISTERED).length,
    closed: subs.filter((x) => x.a.closed).length,
    late: subs.filter((x) => x.a.daysLate > 0).length,
    ownUse: ouRows.length,
    red: subs.filter((x) => x.a.sla === "Red").length,
    amber: subs.filter((x) => x.a.sla === "Amber").length,
    withFlags: open.filter((x) => x.a.flags.length).length,
    avgDaysInQueue: open.length ? Math.round(sum(open, (x) => x.a.daysInQueue ?? 0) / open.length) : null,
    money: { totalDue, collected, withFinance, outstanding, collectionRate: totalDue ? Math.round((collected / totalDue) * 100) : null },
    byStatus: countBy(subs, (x) => x.row.status),
    byEvaluation: countBy(open, (x) => x.a.evaluationStatus),
    byCategory,
    byActivity: countBy(subs, (x) => activityName(x.row.primaryActivity)).slice(0, 10),
    byLga: countBy([...subs.map((x) => x.row.principalLga), ...ouRows.map((o) => o.lga)], (l) => l).slice(0, 12),
    monthly,
  };

  // ---------------------------------------------------------------- Work queues
  const byAge = <T extends { row: { dateSubmitted: string } }>(a: T, b: T) => compareDates(a.row.dateSubmitted, b.row.dateSubmitted);
  const mine = subs.filter(
    (x) => !x.a.closed && x.evaluation && [x.evaluation.evaluatingOfficerId, x.evaluation.reviewingSupervisorId, x.evaluation.approvingOfficerId].includes(actor.id),
  );
  const queues = {
    awaitingPayment: subs
      .filter((x) => x.row.status === ST.AWAITING)
      .sort(byAge)
      .slice(0, 8)
      .map((x) => ({
        id: x.row.id,
        ack: x.row.ackNo,
        name: x.row.registeredName,
        days: Math.max(0, diffDays(x.row.dateSubmitted, today)),
        reminder: settings.unpaidReminderDays !== null && diffDays(x.row.dateSubmitted, today) >= settings.unpaidReminderDays,
      })),
    financeDesk: pendingPays.length,
    oldestPayment: pendingPays[0] ? { payNo: pendingPays[0].payNo, reference: pendingPays[0].reference } : null,
    overdueDeficiency: subs
      .filter((x) => x.row.status === ST.DEFICIENCY && x.a.deficiencyResponseDue && x.a.deficiencyResponseDue < today)
      .map((x) => ({ id: x.row.id, ack: x.row.ackNo, name: x.row.registeredName, due: x.a.deficiencyResponseDue! })),
    readyForDecision: subs.filter((x) => x.a.evaluationStatus === "Ready for decision").map((x) => ({ id: x.row.id, ack: x.row.ackNo, name: x.row.registeredName })),
    myEvaluations: mine.map((x) => ({ id: x.row.id, ack: x.row.ackNo, name: x.row.registeredName, next: x.a.nextAction })),
    awaitingRouting: inward
      .filter((x) => x.a.status === "Awaiting routing")
      .sort((a, b) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime())
      .slice(0, 8)
      .map((x) => ({ id: x.row.id, ack: x.row.ackNo, name: x.row.sender, days: x.a.workingDaysAtRegistry })),
    myUnit: actor.unitId
      ? inward
          .filter((x) => x.unit?.id === actor.unitId && !x.a.closedOn)
          .map((x) => ({ id: x.row.id, ack: x.row.ackNo, name: x.row.sender, status: x.a.status, due: x.a.responseDue }))
      : null,
  };

  return { today, settings, registry, registration, queues };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
