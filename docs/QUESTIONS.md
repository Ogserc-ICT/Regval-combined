# Open questions

Phase 0 · 5 Nov 2026 · for Kamiye and the Commission. Updated 10 Nov 2026 (Phase 9: the Registry was removed; registry-only questions are closed as not applicable, Q25 to Q27 added). Updated 13 Nov 2026: Q12 answered, Q26 templates received, Q28 added and partly answered (Phase 10 built).

Each question says what the workbook does, what the app will do until it is answered (the **default**), and which phase it affects. None of them blocks Phase 1. Every default is a setting or an admin-editable list, so an answer changes data, not code, unless noted. Reply with the number and the answer, e.g. "Q1: all modes".

## Status (13 Nov 2026)

| Question | Status |
| --- | --- |
| Q1 cut-off | **Decided**: workbook rule, email and portal only |
| Q3 ACK year and days late | **Decided**: deemed receipt date for both |
| Q4 deficiency notice numbers | **Decided**: separate yearly counter |
| Q6 Effective Date change | **Decided**: flag saved submissions + one-click admin recalculation with a logged reason |
| Q7 determination clock | **Decided (6 Nov 2026)**: a deficiency notice or response does not restart the 30-day clock |
| Q11 policy settings | **B35 decided (6 Nov 2026)**: an approver may override unresolved flags with a written reason, which is logged (`flagsBlockApproval = N`). The other policy settings keep their defaults as admin settings |
| Q24 capacity per activity | **Decided (6 Nov 2026)**: one installed capacity per record, as the workbook |
| Q5, Q16, Q17, Q19 | **Not applicable**: registry removed (Phase 9) |
| Q12 signatories | **Decided (13 Nov 2026)**: Jide Onakoya is the Chairman / CEO; the Commissioner is Femi Omisanjo (Q28e), entered by an admin |
| Q26 document templates | **Received (13 Nov 2026)**: in `docs/templates/`; follow-ups in Q28 |
| Q28a email, Q28e Commissioner | **Decided (13 Nov 2026)**: `registration@ogserc.org.ng`; Femi Omisanjo |
| Q28b–d, f–h template details | **Confirmed (13 Nov 2026)**: as built |
| Q25 ACK prefix | **Decided (13 Nov 2026)**: keep `OGSERC/ACK/{year}/{n}`; the registry app is separate |
| Q27 workbook export | **Decided (13 Nov 2026)**: keep the Registry sheets as they are |
| Q8, Q9, Q10, Q11, Q15 | **Confirmed (13 Nov 2026)**: the defaults stand; Q11's settings stay admin-editable |
| Q13 holidays | **Decided (13 Nov 2026)**: an admin maintains Admin › Holidays as dates are confirmed |
| Q20 data location | **Decided (13 Nov 2026)**: London or Frankfurt is acceptable |
| Q21 old app | **Answered (13 Nov 2026)**: the old app stays live alongside this one; retirement not yet decided |
| Q18 sign-in | Mailboxes are on Microsoft 365 (13 Nov 2026); whether to add Microsoft sign-in is open |
| Q2, Q22, Q23 | Q2: enter the gazetted date when known. Q22: staff entered by an admin. Q23: default in use; open |

Also decided, not from this list: the late charge follows the Order, not the workbook (gap G14 in `COMBINED_BUILD.md`; `SPEC.md` §8.2).

## Workbook contradictions (Kamiye)

**Q1. Does the 17:00 cut-off apply to every item, or only to email and portal filings?** (applies to submissions and own-use notifications since Phase 9)
The Inward Register formula moves only **Email** and **Online portal** items received at or after 17:00 to the next working day; hand-delivered, courier and post items keep their date unless it is a weekend or holiday. The slip text agrees ("Where you file electronically after 5:00 p.m."). The build brief's acceptance checks (17:30 Friday → Monday; 18:00 Thursday 24 Dec → Tuesday 29 Dec) and G13 do not mention the mode.
**Decided (6 Nov 2026):** keep the workbook rule: the cut-off applies to email and portal filings only; hand deliveries keep their actual date. Both acceptance checks are email items, and a third check covers a hand delivery at 16:00 on Friday 18 Dec 2026 (deemed that day). No setting: it is a fixed rule. Verge Power's petition is deemed received 3 Nov 2026.

**Q2. Which placeholder Effective Date should the app start with?** (Phase 1)
Settings B7 says 22 Oct 2026 (deadline 21 Dec 2026); Registry Settings B14 says 2 Nov 2026 (deadline 1 Jan 2027). Both are placeholders until the Order is gazetted.
Default: 22 Oct 2026, with the placeholder banner shown to admins. Also needed from the Commission: the gazetted date (brief).

