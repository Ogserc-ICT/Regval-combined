/**
 * The one numbering service for every series ([G11], [G12]; docs/PLAN.md §4).
 *
 * Must be called with the transaction that saves the record. The counter row
 * is locked by the UPDATE until that transaction ends, so concurrent saves are
 * serialised and get consecutive numbers. A rolled-back save releases its
 * number; a committed number is never issued again, even if its record is
 * later cancelled.
 */
import { sql } from "drizzle-orm";
import { formatNumber, isYearly, type Series } from "@/domain/numbering";
import type { Tx } from "./db/connect";

export type IssueOptions = {
  /** Required for yearly series (all except FILE). */
  year?: number;
  /** REG: "{Category}-{Code}" for the formatted number (the serial is shared). FILE: class code. */
  scope?: string;
};

export type IssuedNumber = { number: string; serial: number; year: number };

export async function issueNumber(tx: Tx, series: Series, opts: IssueOptions = {}): Promise<IssuedNumber> {
  const yearly = isYearly(series);
  const year = yearly ? opts.year : 0;
  if (yearly && (!year || !Number.isInteger(year))) throw new Error(`${series} needs a year`);
  // REG shares one serial per year across categories; only FILE counts per scope.
  const counterScope = series === "FILE" ? (opts.scope ?? "") : "";
  if (series === "FILE" && !counterScope) throw new Error("FILE needs a file class code");

  await tx.execute(sql`
    insert into counters (series, year, scope, last_value)
    values (${series}, ${year}, ${counterScope}, 0)
    on conflict (series, year, scope) do nothing`);
  const res = await tx.execute<{ last_value: number }>(sql`
    update counters set last_value = last_value + 1, updated_at = now()
    where series = ${series} and year = ${year} and scope = ${counterScope}
    returning last_value`);
  const serial = Number(res.rows[0]?.last_value);
  if (!serial) throw new Error(`Counter ${series}/${year}/${counterScope} could not be advanced`);

  const number = formatNumber({ series, serial, year: yearly ? year : undefined, scope: opts.scope });
  return { number, serial, year: year ?? 0 };
}

/** Peek at the last issued serial (for display only; never use it to build a number). */
export async function lastSerial(tx: Tx, series: Series, year: number, scope = ""): Promise<number> {
  const res = await tx.execute<{ last_value: number }>(sql`
    select last_value from counters where series = ${series} and year = ${year} and scope = ${scope}`);
  return Number(res.rows[0]?.last_value ?? 0);
}
