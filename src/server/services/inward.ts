/**
 * Creating inward items (SPEC §18.3, §19). Phase 2 uses the direct-entry
 * path: saving a submission or own-use notification without an ACK issues one
 * from the shared OGSERC/ACK series and logs it in the Inward Register.
 * New Inward and Registry Intake (services/registry) use the same function.
 */
import { deemedReceiptDate } from "@/domain/deemed";
import { yearOf, type LocalDate } from "@/domain/dates";
import { all, type Tx } from "../db/connect";
import { inwardItems, type InwardSource } from "../db/schema";
import { getHolidaySet } from "./holidays";
import { issueNumber } from "../numbering";
import { getSettings } from "./settings";

export type NewInward = {
  receivedAt: Date;
  mode: string;
  correspondenceTypeId: string | null;
  sender: string;
  senderCategory?: string | null;
  subject: string;
  cacNo?: string | null;
  relatedOgsercNo?: string | null;
  lga?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  ackIssuedVia?: string | null;
  receivedByUserId: string | null;
  source: InwardSource;
  remarks?: string | null;
  frontDeskItemId?: string | null;
  isExample?: boolean;
  // New Inward / Registry Intake details (SPEC §18.1, §19)
  senderRef?: string | null;
  documentDate?: string | null;
  inResponseToOutwardId?: string | null;
  deliveredBy?: string | null;
  volumes?: number | null;
  schedule2Count?: number | null;
  feeEvidence?: boolean | null;
  paymentReference?: string | null;
  amountShownKobo?: number | null;
};

/** Issues the next ACK (year of the deemed receipt date, Q3) and logs the item. */
export async function createInwardItem(tx: Tx, input: NewInward): Promise<{ id: string; ackNo: string; deemed: LocalDate }> {
  const [settings, holidays] = await all(tx, [() => getSettings(tx), () => getHolidaySet(tx)]);
  const deemed = deemedReceiptDate({ receivedAt: input.receivedAt, mode: input.mode, closingTime: settings.officeClosingTime, holidays });
  const { number } = await issueNumber(tx, "ACK", { year: yearOf(deemed) });
  const [row] = await tx
    .insert(inwardItems)
    .values({
      ackNo: number,
      ackYear: yearOf(deemed),
      receivedAt: input.receivedAt,
      mode: input.mode,
      deemedReceiptDate: deemed,
      correspondenceTypeId: input.correspondenceTypeId,
      sender: input.sender,
      senderCategory: input.senderCategory ?? "Registrant / licensee",
      subject: input.subject,
      cacNo: input.cacNo ?? null,
      relatedOgsercNo: input.relatedOgsercNo ?? null,
      lga: input.lga ?? null,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      ackIssuedVia: input.ackIssuedVia ?? "Not yet issued",
      receivedByUserId: input.receivedByUserId,
      source: input.source,
      remarks: input.remarks ?? null,
      frontDeskItemId: input.frontDeskItemId ?? null,
      isExample: input.isExample ?? false,
      senderRef: input.senderRef ?? null,
      documentDate: input.documentDate ?? null,
      inResponseToOutwardId: input.inResponseToOutwardId ?? null,
      deliveredBy: input.deliveredBy ?? null,
      volumes: input.volumes ?? null,
      schedule2Count: input.schedule2Count ?? null,
      feeEvidence: input.feeEvidence ?? null,
      paymentReference: input.paymentReference ?? null,
      amountShownKobo: input.amountShownKobo ?? null,
      createdBy: input.receivedByUserId,
    })
    .returning({ id: inwardItems.id });
  return { id: row.id, ackNo: number, deemed };
}
