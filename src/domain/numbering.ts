/**
 * Number formats (SPEC §3). Every series restarts each year, except the CERT-01
 * certificate serial, which never resets (Q28d). Issuing is done by
 * the numbering service (src/server/numbering.ts) inside a database
 * transaction ([G12]).
 *
 * The ACK prefix is an admin setting (default "OGSERC/ACK"); the other
 * prefixes are fixed, so their format never changes after a number is issued.
 */

export const SERIES = ["ACK", "PAY", "OUN", "DEF", "REG", "CERT"] as const;
export type Series = (typeof SERIES)[number];

const PREFIX = "OGSERC";
export const DEFAULT_ACK_PREFIX = "OGSERC/ACK";

const WIDTH: Record<Series, number> = {
  ACK: 5,
  PAY: 5,
  OUN: 4,
  DEF: 5,
  REG: 4,
  CERT: 4,
};

/** Series that never restart: their counter is kept under year 0. */
export const UNDATED_SERIES: ReadonlySet<Series> = new Set(["CERT"]);

function pad(n: number, width: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`Bad serial ${n}`);
  return String(n).padStart(width, "0");
}

export type NumberParts = {
  series: Series;
  serial: number;
  year: number;
  /** REG: "{Category}-{Primary code}", e.g. "D-GEN" or "I-CPT". */
  scope?: string;
  /** ACK only: the prefix from the settings (default "OGSERC/ACK"). */
  ackPrefix?: string;
};

export function formatNumber({ series, serial, year, scope, ackPrefix }: NumberParts): string {
  const n = pad(serial, WIDTH[series]);
  if (series === "CERT") return n;
  if (!year || !Number.isInteger(year)) throw new RangeError(`${series} numbers need a year`);
  if (series === "ACK") return `${ackPrefix || DEFAULT_ACK_PREFIX}/${year}/${n}`;
  if (series === "REG") {
    if (!scope) throw new RangeError("A registration number needs {Category}-{Code}");
    return `${PREFIX}/REG/${year}/${scope}/${n}`;
  }
  return `${PREFIX}/${series}/${year}/${n}`;
}
