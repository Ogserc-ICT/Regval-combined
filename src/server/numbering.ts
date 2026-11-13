/**
 * The one numbering service for every series ([G12]; docs/PLAN.md §4).
 *
 * Must be called with the transaction that saves the record. The counter row
 * is locked by the UPDATE until that transaction ends, so concurrent saves are
 * serialised and get consecutive numbers. A rolled-back save releases its
 * number; a committed number is never issued again, even if its record is
 * later cancelled.
 */
import { eq, sql } from "drizzle-orm";
import { DEFAULT_ACK_PREFIX, formatNumber, UNDATED_SERIES, type Series } from "@/domain/numbering";
import { settingsSchema } from "@/domain/settings";
import type { DbOrTx, Tx } from "./db/connect";
import { settings } from "./db/schema";

export type IssueOptions = {
  /** Ignored for a series that never restarts (CERT), which is kept under year 0. */
  year: number;
  /** REG: "{Category}-{Code}" for the formatted number (the serial is shared across categories). */
  scope?: string;
};

export type IssuedNumber = { number: string; serial: number; year: number };

/** The admin's ACK prefix (Admin › Settings), or the default. */
async function ackPrefix(tx: DbOrTx): Promise<string> {
  const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, "ackPrefix"));
  const parsed = settingsSchema.shape.ackPrefix.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_ACK_PREFIX;
}

export async function issueNumber(tx: Tx, series: Series, opts: IssueOptions): Promise<IssuedNumber> {
  const year = UNDATED_SERIES.has(series) ? 0 : opts.year;
  if (!UNDATED_SERIES.has(series) && (!year || !Number.isInteger(year))) throw new Error(`${series} needs a year`);

  await tx.execute(sql`
    insert into counters (series, year, scope, last_value)
    values (${series}, ${year}, '', 0)
    on conflict (series, year, scope) do nothing`);
  const res = await tx.execute<{ last_value: number }>(sql`
    update counters set last_value = last_value + 1, updated_at = now()
    where series = ${series} and year = ${year} and scope = ''
    returning last_value`);
  const serial = Number(res.rows[0]?.last_value);
  if (!serial) throw new Error(`Counter ${series}/${year} could not be advanced`);

  const number = formatNumber({ series, serial, year, scope: opts.scope, ackPrefix: series === "ACK" ? await ackPrefix(tx) : undefined });
  return { number, serial, year };
}

/** Peek at the last issued serial (for display only; never use it to build a number). */
export async function lastSerial(tx: DbOrTx, series: Series, year: number, scope = ""): Promise<number> {
  const res = await tx.execute<{ last_value: number }>(sql`
    select last_value from counters where series = ${series} and year = ${year} and scope = ${scope}`);
  return Number(res.rows[0]?.last_value ?? 0);
}
