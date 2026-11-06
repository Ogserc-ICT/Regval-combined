/**
 * Registry Intake of registration filings (SPEC §18; modRegistry.RX_SaveIntakeCore,
 * RX_PullFrontDesk, RX_PullAck). In one transaction: the ACK (unless pulled
 * from an acknowledged inward item), the inward item, the front-desk link and
 * the Register or Own-Use entry under the same ACK. The entry is saved at once
 * when primary activity, licence status and operating Y/N are all given;
 * otherwise it waits as a started row for the officer to complete.
 */
import { eq } from "drizzle-orm";
import { lagosDate } from "@/domain/dates";
import { formatNaira } from "@/domain/money";
import { FILING_LABELS, type Filing } from "@/domain/registration/types";
import { validateCac } from "@/domain/validators";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import { inwardItems, ownUseNotifications, submissions } from "../../db/schema";
import { blocked, notFound, Problems, ServiceError } from "../../errors";
import { createInwardItem } from "../inward";
import { deliverQueued, queueItemEmail } from "../email";
import { listValues, loadRef } from "../reference";
import { saveDraftInTx, type SubmissionInput } from "../submissions/save";
import { inList, optionalDate, receivedInstant, t } from "./common";
import { markFrontDeskRegistered, takeFrontDeskItem } from "./frontdesk";
import { checkHandling } from "./inward";
import { loadRegistryRef } from "./ref";

export const INTAKE_FILINGS = ["NEW", "UPDATE", "ANNUAL", "OWNUSE"] as const;
export type IntakeFiling = (typeof INTAKE_FILINGS)[number];
export const INTAKE_LABELS: Record<IntakeFiling, string> = { ...FILING_LABELS, OWNUSE: "Own-use notification" } as Record<IntakeFiling, string>;

export type IntakeInput = {
  /** Pull from a front-desk item. */
  frontDeskItemId?: string | null;
  /** Pull an inward item already acknowledged on New Inward (keeps its ACK). */
  inwardItemId?: string | null;
  receivedDate: string;
  receivedTime: string;
  mode: string;
  filingType: string;
  formFiled?: string | null;
  registeredName: string;
  subject?: string | null;
  linkedRegistrationNo?: string | null;
  senderRef?: string | null;
  cacNo?: string | null;
  principalLga: string;
  primaryActivity?: string | null;
  licenceStatus?: string | null;
  operatingOnEffectiveDate?: string | null;
  plannedStartDate?: string | null;
  registeredAddress?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveredBy?: string | null;
  volumes?: number | null;
  schedule2Count?: number | null;
  feeEvidence?: boolean | null;
  paymentReference?: string | null;
  amountShown?: number | null;
  ackIssuedVia: string;
  remarks?: string | null;
};

export type IntakeResult = {
  inwardId: string;
  ackNo: string;
  entry: { kind: "submission" | "own_use"; id: string; saved: boolean };
  warnings: string[];
};