**Q3. Which date sets the ACK year and the days late?** (Phase 2)
a) ACK year. The Registry Guide and the Inward Register use the year of the **deemed receipt date**. Registry Intake's macro uses the year of the **date received**, and Save submission uses the year of **Date Submitted**. They differ only for an item received around midnight on 31 December or on a non-working 31 December.
b) Days late. The Register counts days late from **Date Submitted** (the calendar date received). The inward flag "Filed after registration deadline?" uses the **deemed receipt date**. An email filing at 18:00 on the deadline day is on time by the Register and late by the inward flag.
**Decided (6 Nov 2026):** the deemed receipt date sets both the ACK year and the days late.

**Q4. How should deficiency notices be numbered?** (Phase 2)
The workbook builds `OGSERC/DEF/{issue year}/{ACK serial}` (plus -2, -3). ACK/2026/00005 and ACK/2027/00005, both noticed in 2027, would both get OGSERC/DEF/2027/00005.
**Decided (6 Nov 2026):** a separate yearly counter (`OGSERC/DEF/2027/00001`), with the ACK printed on the notice.

**Q5. Should file references restart each year?** (Phase 3) **Not applicable: registry removed (Phase 9, 10 Nov 2026).**
The workbook numbers files per file class with no year (`OGSERC/RL/001`, `OGSERC/RL/002` …) and lets the officer overtype the reference. The brief says every series is per year.
Default: the workbook format, per class, no year, since file references are long-lived. Say if you want `OGSERC/RL/2026/001`.

**Q6. When the Effective Date changes, should saved submissions be re-priced automatically?** (Phase 2)
Acceptance check 1 says a change "moves every deadline in both modules". The workbook freezes each saved submission's deadline and Effective Date in its pricing snapshot and only flags "Saved pricing differs from current rules … an admin may recalculate".
**Decided (6 Nov 2026):** the global deadline, the own-use "filed after the deadline" flag (the inward flags until Phase 9) and every not-yet-priced record move at once; saved submissions are flagged, and admins get a one-click "Recalculate all open submissions" with a required reason, logged on each submission (skipped once a registration number exists). Acceptance check 1 in `COMBINED_BUILD.md` updated to match.

**Q7. Does a deficiency response restart the 30-day determination clock?** (Phase 2)
Mark complete sets "Date Submission Complete" only if it is blank. If a submission was marked complete, then got a deficiency notice, the response does not restart the clock; the original determination date stands and may already be past, which makes it provisional the next morning.
**Decided (6 Nov 2026):** no restart. "Date Submission Complete" is set once and the determination due date never moves because of a deficiency notice or response.

**Q8. Are the Order's periods calendar days?** (Phase 2)
The workbook counts the 60-day registration period, 30-day determination, 14-day deficiency response, 90-day licence application and 14-day show-cause in calendar days. (Registry service targets, in working days, left with the Registry.) Since Phase 9 the deficiency response and show-cause periods run from the dates the letters were actually sent.
Default: as the workbook. Confirm.
**Confirmed (13 Nov 2026):** calendar days, as the workbook.

**Q9. Who may lapse a submission, and who may issue a deficiency notice when no supervisor is assigned?** (Phase 2)
The Lapse macro has no role check at all. The deficiency macro allows anyone if no reviewing supervisor is assigned.
Default: Lapse = the assigned approving officer; deficiency notice = the assigned reviewing supervisor only (one must be assigned first).
**Confirmed (13 Nov 2026).**

**Q15. Can an operator that is Provisionally Registered file an update or annual confirmation?** (Phase 2)
The workbook only accepts updates and annual confirmations linked to a **Registered** new registration.
Default: Registered only.
**Confirmed (13 Nov 2026).**

**Q16. How many Schedule 2 documents should the inward check expect?** (Phase 3) **Not applicable: registry removed (Phase 9, 10 Nov 2026).**
The Inward Register flags "Schedule 2 documents incomplete at receipt" when fewer than **12** are attached ("12 req.; 13 multi-State"), but the per-form lists in the Lists sheet have 10 to 14 documents (REG-01H has 10, REG-01A has 14).
Default: compare with the number of documents on the form filed, when the form is known; otherwise no flag.

**Q17. How do unit officers and file holders map to people?** (Phase 3) **Not applicable: registry removed (Phase 9, 10 Nov 2026).**
In the workbook the registry types "Received by (unit officer)" and "Issued to (officer)". The brief adds a Unit officer role that sees its unit's items, confirms receipt and closes.
Default: unit officers are user accounts linked to one unit; "confirm receipt" records the logged-in unit officer. Registry officers can still record a receipt on paper by typing the name. "Issued to" on a file movement stays free text, because files go to staff who may not have accounts. Please give the unit officer for each unit that should use the app.

