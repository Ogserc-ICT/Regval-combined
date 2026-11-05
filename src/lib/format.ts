import { longDate, shortDate } from "@/domain/dates";
import { formatNaira } from "@/domain/money";

export const naira = (kobo: number | null | undefined) => (kobo === null || kobo === undefined ? "—" : formatNaira(kobo));
export const dateShort = (d: string | null | undefined) => (d ? shortDate(d) : "—");
export const dateLong = (d: string | null | undefined) => (d ? longDate(d) : "—");

/** Parse a naira amount typed by staff ("1,500,000" or "1500000.50") into kobo. */
export function parseNairaToKobo(input: FormDataEntryValue | null): number {
  const s = String(input ?? "").replace(/[₦,\s]/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
