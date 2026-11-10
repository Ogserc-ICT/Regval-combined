"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { confirmPayment, recordPayment, rejectPayment, reversePayment } from "@/server/services/payments";
import { createSubmission, saveDraftSubmission, updateSubmission } from "@/server/services/submissions/save";
import { parseSubmission } from "./parse";
import { parseNairaToKobo } from "@/lib/format";
import {
  answerChecks,
  approve,
  assignOfficers,
  cancel,
  confirmCategory,
  issueDeficiency,
  lapse,
  markComplete,
  recalculateAllOpen,
  recordCertificateSent,
  recordDeficiencySent,
  recalculatePricing,
  refuse,
  setDocument,
  setFlagOverrideReason,
  setShowCauseDate,
} from "@/server/services/submissions/workflow";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const confirmed = (f: FormData) => f.get("confirmWarnings") === "yes";

const refresh = (id?: string) => {
  revalidatePath("/register");
  if (id) revalidatePath(`/register/${id}`);
  revalidatePath("/payments");
  revalidatePath("/evaluation");
  revalidatePath("/dashboard");
  revalidatePath("/own-use", "layout");
};

export async function createSubmissionAction(_p: ActionResult<{ id: string; ackNo: string }> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => createSubmission(db, actor, parseSubmission(f), { confirmWarnings: confirmed(f) }));
  if (res.ok) {
    refresh(res.data.id);
    redirect(`/register/${res.data.id}?saved=1`);
  }
  return res;
}

/** Saves a Register row started before Phase 9 by the old Registry intake (it keeps its ACK and receipt). */
export async function saveDraftSubmissionAction(_p: ActionResult<{ id: string; ackNo: string }> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => saveDraftSubmission(db, actor, id, parseSubmission(f), { confirmWarnings: confirmed(f) }));
  if (res.ok) {
    refresh(id);
    redirect(`/register/${id}?saved=1`);
  }
  return res;
}

export async function updateSubmissionAction(_p: ActionResult<string[]> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => updateSubmission(db, actor, id, parseSubmission(f), { confirmWarnings: confirmed(f) }));
  if (res.ok) {
    res.message = res.data.length ? `Saved ${res.data.length} change(s).` : "Nothing changed.";
    refresh(id);
  }
  return res;
}

type R = ActionResult<string | void | number>;
async function run(id: string, fn: () => Promise<string | void | number>, message?: string): Promise<R> {
  const res = await toResult(fn, message);
  if (res.ok) {
    if (typeof res.data === "string") res.message = res.data;
    refresh(id);
  }
  return res;
}

export async function setDocumentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => setDocument(db, actor, s(f, "id"), s(f, "key"), s(f, "value")), "Saved.");
}

export async function assignOfficersAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(
    s(f, "id"),
    () => assignOfficers(db, actor, s(f, "id"), { evaluatingOfficerId: s(f, "evaluatingOfficerId"), reviewingSupervisorId: s(f, "reviewingSupervisorId"), approvingOfficerId: s(f, "approvingOfficerId") }),
    "Officers saved.",
  );
}

export async function answerChecksAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const answers: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("check_")) answers[k.slice(6)] = String(v);
  return run(s(f, "id"), async () => {
    const n = await answerChecks(db, actor, s(f, "id"), answers, f.has("remarks") ? s(f, "remarks") : undefined);
    return n ? `Saved ${n} answer(s).` : "Nothing changed.";
  });
}

export async function flagReasonAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => setFlagOverrideReason(db, actor, s(f, "id"), s(f, "reason")), "Saved.");
}

export async function confirmCategoryAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => confirmCategory(db, actor, s(f, "id"), s(f, "category"), s(f, "reason")));
}

export async function markCompleteAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => markComplete(db, actor, s(f, "id"), { responseReceivedOn: s(f, "responseReceivedOn") || null }));
}

export async function deficiencySentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => recordDeficiencySent(db, actor, s(f, "id"), s(f, "sentOn")));
}

export async function certificateSentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => recordCertificateSent(db, actor, s(f, "id"), s(f, "sentOn")));
}

export async function deficiencyAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => issueDeficiency(db, actor, s(f, "id"), { confirm: confirmed(f) }));
}

export async function approveAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => approve(db, actor, s(f, "id")));
}

export async function lapseAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => lapse(db, actor, s(f, "id")));
}

export async function showCauseAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => setShowCauseDate(db, actor, s(f, "id"), s(f, "date") || null), "Saved.");
}

export async function refuseAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => refuse(db, actor, s(f, "id"), s(f, "ground"), s(f, "details")));
}

export async function cancelAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => cancel(db, actor, s(f, "id"), s(f, "reason")));
}

export async function recalculateAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), async () => `Pricing recalculated: ${await recalculatePricing(db, actor, s(f, "id"), s(f, "reason"))}`);
}

export async function recalculateAllAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run("", async () => {
    const r = await recalculateAllOpen(db, actor, s(f, "reason"));
    return `Recalculated ${r.recalculated} open submission(s).${r.skipped.length ? ` Skipped (registration number locked): ${r.skipped.join(", ")}.` : ""}`;
  });
}

// ---------------------------------------------------------------- payments

export async function recordPaymentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), async () => {
    const no = await recordPayment(
      db,
      actor,
      { dateReceived: s(f, "dateReceived"), reference: s(f, "reference"), purpose: s(f, "purpose"), channel: s(f, "channel"), amount: parseNairaToKobo(f.get("amount")), rrr: s(f, "rrr") },
      { confirmWarnings: confirmed(f) },
    );
    return `Recorded as ${no}. It counts once Finance confirms it.`;
  });
}

export async function confirmPaymentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => confirmPayment(db, actor, s(f, "paymentId"), { verifiedWithBank: f.get("verified") === "on", remarks: s(f, "remarks") }));
}

export async function rejectPaymentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => rejectPayment(db, actor, s(f, "paymentId"), s(f, "reason")), "Payment rejected.");
}

export async function reversePaymentAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  return run(s(f, "id"), () => reversePayment(db, actor, s(f, "paymentId"), s(f, "reason")), "Payment reversed. A released submission stays released, but its gate is closed again until payments are confirmed.");
}