## Commission decisions (from the brief, restated)

**Q10. TIN format.** Not confirmed by Finance; the workbook does not check it. Default: free text, no check. **Confirmed (13 Nov 2026).**

**Q11. Undecided policy settings** (Settings rows 33–42). Defaults are the workbook's values: unpaid late charge blocks "complete" = **N**; waiver also reduces the late charge = **N**; data flags block approval outright = **N** (an approver may override with a written reason; the note says the other app has this on); late charge required to release for evaluation = **N**; unpaid reminder = none; supply/retail at 1 MW+ = **K**; wrong form = **accept and re-categorise**; other activities add their documents = **N**; own-use certificate = **N**; fee on updates and annual confirmations = **N**. **6 Nov 2026:** every one of these is an admin setting. B35 defaults to N: an approver can override unresolved flags with a written reason, which is logged. Kamiye to confirm with the Commission before Phase 2. **Confirmed (13 Nov 2026):** the defaults stand; an admin changes any of them under Admin › Settings if the Commission decides otherwise.

**Q12. Signatories.** The Commissioner's name (approval of new registrations stays blocked until an admin adds it), and confirmation that Jide Onakoya is the "Chairman / CEO" signatory. (The Secretary to the Commission was seeded from the Registry; since Phase 9 only the Chairman / CEO is seeded.)
**Decided (13 Nov 2026):** Jide Onakoya is confirmed as the Chairman / CEO signatory. The Commissioner was first to be the placeholder JOHN DOE, then named the same day: **Femi Omisanjo** (Q28e). An admin enters both under Admin › Signatories and ticks them confirmed; the names are data, not code. CERT-01 prints as a draft while either is missing or unconfirmed.

**Q13. Holidays.** Confirm the dates marked Estimated or Provisional (Eid al-Fitr, Eid al-Adha, Eid al-Mawlid, weekend substitutes) and add any Ogun State holidays. The list starts at 25 Dec 2026 and ends at 28 Dec 2027; 2028 needs adding before the end of 2027.
**Decided (13 Nov 2026):** an admin keeps Admin › Holidays up to date, confirming the estimated and provisional dates as they are announced. Edits apply to records saved afterwards; deemed receipt dates already fixed do not move.

**Q14. Which documents should the app produce?** The workbook says the acknowledgement letter, EVAL-01, deficiency notice and CERT-01 certificate are "generated in the app", but the brief's Phase 4 lists only the acknowledgement slip, Daily Register and pending actions. Default: build those three; add letter, notice, EVAL-01 and certificate templates if you send their approved wording and layout. The certificate needs the signatories (Q12). **Updated 10 Nov 2026 (Phase 9):** the slip, Daily Register and pending actions left with the Registry; the four registration documents are now the app's reports (see Q26).

**Q18. Sign-in.** Do the ogserc.org.ng mailboxes run on Microsoft 365? If so, staff could sign in with their work accounts (Microsoft Entra ID). Default: email and password accounts created by an admin, with optional two-factor codes.
**13 Nov 2026:** the mailboxes are on Microsoft 365. Adding Microsoft sign-in is open: it needs an app registration in Microsoft Entra by the tenant admin, then a small change here.

**Q19. Email.** **Not applicable: registry removed (Phase 9, 10 Nov 2026).** The unit and division acknowledgement emails are out of scope and there is no email adapter. The original question: the provider (Resend is simplest on Vercel; Microsoft Graph fits if the mailboxes are on Microsoft 365), the sending address, the CC address if any, and the missing unit and division emails: 29 of 30 units and 3 of 5 divisions (Office of the Chairman; Financial Management Services; Legal, Licensing and Consumer Affairs) have none. Until then the app warns on save and logs "Not emailed: no address".

**Q20. Data location.** Is hosting Commission data outside Nigeria acceptable under the Nigeria Data Protection Act 2023? The nearest regions Vercel and Neon offer are London or Frankfurt.
**Decided (13 Nov 2026):** yes, acceptable.

**Q21. Other apps.** Does this app replace the existing Registration & Evaluation app when it goes live, or run alongside it? **Updated 10 Nov 2026 (Phase 9):** the separate registry app keeps the Registry, so the two run side by side; the ACK overlap is Q25.
**Answered (13 Nov 2026):** the old Registration & Evaluation app stays live alongside this one; whether to retire it is not yet decided.

