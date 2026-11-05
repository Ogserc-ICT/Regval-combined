/**
 * Everything the Register calculates for one submission (the green columns of
 * tblRegister and tblEvaluation), in one pure function. Used by screens,
 * services, the daily review and exports so each rule exists once.
 */
import { addDays, diffDays, longDate, yearOf, type LocalDate } from "../dates";
import { formatNaira } from "../money";
import { validateCac } from "../validators";
import { evaluateChecks, recommendedOutcome, type CheckSummary } from "./checks";
import { conditionValue, checklistDocs, documentsForm, otherActivityForms, summariseDocs, type DocSummary } from "./documents";
import { categoryAuto, currentPricing, money, pricingDifferences, type Money } from "./pricing";
import {
  isClosed,
  LICENCE_PENDING,
  MULTI_STATE_LICENCE,
  ST,
  UNLICENSED,
  type AssessContext,
  type Status,
  type SubmissionFacts,
} from "./types";

export type Flag = { code: string; text: string };

export type PaymentTotals = { amountPaid: number; withFinance: number; paymentsWithFinance: number; lastPaymentDate: LocalDate | null };

export type Assessment = Money & {
  categoryAuto: string | null;
  currentCategory: string | null;
  primaryCode: string | null;
  formCategory: string | null;
  categoryDescription: string | null;
  closed: boolean;
  payments: PaymentTotals;
  balance: number;
  paymentStatus: "Nil" | "Paid" | "Part-paid" | "Unpaid";
  releaseRequires: number;
  gateCleared: boolean;
  gateReason: string;
  documents: DocSummary;
  submissionComplete: boolean;
  determinationDue: LocalDate | null;
  deficiencyResponseDue: LocalDate | null;
  licenceApplicationDue: LocalDate | null;
  nearestLicenceExpiry: LocalDate | null;
  daysInQueue: number | null;
  sla: "" | "Red" | "Amber" | "Green";
  stage: 1 | 2 | 3 | 4 | 5;
  processStage: string;
  registrationNoInUse: string | null;
  flags: Flag[];
  checks: CheckSummary;
  evaluationStatus: "Decided" | "Not assigned" | "In progress" | "Ready for decision";
  recommendedOutcome: string;
  approvalBlockers: string[];
  nextAction: string;
};

export function paymentTotals(list: AssessContext["payments"]): PaymentTotals {
  let amountPaid = 0;
  let withFinance = 0;
  let paymentsWithFinance = 0;
  let last: LocalDate | null = null;
  for (const p of list) {
    if (p.reversed) continue;
    if (p.financeStatus === "Confirmed") {
      amountPaid += p.amount;
      if (!last || p.dateReceived > last) last = p.dateReceived;
    } else if (p.financeStatus === "Pending") {
      withFinance += p.amount;
      paymentsWithFinance += 1;
    }
  }
  return { amountPaid, withFinance, paymentsWithFinance, lastPaymentDate: last };
}

