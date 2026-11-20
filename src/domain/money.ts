/**
 * Money is held as whole kobo (integers). ₦1 = 100 kobo (SPEC §8.1).
 */

export type Kobo = number;

export function naira(amount: number): Kobo {
  const k = Math.round(amount * 100);
  if (!Number.isSafeInteger(k)) throw new RangeError("Amount out of range");
  return k;
}

/** "₦1,500,000" or "₦1,500,000.50" (modCommon.Naira: kobo only when non-zero). */
export function formatNaira(kobo: Kobo): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(Math.round(kobo));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}₦${grouped}${rest > 0 ? "." + String(rest).padStart(2, "0") : ""}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** 0–999 in words, British style ("Two Hundred and Five"). */
function hundreds(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const tail = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : "");
  return [h ? `${ONES[h]} Hundred` : "", tail].filter(Boolean).join(" and ");
}

/** A whole number in words: 1,250,005 → "One Million, Two Hundred and Fifty Thousand and Five". */
export function numberInWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("Amount out of range");
  if (n === 0) return "Zero";
  const groups: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const parts = groups
    .map((g, i) => (g ? `${hundreds(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}` : ""))
    .reverse()
    .filter(Boolean);
  // "One Thousand and Five": a last group under 100 joins with "and".
  const last = groups[0];
  if (parts.length > 1 && last > 0 && last < 100) return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return parts.join(", ");
}

/** The amount as written on a receipt: "Two Hundred and Fifty Thousand Naira and Fifty Kobo Only". */
export function nairaInWords(kobo: Kobo): string {
  const abs = Math.abs(Math.round(kobo));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${numberInWords(whole)} Naira${rest ? ` and ${numberInWords(rest)} Kobo` : ""} Only`;
}
