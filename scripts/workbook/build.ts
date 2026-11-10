/**
 * Phase 7: the offline workbook export (docs/COMBINED_BUILD.md, "Workbook
 * export" notes). Starts from the reference workbook in docs/source and
 * writes the app's rules and reference data into it, fixing G1–G6, G10,
 * G11 and G14. The VBA is kept, minus the partner-workbook code.
 */
import { asc, eq } from "drizzle-orm";
import { lagosDate, lagosMinuteOfDay } from "@/domain/dates";
import { lateCharge } from "@/domain/registration/pricing";
import type { Settings } from "@/domain/settings";
import type { DbOrTx } from "@/server/db/connect";
import { feeSchedule, holidays, signatories, userRoles, users } from "@/server/db/schema";
import { getSettings } from "@/server/services/settings";
import { VbaProject } from "./vba";
import { editModIntake, editModRegistry, editRegistryDesk, partnerLeftovers } from "./vba-edits";
import { serial, XlsmPackage } from "./xlsx";

export type ExportData = {
  settings: Settings;
  fees: { category: string; registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; description: string }[];
  holidays: { date: string; name: string; status: string }[];
  staff: Record<"evaluator" | "supervisor" | "approver" | "registry" | "router" | "front_desk", string[]>;
  signatories: { name: string; designation: string; role: string }[];
  unitEmails: Map<string, string | null>;
  divisionEmails: Map<string, string | null>;
};

export async function loadExportData(db: DbOrTx): Promise<ExportData> {
  const [settings, fees, hols, sigs, roleRows] = await Promise.all([
    getSettings(db),
    db.select().from(feeSchedule).orderBy(asc(feeSchedule.category)),
    db.select().from(holidays).orderBy(asc(holidays.date)),
    db.select().from(signatories).where(eq(signatories.active, true)).orderBy(asc(signatories.name)),
    db
      .select({ name: users.name, role: userRoles.role })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(users.active, true))
      .orderBy(asc(users.name)),
  ]);
  const staffFor = (role: string) => [...new Set(roleRows.filter((r) => r.role === role).map((r) => r.name))];
  return {
    settings,
    fees,
    holidays: hols.map((h) => ({ date: h.date, name: h.name, status: h.status })),
    staff: {
      evaluator: staffFor("evaluator"),
      supervisor: staffFor("supervisor"),
      approver: staffFor("approver"),
      // The app has no Registry since Phase 9 (QUESTIONS.md Q27): the workbook's Registry officer list
      // takes the Registration officers, who now enter filings; nobody routes or keeps a front desk.
      registry: staffFor("registration"),
      router: [],
      front_desk: [],
    },
    signatories: sigs.map((s) => ({ name: s.name, designation: s.designation, role: s.role })),
    // Units and their emails left the app with the Registry: the workbook keeps its own.
    unitEmails: new Map(),
    divisionEmails: new Map(),
  };
}

export type BuildStamp = { commit: string; builtAt: Date };
export type BuildResult = { buffer: Buffer; fileName: string; report: string[] };

/** Register sheets: header row, last data row, and whether a row is kept in a training copy. */
const REGISTERS = [
  { sheet: "Front Desk Log", header: 5, last: 1005 },
  { sheet: "Inward Register", header: 5, last: 1005 },
  { sheet: "Outward Register", header: 5, last: 1005 },
  { sheet: "File Index", header: 5, last: 1005 },
  { sheet: "File Movement", header: 5, last: 1005 },
  { sheet: "Register", header: 6, last: 7 },
  { sheet: "Payments", header: 6, last: 7 },
  { sheet: "Own-Use", header: 6, last: 7 },
  { sheet: "Audit Log", header: 4, last: 5 },
];

