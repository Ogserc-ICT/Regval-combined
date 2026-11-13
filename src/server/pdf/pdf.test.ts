/**
 * The four registration PDFs render from sample data, with the page counts the templates
 * have. Set PDF_SAMPLES_DIR to also write them out for a visual check against docs/templates/.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import ref from "../../../seed/data/reference.json";
import type { AcknowledgementData, CertificateData, DeficiencyData, EvaluationData } from "../services/letters";
import { AcknowledgementLetter } from "./acknowledgement-letter";
import { Certificate } from "./certificate";
import { dayOfMonthYear, registerFonts } from "./common";
import { DeficiencyNotice } from "./deficiency-notice";
import { Eval01 } from "./eval-01";

const head = { address: "5th & 6th Floors, OPIC Building, Oke-Ilewo, Abeokuta", email: "registration@ogserc.org.ng" };

export const SAMPLE_ACK: AcknowledgementData = {
  head,
  ackNo: "OGSERC/ACK/2026/00001",
  date: "2026-11-13",
  filing: "NEW",
  filingLabel: "New registration",
  linkedRegistrationNo: null,
  to: "Sample Mini-Grid Ltd",
  address: "1 Sample Road, Abeokuta",
  attention: "A. Officer",
  receivedAt: new Date("2026-10-23T16:30:00Z"),
  dateSubmitted: "2026-10-23",
  deemedReceiptDate: "2026-10-26",
  channel: "Email",
  activities: ["Mini-grid / interconnected mini-grid"],
  capacityMw: 2.5,
  category: "E — Mini-grids and interconnected mini-grids",
  categoryConfirmed: false,
  fee: 25_000_000,
  waiver: 0,
  lateCharge: 0,
  daysLate: 0,
  deadline: "2026-12-21",
  totalDue: 25_000_000,
  paid: 10_000_000,
  balance: 15_000_000,
  newOperator: false,
  received: ["1. CAC certificate & status report (or equivalent)", "2. Memorandum & articles (or equivalent)", "3. Copy of every licence / permit / registration"],
  pending: ["10. Environmental & safety permits / EIA", "12. Evidence of registration fee payment"],
  unlicensed: true,
  licenceApplicationDue: "2027-01-20",
  days: { determination: 30, deficiency: 14, showCause: 14 },
  signedBy: "Sample Officer",
};

const SAMPLE_DEF: DeficiencyData = {
  head,
  defNo: "OGSERC/DEF/2026/00001",
  ackNo: "OGSERC/ACK/2026/00001",
  date: "2026-11-13",
  responseDue: "2026-11-27",
  draft: true,
  to: "Sample Mini-Grid Ltd",
  address: null,
  attention: null,
  submissionDate: "2026-10-01",
  contents: {
    documents: ["4. Single-line diagram", "5. Asset register with GPS coordinates"],
    checks: ["B. Ownership: shareholders ≥5%, directors and beneficial owners (check 2.2)"],
    remarks: "Shareholding schedule does not match the CAC status report.",
    category: "E",
    totalDue: 25_000_000,
    paid: 10_000_000,
    balance: 15_000_000,
    issuedByName: "Sample Supervisor",
  },
};

function sampleEval(): EvaluationData {
  const post = new Set(["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"]);
  const checks = [...ref.checks].sort((a, b) => a.sort - b.sort);
  const line = (c: (typeof checks)[number], i: number) => ({
    id: c.id,
    text: c.text,
    value: i % 9 === 0 ? "N" : i % 7 === 0 ? "" : "Y",
    automatic: i % 5 === 0,
    applicable: i % 11 !== 0,
  });
  const stages: EvaluationData["stages"] = [];
  checks
    .filter((c) => !post.has(c.id))
    .forEach((c, i) => {
      const last = stages.at(-1);
      if (last?.title === c.stage) last.checks.push(line(c, i));
      else stages.push({ title: c.stage, checks: [line(c, i)] });
    });
  return {
    head,
    ackNo: "OGSERC/ACK/2026/00001",
    registrant: "Sample Mini-Grid Ltd",
    filingLabel: "New registration",
    categoryActivity: "E — Mini-grid / interconnected mini-grid",
    evaluator: "Sample Evaluator",
    supervisor: "Sample Supervisor",
    approver: null,
    startedOn: "2026-10-22",
    stages,
    postApproval: checks.filter((c) => post.has(c.id)).map((c) => ({ id: c.id, text: c.text, value: "", automatic: false, applicable: true })),
    counts: { satisfied: 40, failed: 5, notApplicable: 5, pending: 6 },
    recommendedOutcome: "Issue deficiency notice (13(1)(b))",
    finalDecision: null,
    approvalDate: null,
    reasons: null,
    remarks: "All documents verified against originals.",
    flags: ["Duplicate CAC number"],
    flagOverrideReason: "Same company; the earlier filing was withdrawn.",
    registrationNo: null,
    printedOn: "2026-11-13",
  };
}

const SAMPLE_CERT: CertificateData = {
  serial: "0001",
  registrationNo: "OGSERC/REG/2026/F-MSL/0001",
  registrant: "Sample Power Distribution and Trading Company of Nigeria Limited",
  cacNo: "RC1234567",
  address: "Plot 14, Industrial Estate Road, Off Lagos–Abeokuta Expressway, Ota, Ogun State",
  category: "F — Distribution licensees other than successor distribution companies; trading and bulk supply",
  primaryActivity: "Multi-State licensee – non-successor (Ogun operations)",
  otherActivities: ["Trading / bulk supply"],
  serviceArea: "Ado-Odo/Ota; Ifo; Ewekoro; Agbara industrial estate feeders 1–4",
  licence: "NERC licence (multi-State), No. NERC/LIC/DIS/2019/044",
  issueDate: "2026-10-22",
  chairman: { name: "Chairman Name", designation: "Chairman / Chief Executive Officer", confirmed: true },
  commissioner: { name: "Commissioner Name", designation: "Commissioner", confirmed: true },
  draftReason: null,
  voidReason: null,
  needsReissue: false,
  submissionId: "00000000-0000-0000-0000-000000000000",
};

async function render(name: string, el: ReactElement): Promise<{ pages: number; bytes: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- renderToBuffer wants a <Document> element
  const buf = await renderToBuffer(el as any);
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  const dir = process.env.PDF_SAMPLES_DIR;
  if (dir) writeFileSync(path.join(dir, `${name}.pdf`), buf);
  return { pages: (buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, bytes: buf.length };
}

describe("registration PDFs (Phase 10)", () => {
  registerFonts();

  it("acknowledgement letter: two pages, as the template", async () => {
    const r = await render("acknowledgement", createElement(AcknowledgementLetter, { x: SAMPLE_ACK }));
    expect(r.pages).toBe(2);
  }, 30_000);

  it("acknowledgement letter for an update renders", async () => {
    const r = await render("acknowledgement-update", createElement(AcknowledgementLetter, { x: { ...SAMPLE_ACK, filing: "UPDATE", filingLabel: "Update", linkedRegistrationNo: "OGSERC/REG/2026/E-MGD/0001", unlicensed: false } }));
    expect(r.pages).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("deficiency notice: one page", async () => {
    expect((await render("deficiency-draft", createElement(DeficiencyNotice, { x: SAMPLE_DEF }))).pages).toBe(1);
    expect((await render("deficiency-sent", createElement(DeficiencyNotice, { x: { ...SAMPLE_DEF, draft: false } }))).pages).toBe(1);
  }, 30_000);

  it("EVAL-01: every check, three pages at most", async () => {
    const r = await render("eval-01", createElement(Eval01, { x: sampleEval() }));
    expect(r.pages).toBeGreaterThanOrEqual(2);
    expect(r.pages).toBeLessThanOrEqual(3);
  }, 30_000);

  it("CERT-01: one landscape page, also as a draft", async () => {
    const qr = await QRCode.toBuffer("https://example.invalid/register/x", { margin: 0, width: 240 });
    expect((await render("cert-01", createElement(Certificate, { x: SAMPLE_CERT, qr }))).pages).toBe(1);
    const draft = { ...SAMPLE_CERT, commissioner: { ...SAMPLE_CERT.commissioner!, confirmed: false }, draftReason: "Signatories: not confirmed" };
    expect((await render("cert-01-draft", createElement(Certificate, { x: draft, qr }))).pages).toBe(1);
  }, 30_000);

  it("dates the certificate as the template does", () => {
    expect(dayOfMonthYear("2026-10-22")).toBe("22nd day of October, 2026");
    expect(dayOfMonthYear("2026-11-01")).toBe("1st day of November, 2026");
    expect(dayOfMonthYear("2026-11-11")).toBe("11th day of November, 2026");
    expect(dayOfMonthYear("2026-12-23")).toBe("23rd day of December, 2026");
  });
});