**Q22. People.** Names (and work emails) of the evaluating officers, reviewing supervisors, approving officers and Finance officers, and the Registration officers. **Updated 10 Nov 2026 (Phase 9):** the six seeded people were all Registry staff and are no longer seeded; the Verge Power petition is correspondence for the registry app.

**Q24. Should installed capacity be recorded per activity instead of once per record?** (Phase 2)
The workbook holds one "Installed Capacity (MW)" per submission and uses it to categorise every activity on it (`SPEC.md` §7.2). An operator with a 0.5 MW mini-grid and a separate 12 MW generation plant is categorised as if each activity were 12 MW. Recording capacity per activity would categorise each one on its own size.
**Decided (6 Nov 2026):** one figure per record, as the workbook.

**Q23. Form sections.** The detailed sections of REG-01A–K are not in the workbook; it records only "sections not complete" and "capacity stated in sections" (Guide B14). Default: the same two summary fields. Say if the Commission wants the full form sections captured in the app (a larger piece of work, best scoped after go-live).

## Phase 9: the Registry removed (10 Nov 2026)

**Q25. The ACK prefix.** This app now issues its own ACK numbers (`OGSERC/ACK/2026/00001` …). The separate registry app also issues OGSERC/ACK numbers, so the two series will overlap: the same number can mean a registration here and a letter there.
Default: `OGSERC/ACK`, as an admin setting (Admin › Settings › Receipt and letters). Changing it affects new numbers only; the serial keeps counting. Say which app should change its prefix, and to what (for example `OGSERC/REG-ACK` here).
**Decided (13 Nov 2026):** keep `OGSERC/ACK/{year}/{n}` in this app. The registry app is a separate system.

**Q26. The registration documents.** The app must produce the para 10(3) acknowledgement letter, the deficiency notice, the EVAL-01 report and the CERT-01 certificate as PDFs. Please send the Commission's templates and approved wording for each: letterhead, the exact text, which signatory signs (Q12), and any reference or file number printed on them.
Default: none built yet; the next phase builds them once the templates arrive. Until then the Register records the dates the deficiency notice, show-cause letter and certificate were sent.
**Received (13 Nov 2026):** PDF samples of all four are in `docs/templates/` (`acknowledgement-letter.pdf`, `deficiency-notice.pdf`, `EVAL-01.pdf`, `CERT-01.pdf`). Phase 10 builds from them; the names and companies in them are sample data. Details they leave open are Q28.

**Q27. The offline workbook export.** The export (`pnpm export:workbook`, Phase 7) patches the combined workbook, which still has its Registry sheets and macros. Since Phase 9 the app fills the Registry officer list with the Registration officers, leaves the router and front-desk lists empty, and leaves the Registry service targets, acknowledgement-email settings and unit emails as the workbook has them.
Default: left as it is. Decide before the export is used again whether its Registry sheets should be removed or blanked (that needs re-checking in desktop Excel).
**Decided (13 Nov 2026):** keep the Registry sheets as they are.

## Templates received (13 Nov 2026)

**Q28. Details the templates leave open.** (Phase 10)
a) **Contact email.** The templates print `registration@ogserc.gov.ng`; staff emails elsewhere are `@ogserc.org.ng`.
**Decided (13 Nov 2026):** ogserc.org.ng. The setting "Commission email on letters" (Admin › Settings › Receipt and letters) starts as `registration@ogserc.org.ng`.
b) **Who signs the acknowledgement letter?** The sample is signed by the evaluating officer. Default: the assigned evaluating officer, or the officer generating it if none is assigned.
c) **Who signs the deficiency notice?** The sample has a signature line with no name. Default: the reviewing supervisor who issued it (Q9).
d) **Certificate serial number** ("Certificate Serial No.: 0001"). Default: its own counter that never resets or repeats, issued with the registration number, separate from the REG number. Say if it should restart each year.
e) **CERT-01 while a signatory is unconfirmed.** With JOHN DOE as a placeholder Commissioner, a certificate would print a false name.
**Answered (13 Nov 2026):** the Commissioner is Femi Omisanjo, so no placeholder is needed. As built: CERT-01 still prints "DRAFT – NOT ISSUED" across it while either signatory is missing or not ticked confirmed, so leave a name unconfirmed only while it is provisional.
f) **"Scan to verify" QR code.** Default: it links to the registration's page in this app, which only signed-in staff can open, as the sample says. There is no public verification page.
g) **Seal.** Default: the printed "COMMISSION SEAL" circle is where the physical seal is stamped; no seal image is printed.
h) **Wording on the certificate:** "Established under the Ogun State Power Law, 2024" and "OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026". Default: printed as in the template. Confirm both titles.
**Confirmed (13 Nov 2026):** b, c, d, f, g and h stand as built.

