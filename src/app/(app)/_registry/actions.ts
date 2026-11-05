"use server";

/**
 * Server actions for the Registry screens. Every action re-reads the signed-in
 * user and calls a service, which checks the role on the server ([G6]–[G8]).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseNairaToKobo } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { saveDraftOwnUse } from "@/server/services/ownuse";
import { issueFile, openFile, returnFile, updateFile } from "@/server/services/registry/files";
import { logFrontDesk } from "@/server/services/registry/frontdesk";
import { registryIntake } from "@/server/services/registry/intake";
import { closeInward, confirmReceipt, forwardInward, routeInward, saveInward, updateInward } from "@/server/services/registry/inward";
import { deliverOutward, dispatchOutward, saveOutward, updateOutward } from "@/server/services/registry/outward";
import { parseOwnUseUnits } from "../own-use/parse";

type R = ActionResult<unknown>;

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const n = (f: FormData, k: string): number | null => {
  const v = s(f, k).trim().replace(/,/g, "");
  if (v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
};
const yn = (f: FormData, k: string): boolean | null => (s(f, k) === "Y" ? true : s(f, k) === "N" ? false : null);
const confirmed = (f: FormData) => f.get("confirmWarnings") === "yes";
const kobo = (f: FormData, k: string) => (s(f, k).trim() ? parseNairaToKobo(f.get(k)) : null);
const warnQs = (w: string[]) => (w.length ? `&warn=${encodeURIComponent(w.join("\n"))}` : "");

function refresh(...paths: string[]) {
  for (const p of ["/front-desk", "/registry-intake", "/inward", "/routing", "/outward", "/files", "/pending", "/dashboard", "/register", "/own-use", ...paths]) {
    revalidatePath(p);
  }
}

// ---------------------------------------------------------------- front desk

export async function logFrontDeskAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    logFrontDesk(db, actor, {
      receivedDate: s(f, "receivedDate"),
      receivedTime: s(f, "receivedTime"),
      sender: s(f, "sender"),
      subject: s(f, "subject"),
      correspondenceTypeId: s(f, "correspondenceTypeId"),
      mode: s(f, "mode"),
      deliveredBy: s(f, "deliveredBy"),
      phone: s(f, "phone"),
      volumes: n(f, "volumes"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    res.message = `Logged as ${res.data.fdNo}. It now waits for the Registry to register it.`;
    refresh();
  }
  return res;
}

// ---------------------------------------------------------------- inward

export async function saveInwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    saveInward(db, actor, {
      frontDeskItemId: s(f, "frontDeskItemId") || null,
      receivedDate: s(f, "receivedDate"),
      receivedTime: s(f, "receivedTime"),
      mode: s(f, "mode"),
      correspondenceTypeId: s(f, "correspondenceTypeId"),
      sender: s(f, "sender"),
      senderCategory: s(f, "senderCategory"),
      subject: s(f, "subject"),
      senderRef: s(f, "senderRef"),
      documentDate: s(f, "documentDate"),
      relatedOgsercNo: s(f, "relatedOgsercNo"),
      inResponseToOutNo: s(f, "inResponseToOutNo"),
      cacNo: s(f, "cacNo"),
      lga: s(f, "lga"),
      contactPerson: s(f, "contactPerson"),
      phone: s(f, "phone"),
      email: s(f, "email"),
      deliveredBy: s(f, "deliveredBy"),
      volumes: n(f, "volumes"),
      schedule2Count: n(f, "schedule2Count"),
      feeEvidence: yn(f, "feeEvidence"),
      paymentReference: s(f, "paymentReference"),
      amountShown: kobo(f, "amountShown"),
      ackIssuedVia: s(f, "ackIssuedVia"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    refresh();
    redirect(`/inward/${res.data.id}?saved=1${warnQs(res.data.warnings)}`);
  }
  return res;
}

export async function updateInwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() =>
    updateInward(db, actor, id, {
      sender: s(f, "sender"),
      senderCategory: s(f, "senderCategory"),
      senderRef: s(f, "senderRef"),
      documentDate: s(f, "documentDate"),
      subject: s(f, "subject"),
      relatedOgsercNo: s(f, "relatedOgsercNo"),
      cacNo: s(f, "cacNo"),
      lga: s(f, "lga"),
      contactPerson: s(f, "contactPerson"),
      phone: s(f, "phone"),
      email: s(f, "email"),
      deliveredBy: s(f, "deliveredBy"),
      volumes: n(f, "volumes"),
      ackIssuedVia: s(f, "ackIssuedVia"),
      forwardedOn: s(f, "forwardedOn"),
      unitOfficerReceivedBy: s(f, "unitOfficerReceivedBy"),
      closedManualOn: s(f, "closedManualOn"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    const changed = res.data as string[];
    res.message = changed.length ? `Saved: ${changed.join(", ")}.` : "Nothing changed.";
    refresh(`/inward/${id}`);
  }
  return res;
}

export async function routeInwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() =>
    routeInward(db, actor, id, {
      unitId: s(f, "unitId"),
      fileRef: s(f, "fileRef"),
      actionRequired: s(f, "actionRequired"),
      priority: s(f, "priority"),
      actionOfficer: s(f, "actionOfficer"),
      responseDueOverride: s(f, "responseDueOverride"),
    }),
  );
  if (res.ok) {
    res.message = "Routed.";
    res.warnings = res.data.warnings;
    refresh(`/inward/${id}`);
  }
  return res;
}

export async function forwardInwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => forwardInward(db, actor, id, { date: s(f, "date"), unitOfficer: s(f, "unitOfficer") }, { confirm: confirmed(f) }), "Forwarded.");
  if (res.ok) refresh(`/inward/${id}`);
  return res;
}

export async function confirmReceiptAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => confirmReceipt(db, actor, id), "Receipt confirmed.");
  if (res.ok) refresh(`/inward/${id}`);
  return res;
}

export async function closeInwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => closeInward(db, actor, id, { confirm: confirmed(f) }));
  if (res.ok) {
    res.message = `Closed on ${res.data}.`;
    refresh(`/inward/${id}`);
  }
  return res;
}

// ---------------------------------------------------------------- registry intake

export async function intakeAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    registryIntake(
      db,
      actor,
      {
        frontDeskItemId: s(f, "frontDeskItemId") || null,
        inwardItemId: s(f, "inwardItemId") || null,
        receivedDate: s(f, "receivedDate"),
        receivedTime: s(f, "receivedTime"),
        mode: s(f, "mode"),
        filingType: s(f, "filingType"),
        formFiled: s(f, "formFiled"),
        registeredName: s(f, "registeredName"),
        subject: s(f, "subject"),
        linkedRegistrationNo: s(f, "linkedRegistrationNo"),
        senderRef: s(f, "senderRef"),
        cacNo: s(f, "cacNo"),
        principalLga: s(f, "principalLga"),
        primaryActivity: s(f, "primaryActivity"),
        licenceStatus: s(f, "licenceStatus"),
        operatingOnEffectiveDate: s(f, "operatingOnEffectiveDate"),
        plannedStartDate: s(f, "plannedStartDate"),
        registeredAddress: s(f, "registeredAddress"),
        contactPerson: s(f, "contactPerson"),
        phone: s(f, "phone"),
        email: s(f, "email"),
        deliveredBy: s(f, "deliveredBy"),
        volumes: n(f, "volumes"),
        schedule2Count: n(f, "schedule2Count"),
        feeEvidence: yn(f, "feeEvidence"),
        paymentReference: s(f, "paymentReference"),
        amountShown: kobo(f, "amountShown"),
        ackIssuedVia: s(f, "ackIssuedVia"),
        remarks: s(f, "remarks"),
      },
      { confirmWarnings: confirmed(f) },
    ),
  );
  if (res.ok) {
    refresh();
    redirect(`/inward/${res.data.inwardId}?saved=1${warnQs(res.data.warnings)}`);
  }
  return res;
}

export async function saveDraftOwnUseAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() =>
    saveDraftOwnUse(
      db,
      actor,
      id,
      {
        name: s(f, "name"),
        dateFiled: s(f, "dateFiled"),
        cacNo: s(f, "cacNo"),
        siteAddress: s(f, "siteAddress"),
        lga: s(f, "lga"),
        natureOfBusiness: s(f, "natureOfBusiness"),
        gridConnected: s(f, "gridConnected"),
        distributionLicensee: s(f, "distributionLicensee"),
        contactPerson: s(f, "contactPerson"),
        phone: s(f, "phone"),
        email: s(f, "email"),
        remarks: s(f, "remarks"),
        units: parseOwnUseUnits(f),
      },
      { confirmWarnings: confirmed(f) },
    ),
  );
  if (res.ok) {
    refresh(`/own-use/${id}`);
    redirect(`/own-use/${id}?saved=1`);
  }
  return res;
}

// ---------------------------------------------------------------- outward

export async function saveOutwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    saveOutward(db, actor, {
      documentDate: s(f, "documentDate"),
      documentType: s(f, "documentType"),
      subject: s(f, "subject"),
      addressee: s(f, "addressee"),
      recipientCategory: s(f, "recipientCategory"),
      recipientContact: s(f, "recipientContact"),
      inReplyToAck: s(f, "inReplyToAck"),
      relatedOgsercNo: s(f, "relatedOgsercNo"),
      fileRef: s(f, "fileRef"),
      originatingUnitId: s(f, "originatingUnitId"),
      preparedBy: s(f, "preparedBy"),
      signatoryId: s(f, "signatoryId"),
      dispatchMode: s(f, "dispatchMode"),
      dispatchedOn: s(f, "dispatchedOn"),
      trackingRef: s(f, "trackingRef"),
      responseExpected: s(f, "responseExpected"),
      responseDueOverride: s(f, "responseDueOverride"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    refresh();
    redirect(`/outward/${res.data.id}?saved=1`);
  }
  return res;
}

export async function dispatchOutwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => dispatchOutward(db, actor, id, { date: s(f, "date"), trackingRef: s(f, "trackingRef") }), "Dispatch recorded.");
  if (res.ok) refresh(`/outward/${id}`);
  return res;
}

export async function deliverOutwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() => deliverOutward(db, actor, id, { date: s(f, "date"), receivedBy: s(f, "receivedBy") }), "Delivery confirmed.");
  if (res.ok) refresh(`/outward/${id}`);
  return res;
}

export async function updateOutwardAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() =>
    updateOutward(db, actor, id, {
      recipientContact: s(f, "recipientContact"),
      fileRef: s(f, "fileRef"),
      trackingRef: s(f, "trackingRef"),
      responseExpected: s(f, "responseExpected"),
      responseDueOverride: s(f, "responseDueOverride"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    const changed = res.data as string[];
    res.message = changed.length ? "Saved." : "Nothing changed.";
    refresh(`/outward/${id}`);
  }
  return res;
}

// ---------------------------------------------------------------- files

export async function openFileAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    openFile(db, actor, {
      fileClass: s(f, "fileClass"),
      fileRef: s(f, "fileRef"),
      title: s(f, "title"),
      owningUnitId: s(f, "owningUnitId"),
      openedOn: s(f, "openedOn"),
      currentVolume: n(f, "currentVolume"),
      security: s(f, "security"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    refresh();
    redirect(`/files/${res.data.id}?saved=1`);
  }
  return res;
}

export async function updateFileAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "id");
  const res = await toResult(() =>
    updateFile(db, actor, id, {
      title: s(f, "title"),
      owningUnitId: s(f, "owningUnitId"),
      currentVolume: n(f, "currentVolume"),
      security: s(f, "security"),
      status: s(f, "status"),
      remarks: s(f, "remarks"),
    }),
  );
  if (res.ok) {
    res.message = (res.data as string[]).length ? "Saved." : "Nothing changed.";
    refresh(`/files/${id}`);
  }
  return res;
}

export async function issueFileAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "fileId");
  const res = await toResult(() =>
    issueFile(
      db,
      actor,
      { fileId: id, volume: n(f, "volume"), issuedTo: s(f, "issuedTo"), unitId: s(f, "unitId"), purpose: s(f, "purpose"), returnByOverride: s(f, "returnByOverride"), remarks: s(f, "remarks") },
      { confirm: confirmed(f) },
    ),
  );
  if (res.ok) {
    res.message = `Issued. Return by ${res.data.returnDue}.`;
    refresh(`/files/${id}`);
  }
  return res;
}

export async function returnFileAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const id = s(f, "fileId");
  const res = await toResult(() => returnFile(db, actor, id));
  if (res.ok) {
    res.message = `Returned by ${res.data.from}.`;
    refresh(`/files/${id}`);
  }
  return res;
}
