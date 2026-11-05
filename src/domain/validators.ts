/**
 * Shared field validators (SPEC §6; modCommon.ValidCac / ValidPhone / ValidEmail; [G5]).
 * Phones, CAC numbers, TINs and references are always strings.
 */

export type Validated = { ok: true; value: string } | { ok: false; message: string };

export const PHONE_MESSAGE =
  "Phone must be 11 digits starting with 0 (e.g. 08021846578), or +234 and 10 digits.";
export const CAC_MESSAGE = "CAC number must be RC, BN or IT followed by digits (e.g. RC1234567).";
export const EMAIL_MESSAGE = "Email address is not valid.";

/**
 * Phone: ignoring spaces and dashes, either "0" + 10 digits (11 digits) or
 * "+234" + 10 digits. The leading zero is part of the value and is kept.
 * Returns the number without spaces and dashes.
 */
export function validatePhone(input: string): Validated {
  const t = input.trim().replace(/[\s-]/g, "");
  if (/^0\d{10}$/.test(t) || /^\+234\d{10}$/.test(t)) return { ok: true, value: t };
  return { ok: false, message: PHONE_MESSAGE };
}

/** CAC: RC, BN or IT, an optional single space, then one or more digits. Upper-cased. */
export function validateCac(input: string): Validated {
  const t = input.trim().toUpperCase();
  if (/^(RC|BN|IT) ?\d+$/.test(t)) return { ok: true, value: t };
  return { ok: false, message: CAC_MESSAGE };
}

/** Email: one "@" not first, no spaces, a dot after the "@" with text either side. */
export function validateEmail(input: string): Validated {
  const t = input.trim();
  const at = t.indexOf("@");
  const dot = t.lastIndexOf(".");
  const ok =
    t.length > 0 &&
    !/\s/.test(t) &&
    at >= 1 &&
    t.indexOf("@", at + 1) === -1 &&
    dot > at + 1 &&
    dot < t.length - 1;
  return ok ? { ok: true, value: t } : { ok: false, message: EMAIL_MESSAGE };
}

/** TIN: format not confirmed by Finance (Q10); stored as trimmed text, not checked. */
export function normaliseTin(input: string): string {
  return input.trim();
}
