/**
 * G11: remove the partner-workbook code from the combined workbook's VBA.
 *
 * In the combined workbook the "partner" was the workbook itself, reached
 * through Application.Run. The two paths that did real work there (logging a
 * filing in the Inward Register, and the highest ACK serial across the
 * Register, Own-Use and the Inward Register) become direct calls. Everything
 * that finds, opens, syncs or pushes to a second workbook is deleted.
 * Every edit asserts it matched exactly once, so a changed source stops the
 * build instead of producing a half-edited workbook.
 */

const NL = "\r\n";

function once(src: string, find: string, replace: string, what: string): string {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`VBA edit "${what}": expected 1 match, found ${n}`);
  return src.replace(find, () => replace);
}

function all(src: string, find: string, replace: string, expected: number, what: string): string {
  const n = src.split(find).length - 1;
  if (n !== expected) throw new Error(`VBA edit "${what}": expected ${expected} matches, found ${n}`);
  return src.split(find).join(replace);
}

/** Replace from `start` (inclusive) to the end of `end` (inclusive). */
function between(src: string, start: string, end: string, replace: string, what: string): string {
  const i = src.indexOf(start);
  if (i < 0 || src.indexOf(start, i + 1) >= 0) throw new Error(`VBA edit "${what}": start not found exactly once`);
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`VBA edit "${what}": end not found`);
  return src.slice(0, i) + replace + src.slice(j + end.length);
}

/** Remove a procedure with the comment lines directly above it. */
export function removeProc(src: string, name: string): string {
  const lines = src.split(NL);
  const def = new RegExp(`^(Public |Private )?(Function|Sub) ${name}\\b`);
  const starts = lines.map((l, i) => (def.test(l) ? i : -1)).filter((i) => i >= 0);
  if (starts.length !== 1) throw new Error(`VBA: procedure ${name} found ${starts.length} times`);
  let s = starts[0];
  let e = s;
  while (e < lines.length && !/^End (Function|Sub)\s*$/.test(lines[e])) e++;
  if (e >= lines.length) throw new Error(`VBA: no End for ${name}`);
  while (s > 0 && lines[s - 1].startsWith("'")) s--;
  if (s > 0 && lines[s - 1].trim() === "" && lines[e + 1]?.trim() === "") e++;
  lines.splice(s, e - s + 1);
  return lines.join(NL);
}

function replaceProc(src: string, name: string, text: string): string {
  const lines = src.split(NL);
  const def = new RegExp(`^(Public |Private )?(Function|Sub) ${name}\\b`);
  const s0 = lines.findIndex((l) => def.test(l));
  if (s0 < 0) throw new Error(`VBA: procedure ${name} not found`);
  let s = s0;
  let e = s0;
  while (!/^End (Function|Sub)\s*$/.test(lines[e])) e++;
  while (s > 0 && lines[s - 1].startsWith("'")) s--;
  lines.splice(s, e - s + 1, ...text.split("\n"));
  return lines.join(NL);
}