/** Headers of phone, CAC, TIN and reference columns ([G5]). Counts and volumes are excluded. */
const TEXT_HEADER = /phone|\bcac\b|\btin\b|\brrr\b|ref\b|ref\.|reference|\bno\.|issued no|in use|in reply to|registered as|file reference|payment no/i;
const NOT_TEXT = /no\. of|volumes|items|days|amount|count|serial \(|s\/n|\bon$|date/i;

/** Labels on the entry forms whose input cell (next column) must be Text. */
const FORM_SHEETS = ["Front Desk", "New Inward", "Registry Intake", "New Outward", "Update Item", "File Desk", "Routing Desk"];

const naira = (kobo: number) => kobo / 100;

export async function buildWorkbook(template: Uint8Array, data: ExportData, opts: { withExamples: boolean; stamp: BuildStamp }): Promise<BuildResult> {
  const x = await XlsmPackage.load(template);
  const report: string[] = [];
  const s = data.settings;

  // ---------------------------------------------------------------- Settings ([G1] one Effective Date, the app's values)
  await x.set("Settings", "B7", serial(s.effectiveDate));
  await x.set(
    "Settings",
    "C7",
    s.effectiveDatePlaceholder ? `PLACEHOLDER (${s.effectiveDate}): replace with the gazetted Effective Date (para 2). Every deadline depends on it.` : "Gazetted Effective Date (para 2). Every deadline depends on it.",
  );
  const n: [string, number | string | null][] = [
    ["B8", s.registrationPeriodDays],
    ["B9", s.extensionDays],
    ["B11", s.newOperatorLeadDays],
    ["B12", s.determinationDays],
    ["B13", s.deficiencyResponseDays],
    ["B14", s.licenceApplicationDays],
    ["B15", s.licenceExpiryWindowDays],
    ["B16", s.amberWarningDays],
    ["B17", s.ownUseThresholdKw],
    ["B18", s.showCauseDays],
    ["B19", s.annualConfirmationDueMonth],
    ["B20", s.annualConfirmationDueDay],
    ["B21", s.feesRevisedOn ? serial(s.feesRevisedOn) : null],
    ["B33", s.lateBlocksComplete],
    ["B34", s.waiverReducesLate],
    ["B35", s.flagsBlockApproval],
    ["B36", s.lateRequiredForRelease],
    ["B37", s.unpaidReminderDays],
    ["B38", s.supplyRetailCategoryAt1MW],
    ["B39", s.wrongFormHandling],
    ["B40", s.otherActivityDocs],
    ["B41", s.ownUseCertificate],
    ["B42", s.feeOnUpdates],
    ["B45", null],
    ["B49", null],
  ];
  for (const [ref, v] of n) await x.set("Settings", ref, v);
  await x.formula("Registry Settings", "B14", "cfgEffectiveDate");
  await x.formula("Registry Settings", "B15", "cfgExistingDeadline");
  await x.set("Registry Settings", "A14", "Effective Date of the Order (from Settings: one date for both halves)");
  await x.set("Registry Settings", "A15", "Registration deadline (Effective Date + period + extension, from Settings)");
  report.push("G1: Registry Settings B14/B15 now read Settings (one Effective Date; the deadline includes the extension).");

  const [hh, mm] = s.officeClosingTime.split(":").map(Number);
  // B8:B13 (service targets) and B17:B18 (acknowledgement email) left the app with the Registry
  // (Phase 9): the workbook keeps its own values there (QUESTIONS.md Q27).
  await x.set("Registry Settings", "B7", (hh * 60 + mm) / 1440);

  // Holidays (Registry Settings A21:D80)
  for (let r = 21; r <= 80; r++) for (const c of ["A", "B", "C", "D"]) await x.set("Registry Settings", `${c}${r}`, null);
  for (const [i, h] of data.holidays.slice(0, 60).entries()) {
    await x.set("Registry Settings", `A${21 + i}`, serial(h.date));
    await x.set("Registry Settings", `B${21 + i}`, h.name);
    await x.set("Registry Settings", `D${21 + i}`, h.status);
  }
  if (data.holidays.length > 60) report.push(`Holidays: only the first 60 of ${data.holidays.length} fit the workbook's list.`);
  report.push(`Holidays: ${Math.min(60, data.holidays.length)} from the app.`);

  // Fee table (Lists tblFees, rows 6–16) in naira
  for (const [i, f] of data.fees.entries()) {
    const r = 6 + i;
    if ((await x.text("Lists", `A${r}`)) !== f.category) throw new Error(`Lists A${r} is not category ${f.category}`);
    await x.set("Lists", `B${r}`, naira(f.registrationFee));
    await x.set("Lists", `C${r}`, naira(f.lateInitial));
    await x.set("Lists", `D${r}`, naira(f.lateDaily));
    await x.set("Lists", `E${r}`, naira(f.lateCap));
    await x.set("Lists", `G${r}`, f.description);
  }

  // ---------------------------------------------------------------- [G14] the late charge
  let g14 = false;
  for (let t = 1; t <= 60; t++) {
    const path = `xl/tables/table${t}.xml`;
    let xml: string;
    try {
      xml = await x.file(path);
    } catch {
      continue;
    }
    if (!xml.includes("_xlpm.i+MIN(_xlpm.d*_xlpm.n,_xlpm.cp)")) continue;
    x.setFile(path, xml.split("_xlpm.i+MIN(_xlpm.d*_xlpm.n,_xlpm.cp)").join("MIN(_xlpm.i+_xlpm.d*_xlpm.n,_xlpm.cp)"));
    g14 = true;
  }
  if (!g14) throw new Error("G14: the Register's Late Charge formula was not found");
  const d = data.fees.find((f) => f.category === "D")!;
  const d100 = lateCharge(100, d.lateInitial, d.lateDaily, d.lateCap);
  const formulaD100 = Math.min(d.lateInitial + d.lateDaily * 100, d.lateCap);
  if (d100 !== formulaD100) throw new Error(`G14 check failed: the app gives ${d100}, the workbook formula ${formulaD100}`);
  report.push(`G14: Late Charge = MIN(initial + daily × days late, cap); category D, 100 days late = ₦${naira(formulaD100).toLocaleString("en-NG")}.`);

  // ---------------------------------------------------------------- [G2] staff names per role
  const lists: [string, string[]][] = [
    ["BK", data.staff.evaluator],
    ["BM", data.staff.supervisor],
    ["BO", data.staff.approver],
  ];
  for (const [col, names] of lists) {
    const rows = Math.max(1, names.length);
    for (let r = 6; r <= 40; r++) await x.set("Lists", `${col}${r}`, null);
    for (const [i, nm] of names.entries()) await x.set("Lists", `${col}${6 + i}`, nm);
    await resizeTable(x, `${col}5:${col}6`, `${col}5:${col}${5 + rows}`);
  }
  report.push(`G2: officers from the app's accounts: ${data.staff.evaluator.length} evaluator(s), ${data.staff.supervisor.length} supervisor(s), ${data.staff.approver.length} approver(s).`);
  const reg = async (col: string, names: string[], extra?: (i: number) => Promise<void>) => {
    for (let r = 4; r <= 40; r++) await x.set("Registry Lists", `${col}${r}`, null);
    for (const [i, nm] of names.entries()) {
      await x.set("Registry Lists", `${col}${4 + i}`, nm);
      if (extra) await extra(i);
    }
  };
  await reg("Z", data.staff.registry);
  await reg("AR", data.staff.front_desk);
  for (let r = 4; r <= 40; r++) for (const c of ["AG", "AH", "AI"]) await x.set("Registry Lists", `${c}${r}`, null);
  await reg("AF", data.staff.router, async (i) => x.set("Registry Lists", `AG${4 + i}`, "Router"));
  const secretary = data.signatories.find((g) => g.role === "secretary");
  await reg("AA", secretary ? [secretary.name] : []);
  await x.set("Registry Desk", "C4", data.staff.registry[0] ?? null);
  await x.set("Registry Desk", "F4", secretary?.name ?? null);

  // ---------------------------------------------------------------- [G3] one signatory list
  for (let r = 4; r <= 40; r++) for (const c of ["AC", "AD"]) await x.set("Registry Lists", `${c}${r}`, null);
  const order = [...data.signatories].sort((a, b) => ["chairman_ceo", "commissioner", "secretary", "other"].indexOf(a.role) - ["chairman_ceo", "commissioner", "secretary", "other"].indexOf(b.role));
  for (const [i, g] of order.entries()) {
    await x.set("Registry Lists", `AC${4 + i}`, g.name);
    await x.set("Registry Lists", `AD${4 + i}`, g.designation);
  }
  const rowOf = (role: string) => order.findIndex((g) => g.role === role);
  for (const [ref, role] of [
    ["B29", "chairman_ceo"],
    ["B30", "commissioner"],
  ] as const) {
    const i = rowOf(role);
    if (i >= 0) await x.formula("Settings", ref, `'Registry Lists'!AC${4 + i}`);
    else await x.set("Settings", ref, null);
  }
  report.push(
    `G3: one signatory list (Registry Lists AC:AD) feeds Settings B29/B30. ${rowOf("commissioner") < 0 ? "No Commissioner yet: approvals of new registrations stay blocked, as in the app." : "Chairman and Commissioner set."}`,
  );

  // Unit and division emails ([G9] addresses)
  for (let r = 4; r <= 60; r++) {
    const unit = await x.text("Registry Lists", `AJ${r}`);
    if (unit && data.unitEmails.has(unit)) await x.set("Registry Lists", `AM${r}`, data.unitEmails.get(unit) ?? null);
    const div = await x.text("Registry Lists", `AO${r}`);
    if (div && data.divisionEmails.has(div)) await x.set("Registry Lists", `AP${r}`, data.divisionEmails.get(div) ?? null);
  }

  // ---------------------------------------------------------------- [G4] registers: clean, or a training copy
  let cleared = 0;
  let kept = 0;
  for (const g of REGISTERS) {
    const rows = await x.clearInputs(g.sheet, g.header + 1, Math.max(g.last, await x.lastRow(g.sheet)), async (r) => {
      if (!opts.withExamples) return false;
      const isExample = (await x.rowTexts(g.sheet, r)).some((t) => /\bEXAMPLE\b/.test(t));
      if (isExample) kept++;
      return isExample;
    });
    cleared += rows.length;
  }
  for (const [sheet, ref] of [
    ["Registry Desk", "D1"],
    ["Acknowledgement Slip", "D1"],
  ] as const) {
    if (!(await x.isFormula(sheet, ref)) && (await x.text(sheet, ref))) await x.set(sheet, ref, null);
  }
  report.push(opts.withExamples ? `G4: TRAINING copy: ${kept} EXAMPLE row(s) kept; every other register row emptied.` : `G4: registers empty (${cleared} row(s) cleared, including EXAMPLE rows and the test audit entry).`);

  // ---------------------------------------------------------------- [G5] Text format
  let textCells = 0;
  for (const g of REGISTERS.filter((r) => r.sheet !== "Audit Log")) {
    const cols = await x.headerColumns(g.sheet, g.header);
    for (const [header, col] of cols) {
      if (!TEXT_HEADER.test(header) || NOT_TEXT.test(header)) continue;
      textCells += await x.textFormat(g.sheet, col, g.header + 1, g.last);
    }
  }
  for (const sheet of FORM_SHEETS) {
    for (let r = 1; r <= 60; r++) {
      for (const col of ["B"]) {
        const label = await x.text(sheet, `${col}${r}`);
        if (!label || label.length > 60 || !TEXT_HEADER.test(label) || NOT_TEXT.test(label)) continue;
        const next = String.fromCharCode(col.charCodeAt(0) + 1);
        if (!(await x.isFormula(sheet, `${next}${r}`))) textCells += await x.textFormat(sheet, next, r, r);
      }
    }
  }
  report.push(`G5: ${textCells} phone, CAC, TIN and reference cell(s) formatted as Text.`);

  // ---------------------------------------------------------------- [G10] build stamp
  const m = lagosMinuteOfDay(opts.stamp.builtAt);
  await x.set("Settings", "B50", `${opts.stamp.commit} (clean)`);
  await x.set("Settings", "B51", serial(lagosDate(opts.stamp.builtAt)) + m / 1440);
  await x.set("Settings", "C50", "Git commit of the app this workbook was exported from (Phase 7 export).");
  report.push(`G10: stamped commit ${opts.stamp.commit}, built ${lagosDate(opts.stamp.builtAt)} (Lagos).`);

  // ---------------------------------------------------------------- [G11] VBA without the partner-workbook code
  const vba = new VbaProject(await x.binary("xl/vbaProject.bin"));
  vba.setSource("modRegistry", editModRegistry(vba.source("modRegistry")));
  vba.setSource("modIntake", editModIntake(vba.source("modIntake")));
  vba.setSource("RegistryDesk", editRegistryDesk(vba.source("RegistryDesk")));
  const left = partnerLeftovers(vba.allSources());
  if (left.length) throw new Error(`G11: partner-workbook code remains:\n${left.join("\n")}`);
  x.setFile("xl/vbaProject.bin", vba.write());
  report.push("G11: partner-workbook code removed from the VBA (filings log straight into this workbook's Inward Register).");

  const buffer = await x.build();
  const fileName = `OGSERC_Registry_and_Evaluation_${opts.stamp.commit}${opts.withExamples ? "_TRAINING" : ""}.xlsm`;
  return { buffer, fileName, report };
}

async function resizeTable(x: XlsmPackage, from: string, to: string) {
  for (let t = 1; t <= 60; t++) {
    const path = `xl/tables/table${t}.xml`;
    let xml: string;
    try {
      xml = await x.file(path);
    } catch {
      continue;
    }
    if (!xml.includes(`ref="${from}"`)) continue;
    x.setFile(path, xml.split(`ref="${from}"`).join(`ref="${to}"`));
    return;
  }
  throw new Error(`No table with range ${from}`);
}
