import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/settings";
import { buildWorkbook, type BuildResult, type ExportData } from "./build";
import { compress, decompress } from "./ovba";
import { VbaProject } from "./vba";
import { editModIntake, editModRegistry, editRegistryDesk, partnerLeftovers, removeProc } from "./vba-edits";
import { XlsmPackage } from "./xlsx";

const template = readFileSync(path.join(process.cwd(), "docs", "source", "OGSERC_Registry_and_Evaluation_Combined.xlsm"));
const reference = JSON.parse(readFileSync(path.join(process.cwd(), "seed", "data", "reference.json"), "utf8")) as { fees: { category: string; registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; description: string }[] };

const data: ExportData = {
  settings: { ...DEFAULT_SETTINGS, effectiveDate: "2026-11-02", extensionDays: 7 },
  fees: reference.fees,
  holidays: [{ date: "2026-12-25", name: "Christmas Day", status: "Fixed" }],
  staff: { evaluator: ["Eva Evaluator"], supervisor: ["Sam Supervisor", "Sue Supervisor"], approver: ["Ade Approver"], registry: ["Reg Officer"], router: ["Rita Router"], front_desk: ["Fola Desk"] },
  signatories: [
    { name: "Chair Person", designation: "Chairman", role: "chairman_ceo" },
    { name: "Sec Person", designation: "Secretary to the Commission", role: "secretary" },
  ],
  unitEmails: new Map([["Licensing unit", "licensing@ogserc.org.ng"]]),
  divisionEmails: new Map(),
};

describe("MS-OVBA codec", () => {
  it("round-trips text, repeats and more than one 4 KB chunk", () => {
    for (const s of ["", "a", "abcabcabcabcabc", "Attribute VB_Name = \"x\"\r\n".repeat(400), Array.from({ length: 9000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 90))).join("")]) {
      const b = Buffer.from(s, "latin1");
      expect(decompress(compress(b)).equals(b)).toBe(true);
    }
  });
});

describe("G11: VBA edits on the real workbook", () => {
  it("remove every partner-workbook reference and keep the direct logging path", async () => {
    const zip = await JSZip.loadAsync(template);
    const vba = new VbaProject(await zip.file("xl/vbaProject.bin")!.async("uint8array"));
    const src = vba.allSources();
    expect(partnerLeftovers(src).length).toBeGreaterThan(50);
    src.modRegistry = editModRegistry(src.modRegistry);
    src.modIntake = editModIntake(src.modIntake);
    src.RegistryDesk = editRegistryDesk(src.RegistryDesk);
    expect(partnerLeftovers(src)).toEqual([]);
    expect(src.modRegistry).toContain("res = RegistryDesk.RX_LogFiling(payload)");
    expect(src.modRegistry).toContain("m2 = RegistryDesk.RX_MaxInwardSerial(stem)");
    expect(src.RegistryDesk).toContain("Public Function RX_LogFiling(ByVal payload As String) As String");
  });
  it("removeProc refuses a procedure it cannot find", () => {
    expect(() => removeProc("Sub A()\r\nEnd Sub", "B")).toThrow("found 0 times");
  });
});

describe("workbook export (Phase 7 acceptance check)", () => {
  let clean: BuildResult;
  let training: BuildResult;
  beforeAll(async () => {
    const stamp = { commit: "abc1234", builtAt: new Date("2026-11-06T09:30:00Z") };
    clean = await buildWorkbook(template, data, { withExamples: false, stamp });
    training = await buildWorkbook(template, data, { withExamples: true, stamp });
  }, 120_000);

  it("names the files, and marks the training copy", () => {
    expect(clean.fileName).toBe("OGSERC_Registry_and_Evaluation_abc1234.xlsm");
    expect(training.fileName).toBe("OGSERC_Registry_and_Evaluation_abc1234_TRAINING.xlsm");
  });

  it("G1 one Effective Date, G2 staff names, G3 one signatory list, G10 stamp", async () => {
    const x = await XlsmPackage.load(clean.buffer);
    expect(await x.text("Settings", "B7")).toBe(String(46328)); // 2 Nov 2026
    expect(await x.isFormula("Registry Settings", "B14")).toBe(true);
    expect(await x.isFormula("Registry Settings", "B15")).toBe(true);
    expect([await x.text("Lists", "BK6"), await x.text("Lists", "BM6"), await x.text("Lists", "BM7"), await x.text("Lists", "BO6")]).toEqual(["Eva Evaluator", "Sam Supervisor", "Sue Supervisor", "Ade Approver"]);
    expect(await x.text("Registry Lists", "AC4")).toBe("Chair Person");
    expect(await x.isFormula("Settings", "B29")).toBe(true);
    expect(await x.text("Settings", "B30")).toBeNull(); // no Commissioner: approvals stay blocked
    expect(await x.text("Settings", "B50")).toBe("abc1234 (clean)");
    expect(clean.report.join("\n")).toContain("No Commissioner yet");
  });

  it("G4: no EXAMPLE rows and the real record is not copied; the training copy keeps the EXAMPLE rows", async () => {
    const x = await XlsmPackage.load(clean.buffer);
    const t = await XlsmPackage.load(training.buffer);
    for (const sheet of ["Inward Register", "Outward Register", "File Index", "File Movement", "Front Desk Log"]) {
      for (let r = 6; r <= 10; r++) expect((await x.rowTexts(sheet, r)).some((v) => /EXAMPLE|Verge Power/.test(v))).toBe(false);
    }
    expect((await t.rowTexts("Inward Register", 6)).some((v) => /EXAMPLE/.test(v))).toBe(true);
    expect((await t.rowTexts("Front Desk Log", 6)).some((v) => /Verge Power/.test(v))).toBe(false);
  });

  it("G5 text cells and G14 late charge", async () => {
    const zip = await JSZip.loadAsync(clean.buffer);
    const tables = await Promise.all(Object.keys(zip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
    expect(tables.some((t) => t.includes("MIN(_xlpm.i+_xlpm.d*_xlpm.n,_xlpm.cp)"))).toBe(true);
    expect(tables.some((t) => t.includes("_xlpm.i+MIN("))).toBe(false);
    expect(clean.report.join("\n")).toContain("category D, 100 days late = ₦10,000,000");
    const styles = await zip.file("xl/styles.xml")!.async("string");
    const sheet = await zip.file("xl/worksheets/sheet23.xml")!.async("string"); // Front Desk Log
    const s = /<c r="K6" s="(\d+)"/.exec(sheet)![1];
    const xfs = [.../<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1].matchAll(/<xf\b[^>]*?(\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
    expect(xfs[Number(s)]).toContain('numFmtId="49"');
  });

  it("G11: the exported VBA has no partner-workbook code; the macro container is rebuilt for Excel to recompile", async () => {
    const zip = await JSZip.loadAsync(clean.buffer);
    const vba = new VbaProject(await zip.file("xl/vbaProject.bin")!.async("uint8array"));
    expect(partnerLeftovers(vba.allSources())).toEqual([]);
    expect(vba.moduleNames()).toContain("RegistryDesk");
  });
});