export function editModRegistry(src: string): string {
  let s = src;
  s = once(
    s,
    "' Linked to the Registry Correspondence workbook through ONE shared OGSERC/ACK number series:" + NL +
      "' whichever workbook acknowledges a filing takes the next number across both, and the other workbook" + NL +
      "' gets a matching row (Inward Register here <-> Filings Inward / Register there)." + NL +
      "' In the combined workbook the \"correspondence workbook\" is this workbook itself." + NL +
      "' Buttons are green cells named BTN_<macro>__<n>, as in the correspondence workbook." + NL,
    "' ONE OGSERC/ACK number series covers the Register, Own-Use and the Inward Register in this workbook:" + NL +
      "' every acknowledgement takes the next number across all three and is logged in the Inward Register." + NL +
      "' Buttons are green cells named BTN_<macro>__<n>." + NL,
    "module header",
  );
  s = once(s, "' Next number in a series = highest number already used in that year + 1 (as in the correspondence workbook).", "' Next number in a series = highest number already used in that year + 1.", "next number comment");
  s = once(s, `Private mPartner As Workbook${NL}Private mOpenedHere As Boolean${NL}Private mLinkError As String${NL}`, "", "partner variables");
  // Registry Intake: log the filing straight into this workbook's Inward Register.
  s = between(
    s,
    `        If pre = "RI" Then${NL}            lr = NextFreeRow("RI", "no", "sender")${NL}            If lr = 0 Then Err.Raise vbObjectError + 514`,
    `            If Left$(corrNote, 6) <> "Logged" Then Err.Raise vbObjectError + 515, , corrNote${NL}        End If${NL}`,
    `        corrNote = RX_LogInward(FormPayload(ack, fdNo, ftype))${NL}        If Left$(corrNote, 6) <> "Logged" Then Err.Raise vbObjectError + 515, , corrNote${NL}`,
    "intake logging",
  );
  s = once(s, `    EndAction${NL}    RX_ReleasePartner${NL}`, `    EndAction${NL}`, "intake release");
  // Direct Register / Own-Use entries: log them in the Inward Register.
  s = between(s, `    If LogPre() = "RI" Then${NL}        lr = NextFreeRow("RI", "no", "sender")`, `    Else${NL}        note = RX_LogToCorrespondence(p)${NL}    End If${NL}`, `    note = RX_LogInward(p)${NL}`, "direct entry logging");
  s = replaceProc(
    s,
    "RX_NextAck",
    [
      "' Next acknowledgement number for a year: the highest used in the Register, Own-Use or the Inward Register, + 1.",
      "Public Function RX_NextAck(ByVal yr As Long) As String",
      "    Dim stem As String, mx As Long, m2 As Long",
      '    stem = Txt(Setting("cfgAckPrefix")) & "/" & yr & "/"',
      "    mx = RX_MaxRegisterSerial(stem)",
      "    m2 = RegistryDesk.RX_MaxInwardSerial(stem)",
      "    If m2 > mx Then mx = m2",
      '    RX_NextAck = stem & Format$(mx + 1, "00000")',
      "End Function",
    ].join("\n"),
  );
  s = once(s, "' Highest serial under `stem` used in this workbook (Register, Own-Use, Filings Inward). Called by the" + NL + "' correspondence workbook before it issues an inward number." + NL, "' Highest serial under `stem` used on the Register and Own-Use sheets." + NL, "max serial comment");
  s = all(s, "RegLink_MaxEvalSerial", "RX_MaxRegisterSerial", 2, "rename max serial");
  for (const p of ["IsLinked", "CorrProc", "FileNameOnly", "RX_Partner", "RX_ReleasePartner", "RegLink_ReceiveInward", "RX_SyncCorrespondence", "PV", "RowPayload"]) s = removeProc(s, p);
  s = replaceProc(
    s,
    "RX_LogToCorrespondence",
    [
      "' Log a filing in this workbook's Inward Register under its acknowledgement number. Returns the status line.",
      "Private Function RX_LogInward(ByVal payload As String) As String",
      "    Dim res As String",
      "    res = RegistryDesk.RX_LogFiling(payload)",
      '    If res = "OK" Or res = "EXISTS" Then',
      '        RX_LogInward = "Logged in the Inward Register " & Format$(Now, "dd-mmm-yyyy hh:nn")',
      "    Else",
      '        RX_LogInward = "Not logged in the Inward Register: " & res',
      "    End If",
      "End Function",
    ].join("\n"),
  );
  s = once(s, "' ================================================================== payloads (key/value text passed between the workbooks)", "' ================================================================== payloads (key/value text for the Inward Register log)", "payload header");
  return s;
}

export function editModIntake(src: string): string {
  return all(src, `    EndAction${NL}    RX_ReleasePartner${NL}`, `    EndAction${NL}`, 2, "release partner");
}

