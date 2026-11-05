/**
 * Number formats (SPEC §3). Prefixes are fixed constants so a number's format
 * can never change after it is issued. Issuing is done by the numbering
 * service (src/server/numbering.ts) inside a database transaction ([G12]).
 */

export const SERIES = ["ACK", "FD", "OUT", "PAY", "OUN", "DEF", "REG", "FILE"] as const;
export type Series = (typeof SERIES)[number];

const PREFIX = "OGSERC";

const WIDTH: Record<Series, number> = {
  ACK: 5,
  FD: 5,
  OUT: 5,
  PAY: 5,
  OUN: 4,
  DEF: 5,
  REG: 4,
  FILE: 3,
};

/** Series that restart each year. FILE is per file class with no year (Q5). */
export function isYearly(series: Series): boolean {
  return series !== "FILE";
}

function pad(n: number, width: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`Bad serial ${n}`);
  return String(n).padStart(width, "0");
}

export type NumberParts = {
  series: Series;
  serial: number;
  /** Required for yearly series. */
  year?: number;
  /**
   * REG: "{Category}-{Primary code}", e.g. "D-GEN" or "I-CPT".
   * FILE: the file class code, e.g. "RL".
   */
  scope?: string;
};

export function formatNumber({ series, serial, year, scope }: NumberParts): string {
  const n = pad(serial, WIDTH[series]);
  if (series === "FILE") {
    if (!scope) throw new RangeError("A file reference needs its file class code");
    return `${PREFIX}/${scope}/${n}`;
  }
  if (!year || !Number.isInteger(year)) throw new RangeError(`${series} numbers need a year`);
  if (series === "REG") {
    if (!scope) throw new RangeError("A registration number needs {Category}-{Code}");
    return `${PREFIX}/REG/${year}/${scope}/${n}`;
  }
  return `${PREFIX}/${series}/${year}/${n}`;
}