function annualDue(year: number, s: AssessContext["settings"]): LocalDate {
  const mm = String(s.annualConfirmationDueMonth).padStart(2, "0");
  const dd = String(s.annualConfirmationDueDay).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function dueLabel(s: AssessContext["settings"]): string {
  return longDate(annualDue(2000, s)).replace(/ 2000$/, "");
}

export function assess(s: SubmissionFacts, ctx: AssessContext): Assessment {
  const { settings, ref, today } = ctx;
  const m = money(s, ref, settings);
  const auto = categoryAuto(s.primaryActivity, s.otherActivities, s.installedCapacityMw, ref, settings);
  const current = currentPricing(s, ref, settings)?.category ?? null;
  const primary = s.primaryActivity ? (ref.activities.find((a) => a.code === s.primaryActivity) ?? null) : null;
  const formCategory = s.formFiled ? (ref.forms.find((f) => f.form === s.formFiled)?.category ?? null) : null;
  const closed = isClosed(s.status);
  const cap = s.installedCapacityMw ?? 0;

  // Payments and the Finance gate (SPEC §11)
  const pay = paymentTotals(ctx.payments);
  const balance = Math.round(m.totalDue - pay.amountPaid);
  const paymentStatus = m.totalDue === 0 ? "Nil" : balance <= 0 ? "Paid" : pay.amountPaid > 0 ? "Part-paid" : "Unpaid";
  const releaseRequires = settings.lateRequiredForRelease === "Y" ? m.totalDue : m.netFee;
  const gateCleared = pay.amountPaid >= releaseRequires;
  const gateReason =
    `Payment not yet confirmed by Finance: ${formatNaira(pay.amountPaid)} of ${formatNaira(releaseRequires)} confirmed` +
    (pay.paymentsWithFinance > 0 ? `; ${formatNaira(pay.withFinance)} recorded and waiting for Finance` : "");

  // Documents (SPEC §10)
  const df = documentsForm(s, ref, settings);
  const docs = df ? checklistDocs(df, otherActivityForms(s, ref, settings), ref.formDocs) : [];
  const evidence = m.netFee === 0 ? "N/A" : pay.amountPaid >= m.netFee ? "Y" : "";
  const documents = summariseDocs(
    df,
    docs,
    ctx.checklist,
    (k) => conditionValue(s, k),
    evidence,
    (k) => ref.conditions.find((c) => c.key === k)?.question ?? k,
  );
  const submissionComplete =
    documents.complete && pay.amountPaid >= (settings.lateBlocksComplete === "Y" ? m.totalDue : m.netFee);

  // Clocks (SPEC §9)
  const determinationDue = s.dateSubmissionComplete ? addDays(s.dateSubmissionComplete, settings.determinationDays) : null;
  const deficiencyResponseDue = s.deficiencyNoticeDate ? addDays(s.deficiencyNoticeDate, settings.deficiencyResponseDays) : null;
  const licenceApplicationDue = s.licenceStatus === UNLICENSED ? addDays(m.effectiveDateUsed, settings.licenceApplicationDays) : null;
  const expiries = s.licences.map((l) => l.expiryDate).filter((d): d is string => !!d).sort();
  const nearestLicenceExpiry = expiries[0] ?? null;
  const daysInQueue = closed || !s.dateSubmitted ? null : Math.max(0, diffDays(s.dateSubmitted, today));
  let sla: Assessment["sla"] = "";
  if (daysInQueue !== null && s.status !== ST.PROVISIONAL && s.status !== ST.AWAITING && s.status) {
    const red =
      (determinationDue && today > determinationDue) ||
      (s.status === ST.DEFICIENCY && deficiencyResponseDue && today > deficiencyResponseDue);
    const amber = determinationDue
      ? diffDays(today, determinationDue) <= settings.amberWarningDays
      : daysInQueue > settings.determinationDays;
    sla = red ? "Red" : amber ? "Amber" : "Green";
  }

  const stage: Assessment["stage"] = closed
    ? 5
    : s.status === ST.AWAITING || !s.status
      ? gateCleared
        ? 3
        : pay.paymentsWithFinance > 0
          ? 2
          : 1
      : 4;
  const processStage = [
    "Acknowledged – awaiting payment",
    "Payment with Finance",
    "Payment confirmed",
    "Evaluation and determination",
    `Closed – ${s.status}`,
  ][stage - 1];
  const registrationNoInUse = s.registrationNo ?? (s.status === ST.PROVISIONAL ? s.ackNo : null);

  // Data flags (SPEC §14)
  const flags: Flag[] = [];
  const f = (code: string, cond: unknown, text: string) => {
    if (cond) flags.push({ code, text });
  };
  const licNos = s.licences.some((l) => l.licenceNo?.trim());
  const target = s.confirmedCategory || m.categoryApplied;
  f("DUPLICATE_CAC", ctx.duplicates.cac, "Duplicate CAC number on another submission (one registration per person, para 11(4))");
  f("DUPLICATE_NAME", ctx.duplicates.name, "Duplicate registered name");
  const missing = [
    !s.registeredName?.trim() && "registered name",
    !s.dateSubmitted && "date submitted",
    !s.formFiled?.trim() && "form filed",
    !s.principalLga?.trim() && "principal LGA",
    !s.primaryActivity && "primary activity",
    !s.licenceStatus && "licence status",
    !s.operatingOnEffectiveDate && "operating on Effective Date",
    !s.status && "status",
  ].filter(Boolean);
  f("MISSING_REQUIRED", missing.length, `Missing required field: ${missing.join(", ")}`);
  f("UNKNOWN_ACTIVITY", s.primaryActivity && !primary, "Primary activity not in the activities list");
  const unknownOthers = s.otherActivities.filter((o) => !ref.activities.some((a) => a.code === o));
  f("UNKNOWN_OTHER_ACTIVITY", unknownOthers.length, `Other activity not in the activities list: ${unknownOthers.join(", ")}`);
  f("NO_CAPACITY", primary?.capacityBased && s.installedCapacityMw === null, `Capacity-based activity (${primary?.code}) with no installed capacity`);
  f(
    "OVERRIDE_NO_REASON",
    s.categoryOverride && s.categoryOverride !== auto && !s.overrideReason?.trim(),
    "Category overridden with no reason",
  );
  f("CERT_NOT_COMPLETE", s.certificateIssueDate && !submissionComplete, "Certificate dated but submission not complete");
  f(
    "CERT_STATUS",
    s.certificateIssueDate && s.status !== ST.REGISTERED && s.status !== ST.CANCELLED,
    "Certificate dated but status not Registered/Cancelled",
  );
  f("REGISTERED_NO_CERT_DATE", s.status === ST.REGISTERED && !s.certificateIssueDate, "Registered without certificate date");
  f("DUPLICATE_REG_NO", registrationNoInUse && ctx.duplicates.registrationNo, "Duplicate registration number");
  f(
    "LICENCE_RENEWAL",
    nearestLicenceExpiry && diffDays(m.effectiveDateUsed, nearestLicenceExpiry) <= settings.licenceExpiryWindowDays,
    "Licence expires within 6 months of the Effective Date – renewal (para 8(5))",
  );
  f("CPT_BELOW_1MW", primary?.code === "CPT" && cap < 1, "Own-use below 1 MW is excluded – use Form REG-01I (own-use notification)");
  f("MSL_LICENCE", primary?.code === "MSL" && s.licenceStatus !== MULTI_STATE_LICENCE, "Check licence status for multi-State licensee");
  f("NO_START_DATE", s.operatingOnEffectiveDate === "N" && !s.plannedStartDate, "Not operating on Effective Date and no planned start date");
  f("FUTURE_SUBMISSION", s.dateSubmitted && s.dateSubmitted > today, "Date submitted is in the future");
  f(
    "LICENCE_APPLICATION_OVERDUE",
    licenceApplicationDue && today > licenceApplicationDue,
    "Unlicensed and licence application overdue (para 18(2))",
  );
  f(
    "LICENCE_NO_WITHOUT_LICENCE",
    (s.licenceStatus === UNLICENSED || s.licenceStatus === LICENCE_PENDING) && licNos,
    `Licence number entered but licence status is "${s.licenceStatus}"`,
  );
  f(
    "LICENCE_NO_MISSING",
    s.licenceStatus && s.licenceStatus !== UNLICENSED && s.licenceStatus !== LICENCE_PENDING && !licNos,
    "Licence held but no licence number entered",
  );
  f(
    "GENERATION_CATEGORY",
    (primary?.code === "GEN" || primary?.code === "CPT") && cap >= 10 && !["A", "B", "C"].includes(m.categoryApplied ?? ""),
    "Generation of 10 MW or more but the applied category is not C (or A/B)",
  );
  f("CAC_FORMAT", s.cacNo?.trim() && !validateCac(s.cacNo).ok, "CAC number format is invalid (expected RC, BN or IT followed by digits)");
  if (s.formFiled && formCategory && target && formCategory !== target) {
    if (!s.confirmedCategory) {
      f("FORM_CATEGORY_MISMATCH", true, `Form filed (${s.formFiled}) does not match the calculated category (${target}) – confirm the category`);
    } else if (settings.wrongFormHandling === "Require the correct form") {
      f("FORM_CATEGORY_MISMATCH", true, `Filed on ${s.formFiled} but the category is confirmed as ${target} – the applicant must file on REG-01${target}`);
    } else if (!s.categoryConfirmedReason?.trim()) {
      f("FORM_CATEGORY_MISMATCH", true, `Filed on ${s.formFiled} but confirmed as Category ${target} with no reason recorded`);
    }
  }
  f(
    "CONFIRMED_CATEGORY_NOT_CHARGED",
    s.confirmedCategory && m.categoryApplied && s.confirmedCategory !== m.categoryApplied,
    `Category confirmed as ${s.confirmedCategory} but Category ${m.categoryApplied} is charged – correct the activities or capacity, or override the category, then an admin recalculates`,
  );
  f("TECHNICAL_INCOMPLETE", s.formSectionsNotComplete?.trim() && df, `${df} sections not complete: ${s.formSectionsNotComplete?.trim()}`);
  if (s.installedCapacityMw !== null && s.capacityInSectionsMw !== null) {
    const a = s.capacityInSectionsMw;
    const b = s.installedCapacityMw;
    f(
      "TECHNICAL_CAPACITY_MISMATCH",
      Math.abs(a - b) > Math.max(0.001, 0.01 * Math.max(Math.abs(a), Math.abs(b))),
      `Installed capacity is ${b} MW, but ${df} sections give ${Math.round(a * 1000) / 1000} MW`,
    );
  }
  if (s.filingType !== "NEW") {
    if (!ctx.linked) f("LINKED_REGISTRATION", true, "Not linked to a registered submission (quote its registration number)");
    else if (ctx.linked.status !== ST.REGISTERED && !closed) {
      f("LINKED_REGISTRATION", true, `The linked registration ${s.linkedRegistrationNo || "(no number)"} is ${ctx.linked.status}, not Registered`);
    }
  }
  if (s.filingType === "ANNUAL" && s.dateSubmitted && ctx.linked?.certificateIssueDate) {
    const y = yearOf(s.dateSubmitted);
    f(
      "ANNUAL_LATE",
      yearOf(ctx.linked.certificateIssueDate) < y && s.dateSubmitted > annualDue(y, settings),
      `Annual confirmation filed after ${dueLabel(settings)} (para 16(2))`,
    );
  }
  if (s.filingType === "NEW" && s.status === ST.REGISTERED && s.certificateIssueDate) {
    const y = yearOf(today);
    f(
      "ANNUAL_CONFIRMATION_OVERDUE",
      yearOf(s.certificateIssueDate) < y && today > annualDue(y, settings) && !ctx.annualFiledThisYear,
      `Annual confirmation for ${y} not filed by ${dueLabel(settings)} (para 16(2))`,
    );
  }
  const started = ctx.evaluation?.startedOn ?? null;
  f(
    "EVALUATION_BEFORE_PAYMENT",
    started && (!s.releasedOn || started < s.releasedOn),
    "Evaluation started before Finance confirmed payment",
  );
  const pastAck: (Status | null)[] = [ST.RECEIVED, ST.DEFICIENCY, ST.PROVISIONAL, ST.REGISTERED, ST.LAPSED, ST.APPLIED];
  f("STATUS_WITHOUT_CONFIRMATION", pastAck.includes(s.status) && !s.releasedOn, "Status moved past acknowledgement without Finance confirmation");
  const diffs = pricingDifferences(s, ref, settings);
  f("PRICING_OUT_OF_DATE", diffs.length, `Saved pricing differs from current rules (${diffs.join("; ")}) – an admin may recalculate`);

  // EVAL-01 (SPEC §12)
  const ev = ctx.evaluation;
  const linked = s.filingType !== "NEW";
  const checks = evaluateChecks(
    {
      hasAck: !!s.ackNo,
      activityCode: primary?.code ?? null,
      capacityMw: cap,
      duplicateCac: ctx.duplicates.cac,
      daysLate: m.daysLate,
      lateCharge: m.lateCharge,
      formCategory,
      confirmedCategory: s.confirmedCategory,
      confirmedReason: s.categoryConfirmedReason,
      documentsComplete: documents.complete,
      nearestExpiry: nearestLicenceExpiry,
      effectiveDateUsed: m.effectiveDateUsed,
      balance,
      flagCount: flags.length,
      flagOverrideReason: ev?.flagOverrideReason ?? null,
      linked,
      status: s.status,
      certificateIssueDate: s.certificateIssueDate,
      registrationNo: s.registrationNo,
      licenceStatus: s.licenceStatus,
      registrantType: s.registrantType,
      waiver: s.approvedWaiver,
    },
    ev?.answers ?? {},
    settings,
  );
  const evaluationStatus: Assessment["evaluationStatus"] = ev?.finalDecision
    ? "Decided"
    : !ev?.evaluatingOfficerId
      ? "Not assigned"
      : checks.pending > 0
        ? "In progress"
        : "Ready for decision";
  const outcome = recommendedOutcome({
    checks,
    status: s.status,
    gateCleared,
    deficiencyDue: deficiencyResponseDue,
    determinationDue,
    finalDecision: ev?.finalDecision ?? null,
    linked,
    today,
  });

  // Approval blockers (SPEC §12.3), all at once
  const b: string[] = [];
  if (closed) b.push(`Submission is closed (${s.status})`);
  if (!s.status) b.push("The Register entry has not been saved");
  if (!gateCleared) b.push(gateReason);
  if (!ev?.evaluatingOfficerId) b.push("No evaluating officer assigned");
  if (!ev?.reviewingSupervisorId) b.push("No reviewing supervisor assigned");
  if (!ev?.approvingOfficerId) b.push("No approving officer assigned");
  if (!submissionComplete) b.push("Submission is not complete (documents or fees outstanding)");
  if (checks.failed > 0) b.push(`${checks.failed} evaluation check(s) failed`);
  if (checks.pending > 0) b.push(`${checks.pending} evaluation check(s) pending`);
  if (!m.categoryApplied || !primary) b.push("Category or activity code cannot be determined");
  if (flags.length) {
    const list = flags.map((x) => x.text).join("; ");
    if (settings.flagsBlockApproval === "Y") b.push(`${flags.length} unresolved data flag(s): ${list}`);
    else if (!ev?.flagOverrideReason?.trim()) b.push(`${flags.length} unresolved data flag(s) with no written override reason: ${list}`);
  }
  b.push(...separationOfDuties(ev, s.createdBy));
  if (linked) {
    if (!ctx.linked) b.push("Not linked to a registered submission");
    else if (ctx.linked.status !== ST.REGISTERED) {
      b.push(`The linked registration ${s.linkedRegistrationNo ?? ""} is ${ctx.linked.status}, not Registered`);
    }
  } else {
    const missingSig = [!ctx.signatories.chairman && "Chairman / CEO", !ctx.signatories.commissioner && "Commissioner"].filter(Boolean);
    if (missingSig.length) {
      b.push(`Certificate signatory not set: ${missingSig.join(" and ")}. An admin must add it under Admin › Signatories.`);
    }
  }

  return {
    ...m,
    categoryAuto: auto,
    currentCategory: current,
    primaryCode: primary?.code ?? null,
    formCategory,
    categoryDescription: m.categoryApplied ? (ref.fees.find((x) => x.category === m.categoryApplied)?.description ?? null) : null,
    closed,
    payments: pay,
    balance,
    paymentStatus,
    releaseRequires,
    gateCleared,
    gateReason,
    documents,
    submissionComplete,
    determinationDue,
    deficiencyResponseDue,
    licenceApplicationDue,
    nearestLicenceExpiry,
    daysInQueue,
    sla,
    stage,
    processStage,
    registrationNoInUse,
    flags,
    checks,
    evaluationStatus,
    recommendedOutcome: outcome,
    approvalBlockers: b,
    nextAction: nextAction(s, {
      determinationDue,
      deficiencyResponseDue,
      gateCleared,
      paymentsWithFinance: pay.paymentsWithFinance,
      releaseRequires,
      amountPaid: pay.amountPaid,
      submissionComplete,
      documents,
      balance,
      today,
    }),
  };
}

/**
 * [G8] The approving officer, evaluating officer, reviewing supervisor and the
 * user who saved the submission must be four different people.
 */
export function separationOfDuties(
  ev: Pick<NonNullable<AssessContext["evaluation"]>, "evaluatingOfficerId" | "reviewingSupervisorId" | "approvingOfficerId"> | null,
  createdBy: string | null,
): string[] {
  const out: string[] = [];
  const ao = ev?.approvingOfficerId;
  const eo = ev?.evaluatingOfficerId;
  const rs = ev?.reviewingSupervisorId;
  if (ao && ao === eo) out.push("The approving officer cannot be the evaluating officer");
  if (ao && ao === rs) out.push("The approving officer cannot be the reviewing supervisor");
  if (ao && ao === createdBy) out.push("The approving officer cannot be the user who created the submission");
  if (rs && rs === eo) out.push("The reviewing supervisor cannot be the evaluating officer");
  if (eo && eo === createdBy) out.push("The evaluating officer cannot be the user who created the submission");
  if (rs && rs === createdBy) out.push("The reviewing supervisor cannot be the user who created the submission");
  return out;
}

function nextAction(
  s: SubmissionFacts,
  x: {
    determinationDue: LocalDate | null;
    deficiencyResponseDue: LocalDate | null;
    gateCleared: boolean;
    paymentsWithFinance: number;
    releaseRequires: number;
    amountPaid: number;
    submissionComplete: boolean;
    documents: DocSummary;
    balance: number;
    today: LocalDate;
  },
): string {
  switch (s.status) {
    case null:
      return "Complete and save the Register entry";
    case ST.REGISTERED:
      return s.registrationNo ? "Complete" : "Lock the registration number";
    case ST.CANCELLED:
      return "Closed – Cancelled";
    case ST.REFUSED:
      return "Closed – Refused";
    case ST.APPLIED:
      return "Closed – Changes Applied";
    case ST.LAPSED:
      return "Closed – Lapsed; fresh application needed";
    case ST.DEFICIENCY:
      if (!x.deficiencyResponseDue) return "Await response";
      return x.today > x.deficiencyResponseDue
        ? "Response overdue – lapse the submission (para 13(2))"
        : `Await response by ${longDate(x.deficiencyResponseDue)}`;
    case ST.PROVISIONAL:
      return "Determine and issue the certificate";
    case ST.AWAITING:
      if (x.gateCleared) return "Payment confirmed – release for evaluation (runs automatically)";
      if (x.paymentsWithFinance > 0) return "Payment with Finance – awaiting confirmation";
      return `Await payment of ${formatNaira(Math.max(0, x.releaseRequires - x.amountPaid))}, then Finance confirmation`;
  }
  if (!x.submissionComplete) {
    const n = x.documents.outstanding + x.documents.pending;
    const parts = [n > 0 && `obtain ${n} outstanding document(s)`, x.balance > 0 && `collect ${formatNaira(x.balance)}`].filter(Boolean);
    const t = parts.join(" and ");
    return `${t.charAt(0).toUpperCase()}${t.slice(1)} – or issue a deficiency notice`;
  }
  if (!s.dateSubmissionComplete || !x.determinationDue) return "Mark the submission complete";
  if (x.today > x.determinationDue) {
    return s.filingType !== "NEW" ? "Overdue – determine and apply the changes" : "Overdue – provisional registration applies (para 13(4))";
  }
  return `Determine by ${longDate(x.determinationDue)}`;
}

