/**
 * Minimal, lossless editing of an .xlsm package: cells are rewritten in the
 * sheet XML in place, everything else (VBA, drawings, controls, tables,
 * defined names) is copied untouched. Strings are written inline so the
 * shared-string table never changes; Excel recalculates on open
 * (fullCalcOnLoad is set).
 */
import JSZip from "jszip";

export type CellValue = string | number | null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function colNum(col: string): number {
  return col.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}
export function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell reference ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

/** Excel serial date for a calendar date (1900 system). */
export function serial(date: string): number {
  return Math.round((Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

type Row = { attrs: string; cells: Map<number, string> };

class Sheet {
  rows = new Map<number, Row>();
  head: string;
  tail: string;
  constructor(xml: string) {
    const start = xml.indexOf("<sheetData");
    const open = xml.indexOf(">", start);
    if (xml.slice(start, open + 1).endsWith("/>")) {
      this.head = xml.slice(0, start) + "<sheetData>";
      this.tail = "</sheetData>" + xml.slice(open + 1);
      return;
    }
    const end = xml.indexOf("</sheetData>");
    this.head = xml.slice(0, open + 1);
    this.tail = xml.slice(end);
    const body = xml.slice(open + 1, end);
    const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
    for (const m of body.matchAll(rowRe)) {
      const r = Number(/\br="(\d+)"/.exec(m[1])![1]);
      const cells = new Map<number, string>();
      const cellRe = /<c\b[^>]*?(\/>|>[\s\S]*?<\/c>)/g;
      for (const c of (m[3] ?? "").matchAll(cellRe)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(c[0])![1];
        cells.set(colNum(ref), c[0]);
      }
      this.rows.set(r, { attrs: m[1], cells });
    }
  }
  toXml(): string {
    const rows = [...this.rows.entries()].sort((a, b) => a[0] - b[0]);
    const body = rows
      .map(([, row]) => {
        const cells = [...row.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x);
        return cells.length ? `<row${row.attrs}>${cells.join("")}</row>` : `<row${row.attrs.replace(/\s*$/, "")}/>`;
      })
      .join("");
    return this.head + body + this.tail;
  }
  row(r: number): Row {
    let row = this.rows.get(r);
    if (!row) {
      row = { attrs: ` r="${r}"`, cells: new Map() };
      this.rows.set(r, row);
    }
    return row;
  }
  cellXml(ref: string): string | undefined {
    const { col, row } = splitRef(ref);
    return this.rows.get(row)?.cells.get(colNum(col));
  }
  style(ref: string): string | null {
    return /\bs="(\d+)"/.exec(this.cellXml(ref) ?? "")?.[1] ?? null;
  }
  put(ref: string, inner: string, attrs: string) {
    const { col, row } = splitRef(ref);
    this.row(row).cells.set(colNum(col), inner === "" ? `<c r="${ref}"${attrs}/>` : `<c r="${ref}"${attrs}>${inner}</c>`);
  }
}

export class XlsmPackage {
  private sheets = new Map<string, Sheet>();
  private sheetPaths = new Map<string, string>();
  private sst: string[] = [];
  private stylesXml = "";
  private textStyles = new Map<string, string>();
  private constructor(private zip: JSZip) {}

  static async load(buffer: Uint8Array): Promise<XlsmPackage> {
    const zip = await JSZip.loadAsync(buffer);
    const p = new XlsmPackage(zip);
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)![1];
      p.sheetPaths.set(unesc(m[1]), `xl/${target.replace(/^\/?xl\//, "")}`);
    }
    const sst = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sst) p.sst = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(""));
    p.stylesXml = await zip.file("xl/styles.xml")!.async("string");
    return p;
  }

  async file(path: string): Promise<string> {
    const f = this.zip.file(path);
    if (!f) throw new Error(`Missing ${path}`);
    return f.async("string");
  }
  setFile(path: string, content: string | Uint8Array) {
    this.zip.file(path, content);
  }
  async binary(path: string): Promise<Uint8Array> {
    return this.zip.file(path)!.async("uint8array");
  }

  private async sheet(name: string): Promise<Sheet> {
    let s = this.sheets.get(name);
    if (!s) {
      const path = this.sheetPaths.get(name);
      if (!path) throw new Error(`No sheet "${name}"`);
      s = new Sheet(await this.file(path));
      this.sheets.set(name, s);
    }
    return s;
  }

  /** Displayed text of a cell (shared string, inline string, value, or a formula's cached value). */
  async text(sheet: string, ref: string): Promise<string | null> {
    const x = (await this.sheet(sheet)).cellXml(ref);
    if (!x) return null;
    if (/\bt="s"/.test(x)) {
      const v = /<v>(\d+)<\/v>/.exec(x);
      return v ? this.sst[Number(v[1])] : null;
    }
    const is = /<is>([\s\S]*?)<\/is>/.exec(x);
    if (is) return [...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join("");
    const v = /<v>([\s\S]*?)<\/v>/.exec(x);
    return v ? unesc(v[1]) : null;
  }
  async isFormula(sheet: string, ref: string): Promise<boolean> {
    return /<f[\s>]/.test((await this.sheet(sheet)).cellXml(ref) ?? "");
  }

  /** Writes a value, keeping the cell's style. null empties the cell. */
  async set(sheet: string, ref: string, value: CellValue, opts: { style?: string } = {}) {
    const s = await this.sheet(sheet);
    const style = opts.style ?? s.style(ref);
    const sAttr = style ? ` s="${style}"` : "";
    if (value === null || value === "") s.put(ref, "", sAttr);
    else if (typeof value === "number") s.put(ref, `<v>${value}</v>`, sAttr);
    else s.put(ref, `<is><t xml:space="preserve">${esc(value)}</t></is>`, `${sAttr} t="inlineStr"`);
  }
  async formula(sheet: string, ref: string, f: string) {
    const s = await this.sheet(sheet);
    const style = s.style(ref);
    s.put(ref, `<f>${esc(f.replace(/^=/, ""))}</f>`, style ? ` s="${style}"` : "");
  }

  /** Empties every non-formula cell in rows [from, to] (formulas stay). Returns the rows touched. */
  async clearInputs(sheet: string, from: number, to: number, keep: (row: number) => Promise<boolean> = async () => false): Promise<number[]> {
    const s = await this.sheet(sheet);
    const touched: number[] = [];
    for (const [r, row] of s.rows) {
      if (r < from || r > to || (await keep(r))) continue;
      let any = false;
      for (const [c, x] of row.cells) {
        if (/<f[\s>]/.test(x)) {
          // Keep the formula, drop its cached result (Protected View shows cached values until editing is enabled).
          if (/<v>/.test(x)) {
            row.cells.set(c, x.replace(/<v>[\s\S]*?<\/v>/, "").replace(/\s+t="(str|s|b|e|n)"/, ""));
            any = true;
          }
          continue;
        }
        if (!/<v>|<is>/.test(x)) continue;
        const style = /\bs="(\d+)"/.exec(x)?.[1];
        row.cells.set(c, `<c r="${colName(c)}${r}"${style ? ` s="${style}"` : ""}/>`);
        any = true;
      }
      if (any) touched.push(r);
    }
    return touched;
  }

  /** Every text in a row (to find EXAMPLE rows). */
  async rowTexts(sheet: string, r: number): Promise<string[]> {
    const s = await this.sheet(sheet);
    const row = s.rows.get(r);
    if (!row) return [];
    const out: string[] = [];
    for (const c of row.cells.keys()) {
      const t = await this.text(sheet, `${colName(c)}${r}`);
      if (t) out.push(t);
    }
    return out;
  }
  async lastRow(sheet: string): Promise<number> {
    return Math.max(0, ...(await this.sheet(sheet)).rows.keys());
  }

  /** A copy of a cell style with the Text number format (@), cached per source style ([G5]). */
  private textStyle(base: string | null): string {
    const key = base ?? "0";
    const hit = this.textStyles.get(key);
    if (hit) return hit;
    const m = /<cellXfs count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(this.stylesXml)!;
    const xfs = [...m[2].matchAll(/<xf\b[^>]*?(\/>|>[\s\S]*?<\/xf>)/g)].map((x) => x[0]);
    const src = xfs[Number(key)];
    let copy = src.replace(/\bnumFmtId="\d+"/, 'numFmtId="49"');
    if (!/numFmtId=/.test(copy)) copy = copy.replace("<xf ", '<xf numFmtId="49" ');
    copy = /applyNumberFormat=/.test(copy) ? copy.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"') : copy.replace("<xf ", '<xf applyNumberFormat="1" ');
    const idx = String(xfs.length);
    this.stylesXml = this.stylesXml.replace(m[0], `<cellXfs count="${xfs.length + 1}">${m[2]}${copy}</cellXfs>`);
    this.textStyles.set(key, idx);
    return idx;
  }

  /** Formats cells as Text (creating empty cells where needed), keeping the rest of each cell's style. */
  async textFormat(sheet: string, col: string, from: number, to: number): Promise<number> {
    const s = await this.sheet(sheet);
    let n = 0;
    for (let r = from; r <= to; r++) {
      const ref = `${col}${r}`;
      const x = s.cellXml(ref);
      if (x && /<f[\s>]/.test(x)) continue;
      const style = this.textStyle(s.style(ref));
      if (!x) s.put(ref, "", ` s="${style}"`);
      else s.row(r).cells.set(colNum(col), x.replace(/\bs="\d+"/, `s="${style}"`).replace(/^<c (?![^>]*\bs=)/, `<c s="${style}" `));
      n++;
    }
    return n;
  }

  async headerColumns(sheet: string, headerRow: number): Promise<Map<string, string>> {
    const s = await this.sheet(sheet);
    const out = new Map<string, string>();
    for (const c of s.rows.get(headerRow)?.cells.keys() ?? []) {
      const t = await this.text(sheet, `${colName(c)}${headerRow}`);
      if (t) out.set(t.trim(), colName(c));
    }
    return out;
  }

  async build(): Promise<Buffer> {
    for (const [name, s] of this.sheets) this.zip.file(this.sheetPaths.get(name)!, s.toXml());
    this.zip.file("xl/styles.xml", this.stylesXml);
    return this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
}