export async function registryIntake(db: Db, actor: Actor | null, input: IntakeInput, opts: { confirmWarnings?: boolean } = {}): Promise<IntakeResult> {
  authorize(actor, "inward:write");
  authorize(actor, "submission:save");
  const r = await db.transaction(async (tx) => {
    const [ref, regRef, lgas, licenceStatuses] = [await loadRegistryRef(tx), await loadRef(tx), await listValues(tx, "lga"), await listValues(tx, "licence_status")];
    const p = new Problems();
    if (input.frontDeskItemId && input.inwardItemId) throw blocked("Pull from the front desk or from an acknowledged item, not both.");
    const fd = input.frontDeskItemId ? await takeFrontDeskItem(tx, input.frontDeskItemId) : null;
    const pulled = input.inwardItemId ? await takePulledInward(tx, input.inwardItemId) : null;

    const filing = INTAKE_FILINGS.includes(input.filingType as IntakeFiling) ? (input.filingType as IntakeFiling) : null;
    if (!filing) p.field("filingType", "Filing type is required (from the list).");
    const isOwnUse = filing === "OWNUSE";
    const form = t(input.formFiled);
    if (!isOwnUse) {
      if (!form) p.field("formFiled", "Form filed is required (REG-01A to REG-01K).");
      else if (form === "REG-01I") p.field("formFiled", "REG-01I is the own-use notification: choose Own-use notification as the filing type.");
      else if (!regRef.forms.some((f) => f.form === form)) p.field("formFiled", "Form filed must be REG-01A to REG-01K.");
    }
    const name = t(input.registeredName);
    if (!name) p.field("registeredName", "Registered name is required.");
    const linked = t(input.linkedRegistrationNo);
    if ((filing === "UPDATE" || filing === "ANNUAL") && !linked) p.field("linkedRegistrationNo", "Quote the registration number this filing is for.");
    const lga = inList(p, "principalLga", input.principalLga, lgas, "Principal LGA");
    const primary = t(input.primaryActivity);
    if (primary && !regRef.activities.some((a) => a.code === primary)) p.field("primaryActivity", "Choose the activity from the list.");
    const licence = inList(p, "licenceStatus", input.licenceStatus, licenceStatuses, "Licence status", false);
    const operating = t(input.operatingOnEffectiveDate);
    if (operating && operating !== "Y" && operating !== "N") p.field("operatingOnEffectiveDate", "Operating on the Effective Date must be Y or N.");
    const start = optionalDate(p, "plannedStartDate", input.plannedStartDate, "Planned start date");
    let cac = t(input.cacNo);
    if (cac) {
      const v = validateCac(cac);
      if (!v.ok) p.field("cacNo", v.message);
      else cac = v.value;
    }
    const h = checkHandling(p, ref, { ...input, lga: null });
    const receivedAt = pulled ? pulled.receivedAt : fd ? fd.receivedAt : receivedInstant(p, input.receivedDate, input.receivedTime);
    p.throwIfAny();

    const label = INTAKE_LABELS[filing!];
    const type = ref.types.find((x) => x.filingType === filing) ?? null;
    const subject = t(input.subject) ?? `${label}${form ? ` - ${form}` : ""}`;
    let inward: { id: string; ackNo: string };
    if (pulled) {
      if (ref.type(pulled.correspondenceTypeId)?.filingType !== filing) {
        throw blocked(`${pulled.ackNo} was logged as ${ref.type(pulled.correspondenceTypeId)?.name ?? "another type"}; choose that filing type or log a new item.`);
      }
      inward = pulled;
    } else {
      inward = await createInwardItem(tx, {
        receivedAt: receivedAt!,
        mode: h.mode!,
        correspondenceTypeId: type?.id ?? null,
        sender: name!,
        senderCategory: "Registrant / licensee",
        subject,
        senderRef: t(input.senderRef),
        relatedOgsercNo: linked,
        cacNo: cac,
        lga,
        contactPerson: t(input.contactPerson),
        phone: h.phone,
        email: h.email,
        deliveredBy: t(input.deliveredBy),
        volumes: h.volumes,
        schedule2Count: h.schedule2Count,
        feeEvidence: input.feeEvidence ?? null,
        paymentReference: t(input.paymentReference),
        amountShownKobo: h.amountShown,
        ackIssuedVia: h.ackIssuedVia,
        receivedByUserId: actor.id,
        source: "registry_intake",
        remarks: t(input.remarks),
        frontDeskItemId: fd?.id ?? null,
      });
      if (fd) await markFrontDeskRegistered(tx, actor, fd, inward);
    }

    const intakeRemarks = [
      `Registry Intake by ${actor.name}`,
      h.schedule2Count !== null ? `Schedule 2 documents: ${h.schedule2Count}` : null,
      input.feeEvidence === true ? "Fee evidence: Y" : input.feeEvidence === false ? "Fee evidence: N" : null,
      t(input.paymentReference) ? `Payment ref: ${t(input.paymentReference)}` : null,
      h.amountShown !== null ? `Amount shown: ${formatNaira(h.amountShown)}` : null,
      t(input.remarks),
    ]
      .filter(Boolean)
      .join("; ");
    const dateSubmitted = lagosDate(receivedAt!);
    const channel = ref.channelForMode(h.mode!);
    const warnings: string[] = [];
    let entry: IntakeResult["entry"];

    if (isOwnUse) {
      const [row] = await tx
        .insert(ownUseNotifications)
        .values({
          inwardItemId: inward.id,
          ackNo: inward.ackNo,
          name: name!,
          dateFiled: dateSubmitted,
          cacNo: cac,
          siteAddress: t(input.registeredAddress),
          lga,
          contactPerson: t(input.contactPerson),
          phone: h.phone,
          email: h.email,
          remarks: intakeRemarks,
          frontDeskItemId: fd?.id ?? null,
        })
        .returning({ id: ownUseNotifications.id });
      entry = { kind: "own_use", id: row.id, saved: false };
      warnings.push("Own-Use row started: add the generator units and save it on the Own-use page to issue the OUN number.");
    } else {
      const [row] = await tx
        .insert(submissions)
        .values({
          inwardItemId: inward.id,
          ackNo: inward.ackNo,
          filingType: filing as Filing,
          formFiled: form,
          linkedRegistrationNo: linked,
          registeredName: name!,
          dateSubmitted,
          submissionChannel: channel,
          cacNo: cac,
          registeredAddress: t(input.registeredAddress),
          principalLga: lga,
          primaryActivity: primary,
          licenceStatus: licence,
          complianceOfficer: t(input.contactPerson),
          phone: h.phone,
          email: h.email,
          operatingOnEffectiveDate: operating,
          plannedStartDate: start,
          remarks: intakeRemarks,
          frontDeskItemId: fd?.id ?? null,
        })
        .returning({ id: submissions.id });
      entry = { kind: "submission", id: row.id, saved: false };
      if (primary && licence && operating) {
        // Save the Register entry now, in a savepoint: if it cannot be saved yet,
        // the started row stays for the officer to complete (Registry Intake B34).
        const draft: SubmissionInput = {
          filingType: filing!,
          formFiled: form,
          linkedRegistrationNo: linked,
          registeredName: name!,
          dateSubmitted,
          submissionChannel: channel,
          cacNo: cac,
          registeredAddress: t(input.registeredAddress),
          principalLga: lga,
          primaryActivity: primary,
          licenceStatus: licence,
          complianceOfficer: t(input.contactPerson),
          phone: h.phone,
          email: h.email,
          operatingOnEffectiveDate: operating,
          plannedStartDate: start,
          remarks: intakeRemarks,
        };
        try {
          await tx.transaction((sp) => saveDraftInTx(sp, actor, row.id, draft, { confirmWarnings: opts.confirmWarnings }));
          entry.saved = true;
        } catch (e) {
          if (!(e instanceof ServiceError)) throw e;
          const why = [...e.reasons.filter((r) => r !== "Please correct the highlighted fields."), ...Object.values(e.fieldErrors).flat()];
          warnings.push(`Register row started but not saved yet: ${why.join(" ")} Complete it on the Register.`);
        }
      } else {
        warnings.push("Register row started: complete it (primary activity, licence status, operating Y/N) and save it on the Register.");
      }
    }

    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Registry acknowledgement",
      module: "registry",
      entityType: "inward_item",
      entityId: inward.id,
      reference: inward.ackNo,
      detail: `${label} from ${name}${form ? ` (${form})` : ""}${pulled ? "; pulled from New Inward" : fd ? `; from ${fd.fdNo}` : ""}; ${entry.saved ? "saved on the Register" : isOwnUse ? "Own-Use row started" : "Register row started"}`,
    });
    const q = pulled ? { warnings: [], emailIds: [] } : await queueItemEmail(tx, actor, inward.id, "acknowledgement");
    warnings.unshift(...q.warnings);
    return { inwardId: inward.id, ackNo: inward.ackNo, entry, warnings, emailIds: q.emailIds };
  });
  const problems = await deliverQueued(db, r.emailIds, auditActor(actor));
  return { inwardId: r.inwardId, ackNo: r.ackNo, entry: r.entry, warnings: [...problems, ...r.warnings] };
}

/** An inward item acknowledged on New Inward, waiting for its Register / Own-Use entry (SPEC §18.2). */
async function takePulledInward(tx: Tx, id: string) {
  const [row] = await tx.select().from(inwardItems).where(eq(inwardItems.id, id)).for("update");
  if (!row) throw notFound("Inward item");
  const [sub] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.inwardItemId, id));
  const [ou] = await tx.select({ id: ownUseNotifications.id }).from(ownUseNotifications).where(eq(ownUseNotifications.inwardItemId, id));
  if (sub || ou) throw blocked(`${row.ackNo} already has its ${sub ? "Register" : "Own-Use"} entry.`);
  return row;
}
