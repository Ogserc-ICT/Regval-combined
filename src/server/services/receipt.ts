/**
 * Receipt of a filing (SPEC §4.1; para 10(3)): the date and time received and
 * the channel, the deemed receipt date computed from them, and the ACK.
 * Used by the Register and Own-use saves. The deemed receipt date sets the ACK
 * year and the days late (Q3); once saved it never changes (a database guard
 * locks it).
 */
import { isLocalDate, lagosInstant, yearOf, type LocalDate } from "@/domain/dates";
import { deemedReceiptDate } from "@/domain/deemed";
import { all, type DbOrTx, type Tx } from "../db/connect";
import type { Problems } from "../errors";
import { issueNumber } from "../numbering";
import { serverNow } from "../time";
import { getHolidaySet } from "./holidays";
import { getSettings } from "./settings";

export const RECEIPT_CHANNELS = ["By hand", "Email", "Online portal"] as const;

export type ReceiptInput = { date: string | null | undefined; time: string | null | undefined; channel: string | null | undefined };
export type Receipt = { date: LocalDate; receivedAt: Date; channel: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks the three receipt fields, reporting every problem on its own field. */
export function checkReceipt(
  p: Problems,
  input: ReceiptInput,
  channels: readonly string[],
  fields: { date: string; time: string; channel: string } = { date: "dateSubmitted", time: "timeReceived", channel: "submissionChannel" },
): Receipt | null {
  const date = (input.date ?? "").trim();
  const time = (input.time ?? "").trim();
  const channel = (input.channel ?? "").trim();
  let ok = true;
  if (!isLocalDate(date)) {
    p.field(fields.date, "Date received is required (YYYY-MM-DD).");
    ok = false;
  }
  if (!HHMM.test(time)) {
    p.field(fields.time, "Time received is required (HH:MM, 24-hour).");
    ok = false;
  }
  if (!channel || !channels.includes(channel)) {
    p.field(fields.channel, "Choose how it was received: By hand, Email or Online portal.");
    ok = false;
  }
  if (!ok) return null;
  const receivedAt = lagosInstant(date, time);
  if (receivedAt.getTime() > serverNow().getTime()) {
    p.field(fields.date, "The date and time received cannot be in the future.");
    return null;
  }
  return { date, receivedAt, channel };
}

/** Para 10(3): the 17:00 cut-off applies to Email and Online portal only; weekends and holidays roll forward for every channel. */
export async function deemedFor(db: DbOrTx, r: Pick<Receipt, "receivedAt" | "channel">): Promise<LocalDate> {
  const [settings, holidays] = await all(db, [() => getSettings(db), () => getHolidaySet(db)]);
  return deemedReceiptDate({ receivedAt: r.receivedAt, mode: r.channel, closingTime: settings.officeClosingTime, holidays });
}

/** The next ACK, in the year of the deemed receipt date (Q3). */
export async function issueAck(tx: Tx, deemed: LocalDate): Promise<string> {
  const { number } = await issueNumber(tx, "ACK", { year: yearOf(deemed) });
  return number;
}