export function editRegistryDesk(src: string): string {
  let s = src;
  s = once(
    s,
    `    If pre = "IN" Then mx = SharedMax(stem, mx)     ' one OGSERC/ACK series with the evaluation workbook${NL}`,
    `    If pre = "IN" Then     ' one OGSERC/ACK series with the Register and Own-Use sheets${NL}        If modRegistry.RX_MaxRegisterSerial(stem) > mx Then mx = modRegistry.RX_MaxRegisterSerial(stem)${NL}    End If${NL}`,
    "assign number",
  );
  s = once(s, `    If Len(CStr(RegSheet("IN").Cells(r, ColOf("IN", "evaltype")).Value)) > 0 Then evalNote = SendFilingToEval(r)${NL}    ReleaseEval${NL}`, "", "save inward: send to eval");
  s = once(s, `    EndWork${NL}    ReleaseEval${NL}    Say "Could not save: "`, `    EndWork${NL}    Say "Could not save: "`, "save inward: release on fail");
  s = once(
    s,
    "' ------------------------------------------------------------------ link to the Registration and Evaluation workbook" +
      NL +
      "' One shared OGSERC/ACK series: before issuing an inward number the Registry also checks the evaluation workbook" +
      NL +
      "' (when it is open, or in the combined workbook), and registration filings acknowledged here are sent to its" +
      NL +
      "' Filings Inward log. Filings acknowledged in the evaluation workbook arrive through RegLink_LogFiling." +
      NL +
      `Private mEval As Workbook${NL}Private mEvalOpenedHere As Boolean${NL}Private mEvalErr As String${NL}`,
    "' ------------------------------------------------------------------ helpers shared with the Register and Own-Use sheets" + NL,
    "link header",
  );
  s = once(s, `    If Not IsCombinedBook() Then ws.Cells(r, ColOf("IN", "evalsync")).Value = "From the evaluation workbook " & Format$(Now, "dd-mmm-yyyy hh:nn")${NL}`, "", "log filing: eval sync");
  for (const p of ["IsCombinedBook", "EvalFileSetting", "EvalProc", "EvalBook", "ReleaseEval", "SharedMax", "LinkEnc", "LinkKV", "InwardPayload", "SendFilingToEval", "RegLink_PushPending", "SendFilingsToEval", "GoEvalBook"]) {
    s = removeProc(s, p);
  }
  s = once(s, "' Highest serial already used under `stem` in the Inward Register (called by the evaluation workbook).", "' Highest serial already used under `stem` in the Inward Register.", "inward max comment");
  s = all(s, "RegLink_MaxInwardSerial", "RX_MaxInwardSerial", 2, "rename inward max");
  s = once(
    s,
    "' Called by the evaluation workbook: log a filing it acknowledged, under the number it issued.",
    "' Log a registration filing (Registry Intake, or saved directly on the Register / Own-Use) under its ACK number.",
    "log filing comment",
  );
  s = all(s, "RegLink_LogFiling", "RX_LogFiling", 7, "rename log filing");
  return s;
}

/** Text that must not appear anywhere in the exported VBA ([G11]). */
export const PARTNER_PATTERNS: RegExp[] = [
  /RegLink_/,
  /RX_Partner/,
  /mPartner/,
  /RX_ReleasePartner/,
  /EvalBook\b/,
  /SharedMax/,
  /CorrProc/,
  /SendFilingToEval/,
  /SendFilingsToEval/,
  /RX_SyncCorrespondence/,
  /SYNC WITH CORRESPONDENCE/i,
  /cfgCorrBook/,
  /correspondence workbook/i,
  /evaluation workbook/i,
];

export function partnerLeftovers(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, src] of Object.entries(sources)) {
    src.split(NL).forEach((line, i) => {
      for (const re of PARTNER_PATTERNS) if (re.test(line)) out.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}
