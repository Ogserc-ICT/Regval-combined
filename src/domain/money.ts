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
