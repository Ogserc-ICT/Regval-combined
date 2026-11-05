# OGSERC Registry & Evaluation — Specification

Phase 0 · 5 Nov 2026 · derived from `docs/source/OGSERC_Registry_and_Evaluation_Combined.xlsm` (31 sheets, 7 standard modules + sheet modules of VBA) and `docs/COMBINED_BUILD.md`.

This is the rule book for both modules. Every rule cites where it comes from in the workbook (sheet!cell, table column, or `Module.Procedure`). Where the workbook is unclear or contradicts itself, the rule says **Open: Qn** and points to `docs/QUESTIONS.md`; the app implements the stated default behind a setting until the question is answered. **Decided: Qn** marks a question Kamiye has answered (6 Nov 2026). Gap fixes G1–G14 from the build brief are applied throughout and marked **[Gn]**.

**Where to check a citation.** The text extracted from the workbook is in [`docs/source/extracted/`](source/extracted/):

| Citation | File |
| --- | --- |
| Sheet!Cell (values and cell formulas) | `sheets/NN_Sheet_Name.txt`, one line per cell; `rows/NN_Sheet_Name.tsv`, one line per row |
| `tblName[Column]` (Excel table calculated columns) | `tablecols.txt` |
| `Module.Procedure` (VBA) | `vba/Module.bas` |
| Named ranges (`cfg…`, `Hols`, `IN_no` …) | `names.txt` |
| Sheet list | `index.txt` |

Contents

1. Scope, principles and terms
2. Settings (one set for both modules)
3. Number series
4. Dates, time and working days
5. Reference data
6. Registration: data model
7. Registration: category and the activity map
8. Registration: fees, late charges and the pricing snapshot
9. Registration: deadlines and clocks
10. Registration: documents per form (Schedule 2)
11. Registration: payments and the Finance gate
12. Registration: evaluation (EVAL-01)
13. Registration: workflow states and actions
14. Registration: data flags
15. Own-use notifications (REG-01I)
16. Updates and annual confirmations (para 16)
17. Registry: front desk
18. Registry: intake of registration filings
19. Registry: inward items
20. Registry: routing, forwarding and closing
21. Registry: outward items
22. Registry: files and file movements
23. Registry: pending actions
24. Outputs: acknowledgement slip, Daily Register, dashboards
25. Acknowledgement email
26. Daily review
27. Roles and separation of duties
28. Audit log
29. Workbook records: real and EXAMPLE
30. Worked examples (become automated tests)

---

## 1. Scope, principles and terms

- The app is the **system of record** for the Register and the Registry (Guide A5). It replaces every sheet listed in the brief.
- **One OGSERC/ACK series** covers every acknowledgement, whether issued by New Inward, Registry Intake or a direct Register / Own-Use entry (Guide B46–B50, Registry Guide B62). Every acknowledgement has an Inward Register entry.
- **Server-enforced.** Every rule the workbook only reminds about (logins, separation of duties, audit integrity, locked numbers; Guide A8–A12) is enforced on the server.
- **Every blocked action returns all its reasons at once**, as the workbook buttons do (`modWorkflow` header comment).
- **No workbook limits.** The workbook caps a record at 3 other activities, 3 licences and 4 generator units (Guide B15). The app stores these as child rows with no fixed limit. Category and document rules apply to every activity listed.

Terms

| Term | Meaning |
| --- | --- |
| Submission | One row of the Register: a new registration, an update (para 16(1)) or an annual confirmation (para 16(2)). |
| Filing | Any registration document received by the Registry: a submission or an own-use notification. |
| Inward item | One row of the Inward Register: any incoming item, filing or not. Its number is the ACK number. |
| Family | A new registration plus the updates and annual confirmations linked to it (`tblRegister[Family]`). |
| Lagos date | The calendar date in Africa/Lagos. |

## 2. Settings (one set for both modules)

All settings are admin-editable, audited on change (`modCommon.LogEdit` writes "Setting changed" with old → new), and validated. **[G1]** There is one Effective Date; the Registry Settings copy (Registry Settings B14) is dropped.

| Setting | Default | Source | Notes |
| --- | --- | --- | --- |
| `effectiveDate` | 22 Oct 2026 (placeholder) | Settings B7 vs Registry Settings B14 | **[G1]** One value. Admins see a banner while `effectiveDatePlaceholder = true`. Open: Q2. |
| `effectiveDatePlaceholder` | true | Settings C7 | Cleared by an admin when the gazetted date is entered. |
| `registrationPeriodDays` | 60 | Settings B8 | Para 11(1). |
| `extensionDays` | 0 | Settings B9 | Para 25. **[G1]** Applied everywhere, including the inward "filed after deadline" flag (Registry Settings B15 ignored it). |
| `newOperatorLeadDays` | 30 | Settings B11 | Para 11(2). |
| `determinationDays` | 30 | Settings B12 | Para 13(1). |
| `deficiencyResponseDays` | 14 | Settings B13 | Para 13(1)(b). |
| `licenceApplicationDays` | 90 | Settings B14 | Para 18(1). |
| `licenceExpiryWindowDays` | 183 | Settings B15 | Para 8(5). |
| `amberWarningDays` | 7 | Settings B16 | SLA traffic light. |
| `ownUseThresholdKw` | 200 | Settings B17 | Para 3(4). |
| `showCauseDays` | 14 | Settings B18 | Para 20. |
| `annualConfirmationDue` | 31 Jan (month 1, day 31) | Settings B19–B20 | Para 16(2). |
| `feesRevisedOn` | blank | Settings A21 | Informational. |
| Policy: `lateBlocksComplete` | N | Settings B33 | Open: Q11. |
| Policy: `waiverReducesLate` | N | Settings B34 | Open: Q11. |
| Policy: `flagsBlockApproval` | N | Settings B35 | Admin setting. N = an approver may override unresolved flags with a written reason, which is logged in the audit entry for the approval. Y = flags block approval outright. Decided: Q11, default N. |
| Policy: `lateRequiredForRelease` | N | Settings B36 | Open: Q11. |
| Policy: `unpaidReminderDays` | blank (no reminder) | Settings B37 | Counted in the daily review only; nothing is sent. |
| Policy: `supplyRetailCategoryAt1MW` | K | Settings B38 | Category for SUP at 1 MW or more. |
| Policy: `wrongFormHandling` | Accept and re-categorise | Settings B39 | Or "Require the correct form". |
| Policy: `otherActivityDocs` | N | Settings B40 | Other activities add their form's documents. |
| Policy: `ownUseCertificate` | N | Settings B41 | Own-use notifications can be registered with a certificate. |
| Policy: `feeOnUpdates` | N | Settings B42 | Registration fee charged on updates and annual confirmations. |
| `officeClosingTime` | 17:00 | Registry Settings B7 | Para 10(3). |
| `forwardingTargetDays` | 2 working days | Registry Settings B8 | |
| `dispatchTargetDays` | 2 working days | Registry Settings B9 | |
| `podChaseDays` | 5 working days | Registry Settings B10 | Chase proof of delivery. |
| `urgentResponseDays` | 1 working day | Registry Settings B11 | |
| `defaultResponseDays` | 10 working days | Registry Settings B12 | When a type has no target. |
| `fileReturnDays` | 3 working days | Registry Settings B13 | |
| `ackEmailMode` | Preview | Registry Settings B18 ("Display") | Send / Preview / Off. **[G9]** |
| `ackEmailCc` | blank | Registry Settings B17 | |
| `registryAddress` | "Registry · 5th & 6th Floors, OPIC Building, Oke-Ilewo, Abeokuta" | Acknowledgement Slip B4 | Printed on slips. |
| `seedExamples` | false in production | **[G4]** | Only development and preview may seed. |

Number prefixes (Settings B24–B28, Registry Settings B5–B6) are fixed constants in code, not settings, so a number's format can never change after issue.

Signatories are not settings; see §5.6 **[G3]**. Staff names are not settings or lists; they are user accounts **[G2, G6]**.

`APP_TODAY` (Settings B45 "Today override") is an environment variable honoured only when `VERCEL_ENV !== 'production'` and `NODE_ENV !== 'production'` **[G13]**.

## 3. Number series

**[G11, G12]** Every number is issued by one numbering service from a `counters` table, inside the same database transaction that saves the record, with a row lock on the counter. A number is never reused, even if the record is later cancelled, refused or lapsed, and never changes once issued (the workbook's "Issued No. / paste value to lock" column and the LOCK ALL NUMBERS button become unnecessary).

| Series | Format | Serial | Resets | Year taken from | Source |
| --- | --- | --- | --- | --- | --- |
| Acknowledgement | `OGSERC/ACK/2026/00001` | 5 digits | Yearly | Deemed receipt date (Decided: Q3) | Registry Guide B35; Inward Register B (`AZ = YEAR(G)`). Overrides `modRegistry.RX_SaveIntakeCore` (date received) and `modIntake.SaveSubmissionAt` (Date Submitted) |
| Front desk intake | `OGSERC/FD/2026/00001` | 5 digits | Yearly | Date received | Front Desk Log B, S |
| Outward | `OGSERC/OUT/2026/00001` | 5 digits | Yearly | Date of document | Outward Register B, AI |
| Payment | `OGSERC/PAY/2026/00001` | 5 digits | Yearly | Date received | `modPayments.RecordPaymentAt` |
| Own-use notification | `OGSERC/OUN/2026/0001` | 4 digits | Yearly | Date filed | `modIntake.SaveOwnUseAt` |
| Registration | `OGSERC/REG/2026/D-GEN/0001` | 4 digits | Yearly | Approval date | `modWorkflow.ApproveFor`; `modIntake.NextRegistrationSerial` |
| Own-use registration | `OGSERC/REG/2026/I-CPT/0001` | 4 digits | Shares the REG serial | Approval date | `modIntake.RegisterOwnUseFor` |
| Deficiency notice | `OGSERC/DEF/2027/00001` | 5 digits | Yearly | Issue date | Own counter (Q4); replaces `modWorkflow.IssueDeficiencyFor` |
| File reference | `OGSERC/REG/001` | 3 digits | Never (per file class) | n/a | `RegistryDesk.NextFileRef` (Open: Q5) |

- **REG serial** is one sequence per year across all categories and own-use, in issue order (`NextRegistrationSerial` takes the max over both tables). The middle part is `{Category Applied}-{Primary Code}`.
- **Provisional registration** issues no number: the ACK number serves as the registration number while provisional (`tblRegister[Registration No. in Use]`; daily review audit text).
- **Deficiency notice.** The workbook builds `OGSERC/DEF/{issue year}/{ACK serial}` plus `-2`, `-3` for later notices on the same submission. That can collide: ACK/2026/00005 and ACK/2027/00005 both noticed in 2027 give the same DEF number. The app uses its own yearly counter, `OGSERC/DEF/2027/00001` (5 digits, year of issue), and prints the ACK on the notice. Decided: Q4.
- **File references** are generated per file class code (`OGSERC/{code}/{nnn}`) and can be overtyped by the officer (File Desk C18). A typed reference must be unique in the File Index. The brief says every series is per year; the workbook's file series is not. Open: Q5.
- **Registry Intake on a pulled item** keeps the existing ACK number and issues no new one (`modRegistry.RX_PullAck`).

## 4. Dates, time and working days

**[G13]** Every "today", timestamp-to-date conversion, deadline and working-day calculation runs on the server in **Africa/Lagos** (UTC+1, no daylight saving). Timestamps are stored as UTC `timestamptz`; calendar dates as `date`.

- **Working day**: Monday–Friday and not in the holiday table.
- **Holidays** (Registry Settings A21:D36 and A81) are admin-editable rows: date, name, status (Fixed / Provisional / Estimated / State-declared). Every holiday counts as non-working whatever its status; the status is shown so staff know which to confirm (Registry Guide B39). Seeded with the 16 rows in the workbook (25 Dec 2026 to 28 Dec 2027). Open: Q13.
- **Add working days** = Excel `WORKDAY(start, n, Hols)`: the nth working day after `start`.
- **Working days elapsed** = `NETWORKDAYS(a, b, Hols) − 1`, floored at 0.
- **Calendar days** are used for every Order clock in the Register (para 11, 13, 18, 20): fees, late days, determination, deficiency response, licence application, show-cause (all `+ cfg…Days` on dates in `tblRegister`). Working days are used for every Registry service target. Open: Q8.

### 4.1 Deemed receipt (para 10(3))

Inward Register G (formula, row 9):

```
if received date is Sat/Sun or a holiday            → next working day
else if mode ∈ {Email, Online portal}
        and received time ≥ officeClosingTime       → next working day
else                                                → received date
```

The cut-off applies only to **Email** and **Online portal** items. Hand delivery, courier, registered post, internal mail and publication keep their actual date unless it is a weekend or holiday. The slip text says the same ("Where you file electronically after 5:00 p.m. or on a non-working day", Acknowledgement Slip B22). Decided: Q1 (workbook rule kept). The two deemed-receipt acceptance checks use email items, and a hand delivery at 16:00 on Friday 18 Dec 2026 stays on that day (§30.4).

The deemed receipt date is the filing's legal date of receipt. It sets the ACK year (§3) and the days late (§8.2) (Decided: Q3).

## 5. Reference data

All admin-editable. Seeded from the workbook. Rows are deactivated, not deleted, once used.

### 5.1 Registration lists (Lists sheet)

- **Fee table** (`tblFees`, Schedule 3): category A–K, registration fee, late initial, late daily, late cap, description. "Late Tier" (column F) is not used by any formula or macro and is kept only as information. Values in §8.
- **Activities** (`tblActivities`): name, code, category for 10 MW+, 1–10 MW, below 1 MW, capacity-based Y/N. Values in §7.
- **Forms** (`tblForms`): REG-01A–K → category, title, Order paragraph.
- **Form documents** (`tblFormDocs`, 124 rows): form, number, key, document text, "required when" condition. Listed in §10.
- **Document conditions** (`tblConditions`): 9 keys with their question.
- **Evaluation checks** (`tblChecks`): 56 decision checks and 7 post-approval checks. Listed in §12.
- **Drop-downs**: filing types (3), statuses (9), LGAs (20 Ogun LGAs), registrant types (7), licence statuses (6), submission channels (3), payment channels (4), payment purposes (3), fuels (7), final decisions (7), refusal grounds (3), Finance statuses (3), wrong-form handling (2), months.
- **Staff lists** (Lists BK–BO) are **not** carried over **[G2]**: BK6 = 69, BM6 = 82, BO6 = 65 are the character codes of E, R and A. Officers come from user accounts with the matching role.

### 5.2 Registry lists (Registry Lists sheet)

- **Incoming correspondence types** (A4:J35, 32 types): name, category, default unit, Order reference, response target (working days; 0 = none), para 10(3) slip wording Y/N, and the registration filing type it maps to (4 of them: REG-01 Registration (new) → New registration; OUN-01 → Own-use notification; Update - material change; Annual confirmation).
- **Outgoing document types** (H4:J29, 26 types): name, response expected Y/N, response window (working days).
- **Units** (AJ:AM, 30 units): name, division, unit group, email. **Divisions** (AO:AP, 5): name, email. **[G9]** Only one unit email (ICT unit: it@ogserc.org.ng) and two division emails (Engineering Services: engineeringstandards@ogserc.org.ng; Electricity Market, Planning and Research: empr@ogserc.org.ng) are filled.
- **Modes of receipt** (L, 7) with the Register channel each maps to (Lists BU:BV): Email → Email, Online portal → Online portal, everything else → By hand.
- **Sender / recipient categories** (Q, 18), **actions required** (R, 4: Reply required, Action required, For information, File only), **priorities** (S, 4: Urgent, High, Normal, Low; blank = Normal), **acknowledgement issued via** (O, 5: Printed slip, Email, Portal, Not yet issued, Not required), **file classes** (T, 12, with code in W: REG, RL, TM, TS, CA, LEG, FIN, ADM, PF, GOV, POL, GEN), **security** (U: Open, Restricted, Confidential), **file status** (V: Open, Closed, Archived), **LGAs** (N, 20 + "Outside Ogun State").
- **Staff lists** (registry staff Z, Secretary AA, routing officers AF:AI, front desk AR) become users with roles **[G2, G6, G7]**; see §27.

### 5.3 Signatories **[G3]**

One table: name, designation, signatory role (Chairman / CEO, Commissioner, Secretary to the Commission, Other), active, confirmed-by-admin flag. Used for CERT-01 certificates and outgoing letters.

- Seed: Jide Onakoya, Chairman, role Chairman / CEO, **unconfirmed** (from Registry Lists AC4; flag for Kamiye). Oluwatoyin Sonoiki, Secretary to the Commission, role Secretary, unconfirmed (Registry Lists AC5).
- Commissioner: no row. Never invent a name.
- Approval of a new registration and own-use registration is blocked while there is no active Chairman / CEO **or** no active Commissioner, with the message "Certificate signatory not set: Commissioner. An admin must add it under Admin › Signatories." (`tblEvaluation[Approval Blockers]`; `tblOwnUse[Registration Blockers]`). Open: Q12.
- The Secretary signatory is printed on slips and the Daily Register (Acknowledgement Slip B27, Daily Register A142) and is the default signer of outgoing letters (Registry Desk B5).

## 6. Registration: data model

One **submission** per Register row (`tblRegister`, 165 columns). Inputs (blue), button-set fields (gold) and calculated fields (green) map to the app as follows. Calculated fields are pure functions of the stored record, its payments, its checklist, settings and the reference data. They are computed on the server, never stored as editable values.

**Inputs**: filing type, form filed, linked registration no., registered name, trading name, date submitted, submission channel, registrant type, CAC no., TIN, registered address, principal LGA, other LGAs served, towns / estates served, primary activity, other activities (0..n), installed capacity (MW), customers, licence status, licences (0..n: number, expiry), compliance officer, phone, email, operating on Effective Date (Y/N), planned start date, approved waiver, category override + reason, the 9 document conditions (blank = applies), form sections not complete (text), capacity stated in sections (MW), show-cause date, remarks.

**Set by actions**: ACK number, confirmed category + reason, status, released-for-evaluation date, date submission complete, deficiency notice date, certificate issue date, registration number, certificate needs reissue, created by, pricing snapshot (priced category, fee, late initial, late daily, late cap, deadline, Effective Date), front desk intake no.

**Validation at save** (`modIntake.SaveSubmissionAt`): every failure is listed at once.

- Registered name required. Date submitted required and not in the future (Lagos).
- Filing type from the list. Form filed REG-01A–K; REG-01I is refused ("record it as an own-use notification").
- Principal LGA, primary activity, licence status from the lists; other activities from the list.
- Operating on Effective Date Y or N; N requires a planned start date.
- CAC: `RC`, `BN` or `IT`, optional single space, then digits (`modCommon.ValidCac`).
- **[G5]** Phone: after removing spaces and dashes, `0` + 10 digits (11 digits) or `+234` + 10 digits (`modCommon.ValidPhone`). Stored as entered-normalised text, never as a number. Message: "Phone must be 11 digits starting with 0 (e.g. 08021846578), or +234 and 10 digits."
- Email: one `@`, no spaces, a dot after the `@` with text either side (`ValidEmail`).
- Waiver ≥ 0 and ≤ the registration fee.
- A category override that differs from the calculated category needs a reason.
- Updates and annual confirmations must quote a registration number that belongs to a **Registered new registration** (Open: Q15).
- **Warning, confirmable:** the CAC number is already on a submission of another family ("One registration per person (para 11(4)). Save anyway?").
- TIN format is not checked (Guide B15; Open: Q10).

**On save**: issue the ACK (or use the one already issued by Registry Intake), freeze the pricing snapshot (§8.3), set status "Acknowledged - Awaiting Payment", record Created By, create the evaluation record and the document checklist, write audit entries ("New submission"; for linked filings also "Filing received" on the parent), add the Inward Register entry if the ACK is new (§18.3), then try the Finance gate (§11.3), which releases at once when nothing is payable.

## 7. Registration: category and the activity map

### 7.1 Activity map (`tblActivities`)

| Activity | Code | ≥ 10 MW | 1 to < 10 MW | < 1 MW | Capacity-based |
| --- | --- | --- | --- | --- | --- |
| Successor distribution company (incl. multi-State) | SDC | A | A | A | N |
| Integrated generation and distribution (integrated utility) | INT | B | B | B | N |
| Generation for sale (on-grid / off-grid / embedded) | GEN | C | D | K | Y |
| Captive generation (1 MW or more) | CPT | C | D | D | Y |
| Distribution – other licensee | DIS | F | F | F | N |
| Multi-State licensee – non-successor (Ogun operations) | MSL | F | F | F | N |
| Independent electricity distribution network | IDN | F | F | F | N |
| Trading / bulk supply | TRD | F | F | F | N |
| Supply / retail | SUP | K | K | K | N |
| Mini-grid / interconnected mini-grid | MGD | E | E | E | Y |
| Private / estate / industrial-park network | EST | G | G | G | N |
| Franchise / sub-franchise | FRN | J | J | J | N |
| Metering services | MET | H | H | H | N |
| Other activity | OTH | C | D | K | Y |

### 7.2 Category of one activity (`Cat Primary`, `Cat Other n`)

Capacity `c` = the submission's installed capacity in MW (blank = 0). One capacity applies to every activity on the submission, as in the workbook (Decided: Q24).

```
if activity not in the map            → none
if code = SUP and c ≥ 1               → supplyRetailCategoryAt1MW (default K)
if c ≥ 10                             → column "≥ 10 MW"
if c ≥ 1                              → column "1 to < 10 MW"
else                                  → column "< 1 MW"
```

### 7.3 Calculated category (`Category Auto`)

Over the categories of the primary and every other activity:

1. No primary category → none.
2. Any A → **A**. Else any B → **B**.
3. Else the category with the **highest registration fee**; on a tie, the first in the order primary, other 1, other 2, … (`XMATCH(MAX(f), f)` returns the first match).

### 7.4 Current, applied and confirmed category

- **Current category** = override if set, else calculated; blank if not in the fee table.
- **Category applied** (what is charged) = priced category from the snapshot if saved, else current.
- **Form category** = the category of the form filed.
- **Confirmed category** is set by Confirm category (§13.4). It changes the documents form (§10.2) but not the charge. If it differs from the category applied, flag CONFIRMED_CATEGORY_NOT_CHARGED until the inputs are corrected and an admin recalculates pricing.

## 8. Registration: fees, late charges and the pricing snapshot

### 8.1 Schedule 3 fee table (₦)

| Cat | Registration fee | Late initial | Late daily | Late cap | Description |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 1,000,000 | 1,000,000 | 200,000 | 20,000,000 | Successor distribution companies, incl. a multi-State licensee that is an SDC |
| B | 1,000,000 | 1,000,000 | 200,000 | 20,000,000 | Integrated utilities |
| C | 500,000 | 1,000,000 | 200,000 | 20,000,000 | Generation of 10 MW or more |
| D | 300,000 | 500,000 | 100,000 | 10,000,000 | Generation of 1 MW to < 10 MW |
| E | 250,000 | 500,000 | 100,000 | 10,000,000 | Mini-grids and interconnected mini-grids |
| F | 500,000 | 1,000,000 | 200,000 | 20,000,000 | Other distribution licensees; trading and bulk supply |
| G | 500,000 | 1,000,000 | 200,000 | 20,000,000 | Private, estate and industrial-park networks |
| H | 250,000 | 500,000 | 100,000 | 10,000,000 | Metering service providers |
| I | 100,000 | 0 | 0 | 0 | Own-use notification, para 3(4) (200 kW to < 1 MW) |
| J | 250,000 | 500,000 | 100,000 | 10,000,000 | Franchisees and sub-franchisees |
| K | 100,000 | 100,000 | 10,000 | 2,000,000 | Any other activity below 1 MW |

Money is held as whole kobo (integers) and shown as ₦ with thousands separators and kobo only when non-zero (`modCommon.Naira`).

### 8.2 Formulas (`tblRegister`)

- **Current fee** = fee of current category if filing type is New registration, or if `feeOnUpdates = Y`; else 0.
- **Current late initial / daily / cap** = from the table for a New registration; 0 for updates and annual confirmations.
- **Registration deadline** (snapshot if saved, else current; §9.1).
- **Days late** = `max(0, deemed receipt date − registration deadline)` in calendar days; 0 if either is blank. The deemed receipt date is that of the submission's inward item (§4.1). The workbook used Date Submitted, the calendar date received; the app uses the deemed date (Decided: Q3).
- **Late charge** = 0 if days late ≤ 0, else `min(late initial + late daily × days late, late cap)`. **[G14]** The Order caps the whole late charge. **The Order overrides the workbook here.** The workbook's `tblRegister[Late Charge]` computes `late initial + MIN(late daily × days late, late cap)`, which caps only the daily part and can exceed the cap by the initial charge (category D, 100 days late: workbook ₦10,500,000, Order ₦10,000,000).
- **Net fee** = `max(0, registration fee − approved waiver)`.
- **Total due** = if `waiverReducesLate = Y`: `max(0, fee + late − waiver)`; else `net fee + late`.
- **Amount paid** = sum of payments that count (§11.1).
- **Balance** = `round(total due − amount paid, 2)`; negative = credit.
- **Payment status**: Nil (total due 0) / Paid (balance ≤ 0) / Part-paid (paid > 0) / Unpaid.

### 8.3 Pricing snapshot (`modIntake.Snapshot`)

On save, freeze: priced category (= current), fee, late initial, late daily, late cap, deadline, and the Effective Date used. From then on the record uses the snapshot, not the live fee table or settings. If the current inputs or rules would now give a different result, flag PRICING_OUT_OF_DATE with each difference (category, fee, late initial, late daily, late cap, deadline, Effective Date).

**Recalculate pricing** (admin only, reason required; `RecalculatePricingFor`): refused once a registration number exists; re-takes the snapshot; audits before → after; then tries the Finance gate.

**Changing the Effective Date** (Decided: Q6) moves at once: the global registration deadline, the inward "filed after deadline" flag, the dashboard key dates, and every record not yet priced (Register drafts, unsaved forms). Saved submissions keep their frozen deadline and show PRICING_OUT_OF_DATE. The settings page then offers admins **"Recalculate all open submissions"**: one reason, required, applied to every open submission without a registration number. Each recalculated submission gets its own "Pricing recalculated" audit entry carrying that reason and its before → after values. Submissions with a registration number are listed as skipped.

## 9. Registration: deadlines and clocks

All in calendar days from Lagos dates.

| Clock | Rule | Source |
| --- | --- | --- |
| Registration deadline, operating on Effective Date | `effectiveDate + registrationPeriodDays + extensionDays` | Settings B10; `Current Deadline` |
| Registration deadline, new operator | `planned start date − newOperatorLeadDays` | `Current Deadline` |
| Registration deadline, update / annual | none | `Current Deadline` |
| Determination due | `date submission complete + determinationDays` | `Determination Due` |
| Deficiency response due | `deficiency notice date + deficiencyResponseDays` | `Deficiency Response Due` |
| Licence application due (Unlicensed only) | `Effective Date used + licenceApplicationDays` | `Licence Application Due` |
| Nearest licence expiry | earliest licence expiry | `Nearest Licence Expiry` |
| Days in queue (open only) | `today − date submitted` | `Days in Queue` |
| Show-cause period | refusal allowed when `today − show-cause date ≥ showCauseDays` | `RefuseFor` |
| Annual confirmation due | each year on `annualConfirmationDue` | §16 |

**SLA traffic light** (`SLA`): blank when closed, Provisionally Registered or Acknowledged - Awaiting Payment. **Red** if today > determination due, or (Deficiency Notice Issued and today > deficiency response due). **Amber** if determination due is set and `determination due − today ≤ amberWarningDays`, or determination due is not set and days in queue > determinationDays. Else **Green**.

**Process stage** (`Stage`): 1 Acknowledged – awaiting payment; 2 Payment with Finance; 3 Payment confirmed; 4 Evaluation and determination; 5 Closed – {status}.

**Next action** (`Next Action`) text is produced per status exactly as the workbook formula does (e.g. "Await payment of ₦300,000, then Finance confirmation", "Obtain 2 outstanding document(s) and collect ₦50,000 – or issue a deficiency notice", "Determine by 21 December 2026", "Overdue – provisional registration applies (para 13(4))", "Response overdue – lapse the submission (para 13(2))").

## 10. Registration: documents per form (Schedule 2)

### 10.1 Lists

Each form has its own checklist (`tblFormDocs`). "Applies unless" = the document becomes N/A automatically when that condition is N on the submission.

| Form | Docs | Documents (key: applies unless condition is N) |
| --- | ---: | --- |
| REG-01A | 14 | incorporation; constitution; licences (holds_any_licence); single_line_diagram (Ogun network); asset_register (substations); bulk_supply_agreements; tariff_order (band classification); customer_enumeration; largest_customers (20 largest); env_safety_permits; financials; multistate_ringfencing (multi_state_licensee); board_resolution; payment_evidence |
| REG-01B | 13 | incorporation; constitution; licences (holds_any_licence); single_line_diagram (plant and network); asset_register (plant and substations); fuel_supply_agreements; supply_ppa_agreements; tariff_order; customer_enumeration; env_permits_eia; financials; board_resolution; payment_evidence |
| REG-01C | 12 | incorporation; constitution; licences (holds_any_licence); single_line_diagram (plant and connection); asset_register (each plant); connection_agreement; ppa_offtake (generation_for_sale); fuel_supply_agreements; env_permits_eia; financials; board_resolution; payment_evidence |
| REG-01D | 12 | incorporation; constitution; licences (holds_any_licence); single_line_diagram; asset_register; connection_agreement (grid_connected); ppa_offtake (generation_for_sale); fuel_supply_agreements; env_permits; financials; board_resolution; payment_evidence |
| REG-01E | 13 | incorporation (or community/cooperative registration); constitution; licences by site (holds_any_licence); single_line_diagram per site; asset_register per site; community_consent; interconnection_agreement (interconnected_minigrid); tariff_order; customer_list; env_safety_permits; financials (para 12(2)); board_resolution; payment_evidence |
| REG-01F | 14 | incorporation; constitution; licences (holds_any_licence); single_line_diagram (f_distribution); asset_register (f_distribution); supply_ppa_agreements; wheeling_agreements (f_trading); tariff_order; customer_enumeration (f_distribution); credit_support (f_trading); env_safety_permits (f_distribution); financials; board_resolution; payment_evidence |
| REG-01G | 12 | incorporation; constitution; licences (holds_any_licence); developer_agreement; bulk_supply_agreements (g_disco_bulk_supply); single_line_diagram; asset_register (transformers); tariff_order; customer_enumeration; financials (para 12(2)); board_resolution; payment_evidence |
| REG-01H | 10 | incorporation; constitution; licences (holds_any_licence); nemsa_accreditation; type_test_certificates; client_contracts; installers_list; financials (para 12(2)); board_resolution; payment_evidence |
| REG-01I | 3 | incorporation (or business registration); nameplate_photos; payment_evidence (notification fee) |
| REG-01J | 11 | incorporation; constitution; licences (holds_any_licence); franchise_agreement; franchisor_consent (sub_franchise); territory_map; asset_register (transformers); customer_enumeration; financials (para 12(2)); board_resolution; payment_evidence |
| REG-01K | 10 | incorporation; constitution; licences (holds_any_licence); single_line_diagram or layout; asset_register; supply_sale_agreements; tariff_order; financials (para 12(2)); board_resolution; payment_evidence |

The full document wording is seeded verbatim from `tblFormDocs`.

**Conditions** (`tblConditions`): holds_any_licence (= Y unless licence status is Unlicensed; calculated), multi_state_licensee, generation_for_sale, grid_connected, interconnected_minigrid, f_distribution (Form F Part 1), f_trading (Form F Part 2), g_disco_bulk_supply, sub_franchise. Blank = applies.

### 10.2 Which list a submission uses (`Documents Form`)

1. If a category is confirmed and `wrongFormHandling = Accept and re-categorise` → the form of the confirmed category.
2. Else the form filed, if it is REG-01A–K.
3. Else the form of the priced category.

If `otherActivityDocs = Y`, the documents of the form of each other activity's category are added too (except category I). Shared keys appear once; the documents form's own entries come first, payment evidence last.

### 10.3 Values

Each document is **Y**, **N**, **N/A** or blank (pending), entered by staff. Automatic values override entry:

- **payment_evidence** = N/A if net fee is 0; Y once confirmed payments ≥ net fee; else blank.
- A document whose condition is N = **N/A**.

Counts: listed, outstanding (N), pending (blank), received (Y). **Documents complete** = listed > 0 and none outstanding or pending.

**Submission complete** = documents complete **and** amount paid ≥ (total due if `lateBlocksComplete = Y`, else net fee).

The checklist is refreshed (rows added, never removed) on save, on Confirm category and on demand (`RefreshDocuments`). A document entered earlier that is no longer on the current list is shown as "(not on the current list)" and does not count.

## 11. Registration: payments and the Finance gate

### 11.1 Ledger (`tblPayments`, `modPayments`)

Fields: payment no., date received, reference (an ACK of a submission or an OUN), purpose, channel, amount, RRR / bank reference, recorded by/on, Finance status (Pending / Confirmed / Rejected), verified with bank, decided by/on, Finance remarks, reversed (Y), reversed by/on, reversal reason.

- **Counts as paid** = Confirmed and not reversed. **With Finance** = has a number, Pending, not reversed. Days waiting = today − recorded date.
- Payments are never deleted or edited after recording; they are reversed.

### 11.2 Actions

| Action | Who | Rules |
| --- | --- | --- |
| Record | Registry officer, Finance officer | Date received required, not future. Reference must be an existing ACK (submission) or OUN. Amount > 0. Duplicate RRR / bank reference is a confirmable warning. Issues PAY number; status Pending. |
| Confirm | Finance officer | Must be Pending and not reversed. **[G8]** Refused (403) if the user recorded it. Requires the officer to tick "verified against the bank / Remita". Optional remarks. Final. Then try the gate. |
| Reject | Finance officer | Pending and not reversed; reason required. **[G8]** A Finance officer cannot reject a payment they recorded. Final. |
| Reverse | Finance officer, Admin | Not already reversed; not Rejected; reason required. Final. A released submission stays released, but its gate shows closed again. |

### 11.3 The gate (`TryRelease`, `GateOk`)

- **Release requires** = total due if `lateRequiredForRelease = Y`, else net fee.
- **Gate cleared** = confirmed amount paid ≥ release requires.
- **Release**: when status is Acknowledged - Awaiting Payment and the gate is cleared → status Received - Under Review, set Released for Evaluation = today, set the evaluation's start date if an evaluating officer is assigned and it is blank, audit "Released for evaluation". Runs on save, after every confirmation, after recalculation and in the daily review.
- **Evaluation actions** (Confirm category, Mark complete, Deficiency notice, Approve) on an open submission whose gate is not cleared are blocked with the gate reason ("Payment not yet confirmed by Finance: ₦0 of ₦300,000 confirmed; ₦300,000 recorded and waiting for Finance"), and the blocked attempt is audited ("Blocked - awaiting Finance confirmation").

## 12. Registration: evaluation (EVAL-01)

One evaluation per submission (`tblEvaluation`): evaluating officer, reviewing supervisor, approving officer (user accounts with those roles **[G2]**), date evaluation started, flag override reason, final decision, reasons, review date, approval date, remarks, and an answer per check.

### 12.1 Checks

Applicability codes: AUTO = calculated; MS = only for a multi-State licensee (code MSL or licence "NERC licence (multi-State)"); LIC = only when not Unlicensed; UNLIC = only when Unlicensed; DOCS = only when documents are not complete; NONCO = only when registrant type is set and not Company; WAIVER = only when a waiver > 0; NEW = only for new registrations. A check that does not apply is N/A automatically (grey).

| ID | Check | Rule |
| --- | --- | --- |
| 1.1 | ACK issued and submission in the Register | AUTO: Y when an ACK exists |
| 1.2 | Correct form used | Manual |
| 1.3 | Activity in para 3(1) | AUTO: N if primary activity not in the map |
| 1.4 | Not excluded under para 3(3) | AUTO: N if CPT and capacity < 1 MW |
| 1.5 | No existing registration with the same CAC | AUTO: N if DUPLICATE_CAC |
| 1.6 | One registration covers all activities and locations | Manual |
| 1.7 | Multi-State: limited to Ogun operations | Manual · MS |
| 1.8 | Submitted on time | AUTO: Y if days late = 0 else N |
| 1.9 | If late: days and late charge calculated | AUTO: N/A if not late; Y if late charge > 0; else N |
| 1.10 | Form matches confirmed category | AUTO: N if no form category; pending until a category is confirmed; Y if equal, or if accepted-and-re-categorised with a reason; else N |
| 2.1–2.15 | Schedule 1 sections A–O (identity, ownership, contact, licences, activities, service area, generation assets, network assets, customers, energy, tariffs, contracts, HSE, confidentiality, declaration) | Manual; 2.4 · LIC |
| 3.0 | All Schedule 2 documents received or N/A | AUTO: documents complete |
| 3.1 | Outstanding documents listed with reasons and completion date (12(4)) | Manual · DOCS |
| 3.2 | Non-corporate: equivalent documents (12(3)) | Manual · NONCO |
| 4.1 | CAC details verified | Manual |
| 4.2 | Licence numbers confirmed with OGSERC/NERC | Manual · LIC |
| 4.3 | Licence not expiring within 6 months of Effective Date (8(5)) | AUTO: N/A if no expiry; N if nearest expiry − Effective Date used ≤ window; else Y |
| 4.4–4.8 | Capacity vs SLD; GPS in Ogun; customer numbers; energy balance; tariffs (8(2)) | Manual |
| 4.9 | Unlicensed: tariff not above Effective Date level (18(1)(c)) | Manual · UNLIC |
| 4.10–4.13 | Supply sources; overlap with DisCo maps (18(3)); HSE referral; site inspection (22) | Manual |
| 5.1 | Category agrees with activities and capacity (17(1)) | Manual |
| 5.2 | Payment confirmed by Finance (17(1)) | Manual |
| 5.3 | Waiver approved in writing (17(3)) | Manual · WAIVER |
| 5.4 | Late charge correct and within cap (19) | AUTO: as 1.9 |
| 5.5 | Fees and charges paid in full | AUTO: Y if balance ≤ 0 |
| 6.1–6.4 | Confidentiality claims (15(3)); confidential pending decision; NDPA 2023 (15(4)); public Register fields (15(2)) | Manual |
| 7.1 | Unlicensed: licence application due date recorded (18) | Manual · UNLIC |
| 7.2 | Overlap referred for determination (18(3)) | Manual |
| 7.3 | Multi-State: ring-fencing plan etc. (7(3)) | Manual · MS |
| 7.4 | No suspected false information (19(3), 20) | Manual |
| 7.5 | Own-use site of 1 MW+ on REG-01I redirected | AUTO: N/A on REG-01 submissions |
| 7.6 | Data flags reviewed | AUTO: Y if no flags or an override reason is given; else N |
| 9.1 | Certificate date entered and Registered | AUTO: N/A for updates; Y when Registered with a certificate date |
| 9.2 | Registration number locked | AUTO: N/A for updates; Y when the number exists |
| 9.3–9.5 | CERT-01 prepared, signed, sealed (13(5)); issued; registrant reminded (number on bills in 90 days; annual confirmation by 31 Jan) | Manual · NEW |
| 9.6–9.7 | Public Register updated (15(2)); file closed and indexed | Manual |

Counts over the 56 decision checks (1.1–7.6): satisfied (Y), failed (N), N/A, pending (blank). Progress = (Y + N + N/A) / 56. **File closed** = every post-approval check (9.1–9.7) is Y or N/A.

**Evaluation status**: Decided (final decision set) / Not assigned (no evaluating officer) / In progress (pending > 0) / Ready for decision.

### 12.2 Recommended outcome (first match)

1. 1.3 = N or 1.4 = N → "Redirect to REG-01I / outside scope"
2. Awaiting Payment and gate not cleared → "Awaiting Finance confirmation"
3. Deficiency Notice Issued and today > deficiency response due → "Treat as lapsed (13(2))"
4. No final decision and today > determination due → "Provisional registration (13(4))"
5. Failed > 0 → "Issue deficiency notice (13(1)(b))"
6. Pending > 0 → "Evaluation in progress"
7. Update or annual confirmation → "Accept filing and apply changes (para 16)"
8. Else → "Register (13(1)(a))"

### 12.3 Approval blockers (`Approval Blockers`), all listed together

- Submission is closed ({status}).
- Gate not cleared (gate reason).
- No evaluating officer / reviewing supervisor / approving officer assigned.
- Submission is not complete (documents or fees outstanding).
- n evaluation check(s) failed. n evaluation check(s) pending.
- Category or activity code cannot be determined.
- Data flags: if `flagsBlockApproval = Y`, "n unresolved data flag(s): …"; else only when no flag override reason is written. When an approver overrides flags, the approval's audit entry records the flags and the written reason (`ApproveFor`: "n data flag(s) overridden: {reason}").
- **[G8]** Separation of duties, see §27.2.
- Linked filings: not linked to a registered submission, or the linked registration is not Registered.
- New registrations: Chairman / CEO or Commissioner signatory not set **[G3]**.
- The acting user is not the assigned approving officer.

## 13. Registration: workflow states and actions

### 13.1 Statuses

| Status | Closed? | Reached by |
| --- | --- | --- |
| Acknowledged - Awaiting Payment | No | Save submission |
| Received - Under Review | No | Finance gate release; Mark complete after a deficiency |
| Deficiency Notice Issued | No | Issue deficiency notice |
| Provisionally Registered | No | Daily review, determination overdue (new registrations only) |
| Registered | Yes | Approve (new registration) |
| Changes Applied | Yes | Approve (update / annual confirmation) |
| Lapsed | Yes | Lapse |
| Refused | Yes | Refuse |
| Cancelled | Yes | Cancel |

A draft state "Register entry started" exists before save for rows created by Registry Intake (§18); it has an ACK but no status in the Register.

### 13.2 Transitions

```
Draft ──save──► Awaiting Payment ──gate──► Under Review ──approve──► Registered | Changes Applied
                                              │  ▲
                                   deficiency │  │ mark complete (response received)
                                              ▼  │
                                         Deficiency Notice Issued ──lapse (after due)──► Lapsed
Under Review ──daily review (determination overdue, NEW only)──► Provisionally Registered ──approve──► Registered
Any open ──refuse (after show-cause period)──► Refused
Any open (also Registered) ──cancel (admin)──► Cancelled
```

### 13.3 Actions

Each action lists every blocking reason at once and writes an audit entry.

| Action | Who | Preconditions | Effect | Source |
| --- | --- | --- | --- | --- |
| **Save submission** | Registry officer | §6 validation | §6 "On save" | `SaveSubmissionAt` |
| **Assign officers** | Reviewing supervisor, Admin | Users hold the role; §27.2 | Sets evaluator / supervisor / approver | Evaluation sheet |
| **Answer checks** | Assigned evaluating officer, reviewing supervisor | Gate cleared; not decided | Y/N/N/A per manual check | Evaluation sheet |
| **Confirm category** | Assigned evaluating officer or reviewing supervisor | Gate; not closed; no final decision; category A–K (not I) | Sets confirmed category; reason required if it differs from the form's category; refreshes documents; audit notes re-categorisation and any charge mismatch | `ConfirmCategoryFor` |
| **Mark complete** | Assigned evaluating officer or reviewing supervisor | Gate; not closed; submission complete (else lists outstanding documents and unpaid amount and suggests a deficiency notice) | Sets Date Submission Complete if blank; it is never reset, so a deficiency notice or response does not restart the 30-day clock (Decided: Q7); if status was Deficiency Notice Issued → Under Review. Determination due follows. Already complete and not reopening → message only. | `MarkCompleteFor` |
| **Issue deficiency notice** | Reviewing supervisor (assigned) | Gate; not closed; not already Deficiency Notice Issued; if nothing failed and submission complete → confirm "anyway?" | Issues DEF number; status Deficiency Notice Issued; notice date = today; response due = today + 14; audit with counts of documents outstanding, balance, checks failed | `IssueDeficiencyFor` |
| **Approve and register** | Assigned approving officer | No approval blockers (§12.3) | New: certificate date = today, REG number, status Registered, final decision "Register (13(1)(a))". Update / annual: apply changes (§16), status Changes Applied, final decision "Accept filing and apply changes (para 16)". Sets date complete and review date if blank, approval date = today. Records overridden flags. | `ApproveFor` |
| **Lapse** | Assigned approving officer (Open: Q9) | Status Deficiency Notice Issued; today > response due | Status Lapsed; final decision "Treat as lapsed (13(2))"; approval date = today | `LapseFor` |
| **Refuse** | Assigned approving officer | Not closed; show-cause date set and ≥ 14 days ago; §27.2 separation; ground is one of the three allowed | Status Refused; final decision "Refuse (13(3)) - after show-cause"; reasons = ground + details | `RefuseFor` |
| **Cancel** | Admin | Not Cancelled, Refused, Lapsed or Changes Applied | Status Cancelled; reason required; audit "(was {status})" | `CancelFor` (para 14) |
| **Recalculate pricing** | Admin | No registration number yet; reason | §8.3 | `RecalculatePricingFor` |
| **Record show-cause date** | Approving officer, Reviewing supervisor | Not closed | Sets date (input in the workbook) | `tblRegister[Show-Cause Date]` |

The deficiency notice, acknowledgement letter, EVAL-01 form and CERT-01 certificate are documents the workbook expects "the app" to generate (Guide B13). Open: Q14.

## 14. Registration: data flags

Calculated per submission (`tblRegister` DUPLICATE_CAC … PRICING_OUT_OF_DATE). Flag count, flag list and codes feed check 7.6 and the approval blockers. Each flag's text is reproduced from the workbook.

| Code | Raised when |
| --- | --- |
| DUPLICATE_CAC | Same normalised CAC on a submission of another family (para 11(4)) |
| DUPLICATE_NAME | Same normalised name on another family |
| MISSING_REQUIRED | Any of name, date submitted, form, LGA, primary activity, licence status, operating Y/N, status missing |
| UNKNOWN_ACTIVITY / UNKNOWN_OTHER_ACTIVITY | Activity not in the map |
| NO_CAPACITY | Capacity-based primary activity with no capacity |
| OVERRIDE_NO_REASON | Override ≠ calculated with no reason |
| CERT_NOT_COMPLETE | Certificate date but submission not complete |
| CERT_STATUS | Certificate date but status not Registered / Cancelled |
| REGISTERED_NO_CERT_DATE | Registered without certificate date |
| DUPLICATE_REG_NO | Registration number in use on another family |
| LICENCE_RENEWAL | Nearest expiry − Effective Date used ≤ window (para 8(5)) |
| CPT_BELOW_1MW | CPT below 1 MW: use REG-01I |
| MSL_LICENCE | MSL without "NERC licence (multi-State)" |
| NO_START_DATE | Not operating and no planned start |
| FUTURE_SUBMISSION | Date submitted after today |
| LICENCE_APPLICATION_OVERDUE | Unlicensed and today > licence application due (para 18(2)) |
| LICENCE_NO_WITHOUT_LICENCE | Licence number with status Unlicensed / application pending |
| LICENCE_NO_MISSING | Licence held, no number |
| GENERATION_CATEGORY | GEN/CPT ≥ 10 MW but category applied not A, B or C |
| CAC_FORMAT | CAC not RC/BN/IT + digits |
| FORM_CATEGORY_MISMATCH | Form category ≠ target category (texts differ: unconfirmed; "Require the correct form"; confirmed without reason) |
| CONFIRMED_CATEGORY_NOT_CHARGED | Confirmed ≠ applied |
| TECHNICAL_INCOMPLETE | "Form sections not complete" is filled |
| TECHNICAL_CAPACITY_MISMATCH | Section capacity differs from installed capacity by > max(0.001, 1%) |
| LINKED_REGISTRATION | Update/annual not linked, or linked registration not Registered while this one is open |
| ANNUAL_LATE | Annual confirmation filed after 31 Jan of its year (parent certified in an earlier year) |
| ANNUAL_CONFIRMATION_OVERDUE | Registered new registration certified before this year, today past 31 Jan, and no annual confirmation this year in its family (other than refused, lapsed, cancelled) |
| EVALUATION_BEFORE_PAYMENT | Evaluation started before release, or with no release |
| STATUS_WITHOUT_CONFIRMATION | Status past acknowledgement with no release date |
| PRICING_OUT_OF_DATE | Snapshot differs from current rules (§8.3) |

In the app the last three are mostly impossible because the server enforces the gate; they stay as integrity checks (and catch imported data).

## 15. Own-use notifications (REG-01I)

Source: `tblOwnUse`, `modIntake.SaveOwnUseAt`, `RegisterOwnUseFor`.

- **Fields**: OUN no., registry ACK no., name, date filed, CAC, site address, LGA, nature of business, grid connected Y/N, distribution licensee, contact, phone, email, generator units (make/model, kW, fuel, average MWh; 1..n), flag override reason, remarks, created by, priced fee, priced threshold, registration no., certificate issue date, registered by, front desk intake no.
- **Installed capacity (kW)** = sum of unit kW (rounded to 0.001).
- **Eligibility**: ≥ 1000 kW → "Register as operator"; < threshold → "Not required"; else "Notification required".
- **Fee** = category I fee (₦100,000) when threshold ≤ kW < 1000, else 0; frozen on save with the threshold.
- **Save**: name, date filed (not future), LGA, at least one unit required; CAC/phone/email formats as §6. ≥ 1000 kW is refused ("Register as captive generation (para 3(3)(c))"). Below threshold → confirmable warning. Duplicate CAC + site address → confirmable warning (one notification per site). Issues the ACK (if not already from Registry Intake) and the OUN; creates the REG-01I checklist; audits; adds the Inward Register entry if the ACK is new.
- **Payments** reference the OUN. There is no Finance gate on own-use; payment status as §8.2.
- **Documents**: REG-01I list; payment_evidence automatic.
- **Flags**: OU_MISSING_REQUIRED, OU_DUPLICATE_SITE, OU_CAC_ON_REGISTER, OU_FEE_UNPAID, OU_PRICING_OUT_OF_DATE.
- **Filed after deadline** (Y/N) = date filed > registration deadline (information only).
- **Register with a certificate** (Approving officer): blocked unless `ownUseCertificate = Y`, not already registered, eligibility "Notification required", fee confirmed in full, documents complete, flags resolved (as §12.3 data flags), signatories set **[G3]**, and the approver is not the user who saved it **[G8]**. Issues `OGSERC/REG/{yyyy}/I-CPT/{serial}`.

## 16. Updates and annual confirmations (para 16)

- Filing types "Update: material change (para 16(1))" and "Annual confirmation (para 16(2))" must quote the registration number of a Registered new registration (Open: Q15). They join that registration's family.
- No late charge. No registration fee unless `feeOnUpdates = Y`. With nothing to pay the gate clears at save.
- On approval, each of these 25 fields that differs is copied to the parent and listed in the audit: registered name, trading name, registrant type, CAC, TIN, registered address, principal LGA, other LGAs, towns/estates, primary activity, other activities, installed capacity, customers, licence status, licence numbers and expiries, compliance officer, phone, email (`ApplyChanges`). A change to any certificate field (name, CAC, address, LGAs, towns, activities, licence status, licence numbers and expiries) sets "Certificate needs reissue" on the parent.
- An annual confirmation with no changes is audited "Annual confirmation accepted … no changes".
- Annual confirmation due date and the two annual flags as §14.

## 17. Registry: front desk

Source: Front Desk, Front Desk Log, `RegistryDesk.SaveFrontDesk`.

- **Who**: Front desk officer (also Registry officer).
- **Fields**: date & time received*, sender*, subject*, correspondence type (if known), mode of receipt (default Hand delivery), delivered by, phone, number of items/volumes, remarks. **[G6]** "Received by" is the logged-in user, not typed. Phone uses the one validator **[G5]**.
- **Save** issues the FD number. No acknowledgement. Status "Awaiting registry".
- **Awaiting registry list**: oldest first, with working days waiting (`NETWORKDAYS(received, today) − 1`).
- When the Registry registers it (New Inward or Registry Intake), the FD row records the ACK and registered-on time; status "Registered". An FD item can be registered once only. The front desk time becomes the receipt time.

## 18. Registry: intake of registration filings

Source: Registry Intake, `modRegistry.RX_SaveIntakeCore`, `RX_PullFrontDesk`, `RX_PullAck`, `RX_LogDirectEntry`.

### 18.1 Registry Intake

- **Who**: Registry officer.
- Start from an FD item (pull: received, mode, sender → name, subject, phone, delivered by, volumes, remarks; type → filing type), or from an inward item already acknowledged on New Inward whose Register entry is not yet saved (§18.2), or blank.
- **Fields**: date & time received*, mode*, filing type* (New registration / Update / Annual confirmation / Own-use notification), form filed (required unless own-use; REG-01I refused for non-own-use), registered name*, subject, linked registration no. (required for update/annual), sender's ref, CAC, principal LGA*, primary activity, licence status, operating Y/N, planned start, address, contact, phone, email, delivered by, volumes, Schedule 2 documents attached (count), fee evidence Y/N, payment reference, amount shown, acknowledgement issued via*, remarks. Received by = logged-in user **[G6]**.
- **Save + acknowledge**, in one transaction: issue ACK (unless pulled from §18.2) → create the inward item (correspondence type mapped from the filing type, sender category "Registrant / licensee", source "Registry Intake") → mark the FD item registered → create the Register draft (or Own-Use draft) under the same ACK with: filing type, form, linked no., name, date submitted = received date, submission channel from mode, CAC, address, LGA, activity, licence status, contact, phone, email, operating, start, remarks (officer, Schedule 2 count, fee evidence, payment ref, amount) → audit "Registry acknowledgement". Then send the acknowledgement email (§25).
- If primary activity, licence status and operating Y/N are all given, the Register entry is saved at once (§6). Otherwise it waits as "Register row started – complete and save it".
- Options: save, save + print slip, save + PDF slip.
- Registry Intake does not record payments or start evaluation (Registry Intake B34).

### 18.2 Registration filing logged on New Inward

An inward item whose correspondence type maps to a registration filing type shows a **Register / Own-Use entry** state: "Awaiting Register entry" → "Register row started – complete and save it" → "Saved on Register" / "Saved on Own-Use" (Inward Register BN). Items "Awaiting Register entry" (EXAMPLE rows excluded) are listed on Registry Intake under "Acknowledged — Register entry not yet saved".

### 18.3 Direct entry

Saving a submission or own-use notification that has no ACK yet issues one from the shared series and creates its inward item: received = date submitted (midnight), mode from the Register channel (Email / Online portal / else Hand delivery), type from the filing type, subject "{filing type} - {form}", acknowledgement via "Not yet issued", remark "Saved directly on the Register" / "Own-Use" (`RX_LogDirectEntry`).

### 18.4 Not ported **[G11]**

The two-workbook link (`RX_Partner`, `RegLink_*`, `SendFilingToEval`, "SYNC WITH CORRESPONDENCE REGISTRY", "SEND FILINGS TO EVALUATION", Filings Inward) is not ported. One database and one numbering service replace it.

## 19. Registry: inward items

Source: New Inward, Inward Register, `RegistryDesk.SaveInwardCore`.

- **Who**: Registry officer.
- **Fields** (* required): date & time received*, mode*, correspondence type*, sender*, sender category*, subject*, sender's ref, date on document, related OGSERC no., in response to our ref (outward no.), CAC / reg no., principal LGA, contact, phone, email, delivered/sent by, volumes, Schedule 2 docs attached, fee evidence Y/N, payment reference, amount shown, acknowledgement issued via*, remarks. Received by = logged-in user **[G6]**. The registry does **not** route at registration (New Inward A29).
- **Calculated**: deemed receipt date (§4.1); category, Order ref, default unit, response target and slip wording from the type; division from the unit.
- **Save** issues the ACK (year per §3), links the FD item if pulled, sends the acknowledgement email to the suggested unit and its division (§25), and, if the type is a registration filing, leaves it awaiting its Register entry (§18.2). Options: save, save + print slip, save + PDF slip.
- **Response due** = override; else none for "For information" / "File only"; else Urgent → deemed + `urgentResponseDays` working days; else deemed + type target working days if > 0; else none (`AN`). Missing type → `defaultResponseDays`.
- **Reply sent** = the outward item whose "In reply to" is this ACK; **reply dispatched on** = its dispatch date.
- **Closed on** = manual close date, else reply dispatched on.
- **Status** (`AS`), first match: Closed (closed on set) → Overdue (response due set and today > due) → Awaiting routing (not forwarded, not routed) → Awaiting forwarding (routed, not forwarded) → Noted / filed (forwarded, action For information / File only) → Open.
- **Working days at Registry** = deemed → forwarded (or today). **Working days open** = deemed → closed (or today).
- **Filed after registration deadline?** (REG-01 Registration (new) only) = deemed receipt date > registration deadline (with extension **[G1]**).
- **Checks / flags** (`AW`): missing required field; possible duplicate REG-01 (same CAC); no fee evidence with REG-01; Schedule 2 documents incomplete at receipt (< 12; Open: Q16); related OGSERC number missing (update, annual, deficiency response); not forwarded within target; acknowledgement not yet issued; response overdue; closed after due date; our ref not found in Outward; file ref not in File Index. ("Locked number differs" is impossible in the app.)
- **Item history**: every change to an inward item is audited with old → new values and shown on the item page.
- **Update item** (Registry officer): change sender/handling details, date forwarded, unit officer, acknowledgement via, manual close date, remarks.

## 20. Registry: routing, forwarding and closing

- **Route** (`SaveRoute`). **[G7]** Router role only; anyone else gets 403 on the server. Fields: unit override (else the type's default unit), file reference (must exist in the File Index; warn otherwise), action required*, priority (blank = Normal), action officer, response due override. Routed by = the user; routed on = now. Re-routing is allowed and audited. If the unit (or its division) has not been emailed for this item, email it (§25).
- **Forward** (Registry officer; `ForwardToday`): date forwarded = today (or a given date) and the receiving unit officer. If not yet routed: warn and ask to confirm.
- **Confirm receipt** (Unit officer of the routed unit): records the receiving unit officer = the user and the date. Open: Q17.
- **Close** (Registry officer, or Unit officer of the routed unit; `CloseToday`): manual close date = today; also sets date forwarded if blank; asks to confirm "Close … without an outgoing letter?". Logging an outward reply quoting the ACK closes it automatically on dispatch.

## 21. Registry: outward items

Source: New Outward, Outward Register, Update Item, `SaveOutward`, `DispatchedToday`, `DeliveredToday`.

- **Who**: Registry officer.
- **Fields** (* required): date of document*, document type*, subject*, addressee*, recipient category*, recipient address/email, in reply to (inward no.; the sender is shown to confirm the match), related OGSERC no., file reference, originating unit*, prepared by, signed by* (from Signatories **[G3]**; designation fills in), dispatch mode*, date dispatched, tracking ref, response expected (blank = type default), response due override, remarks. Dispatched by = the user when a dispatch date is recorded **[G6]**.
- **Save & get number** issues the OUT number before signature.
- **Response due** = override; else, if response expected (explicit or type default) and dispatched: dispatch date + type response window working days (or `defaultResponseDays` if 0).
- **Response received** = an inward item whose "In response to our ref" is this OUT number; with its deemed date.
- **Status**: Not yet dispatched → Response received → Response overdue → Awaiting response → Delivered → Dispatched.
- **Working days to dispatch** = document date → dispatch (or today).
- **Checks / flags** (`AG`): missing required field; not dispatched within target; inward no. not found; delivery not confirmed after `podChaseDays` (except Publication / gazette and Internal mail); response overdue; dispatched before document date; file ref not in File Index.
- **Dispatched today** / **Delivered today** (Registry officer): delivered requires a dispatch first; sets delivery confirmed Y and delivered date.

## 22. Registry: files and file movements

Source: File Desk, File Index, File Movement, `IssueFile`, `ReturnFile`, `NewFile`.

- **New file** (Registry officer): file class* (reference generated `OGSERC/{code}/{next}`; overtypeable, unique), title*, owning unit, date opened (today), volume (1), security (Open), status (Open), remarks.
- **File Index** calculated: inward items and outward items quoting it, last correspondence date (latest of inward deemed dates and outward document dates), currently with (holder and unit of the latest unreturned movement, else Registry), out since, working days out, flags (title missing, duplicate reference, out beyond return date, correspondence after file closed).
- **Issue** (Registry officer): file reference*, volume, issued to (officer)*, unit* (OGSERC units only), purpose, return-by override, released by = the user **[G6]**, out time = now. If the file is already out: warn and ask to confirm. Return due = override else out date + `fileReturnDays` working days.
- **Return** (Registry officer): finds the latest unreturned movement of the file; returned = today; received back by = the user. Nothing out → refused.
- **Movement status**: Returned / Overdue (today > return due) / Out. Flags: missing field, not in File Index, earlier movement not returned, return before out.
- "Issued to" is a free-text officer name (files move to any staff member, not only app users). Open: Q17.

## 23. Registry: pending actions

All inward items with status Open, Overdue, Awaiting forwarding or Awaiting routing, in the order received, for all units or one unit: inward no., deemed receipt, sender, subject, type, unit, action officer, action, priority, response due, working days open, status. Totals: pending, overdue, awaiting routing/forwarding. Available as a screen and as a PDF. Unit officers see their unit's list by default.

## 24. Outputs: acknowledgement slip, Daily Register, dashboards

### 24.1 Acknowledgement slip (PDF, A4, two copies)

Copies: "REGISTRANT'S / SENDER'S COPY" and "REGISTRY COPY", with a cut line. Header: OGUN STATE ELECTRICITY REGULATORY COMMISSION; registry address. Title "ACKNOWLEDGEMENT OF RECEIPT" and subtitle: if the type's para 10(3) wording is Y, "Paragraph 10(3), OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026", else "Correspondence received by the Registry of the Ogun State Electricity Regulatory Commission". Fields: ACK no., date & time received, deemed receipt date, mode, Order reference, type, related OGSERC no. (— if none), sender, sender's ref, subject, delivered by, volumes, Schedule 2 documents, fee evidence, payment reference, amount shown, received by, forwarded to. Footer text (verbatim from Acknowledgement Slip B22), registry officer's signature line, official stamp, "For the Secretary to the Commission ({Secretary signatory})".

### 24.2 Daily Register (PDF; any date, default today)

Received: every inward item whose **receipt date** (not deemed) is the date: #, ACK, time, mode, type, sender, subject, deemed receipt, received by, forward to. Dispatched: every outward item dispatched that date: #, OUT, document date, mode, type, addressee, subject, signed by, dispatched by, tracking ref. Counts of each. Sign-off line: registry officer on duty (the user printing it) and the Secretary to the Commission.

### 24.3 Dashboard (combined)

- **Registry** (Registry Desk A7:K8, Registry Dashboard): received today, dispatched today, awaiting routing / forwarding, incoming overdue, not yet dispatched, replies overdue to us, files out; items logged; received in last 7 days; forwarding overdue; open; closed; noted; closed on time %; acknowledgements not yet issued; received after hours / non-working day; REG-01 filed after the deadline; rows with flags; at front desk awaiting registry; awaiting Register entry; outgoing: logged, dispatched in 7 days, dispatch overdue, delivery not confirmed, awaiting response, response overdue, responses received, replies to inward items; files: in index, open, out, overdue, movements, flagged. Breakdowns by division, unit, category, month (24 months from a chosen first month), correspondent category, incoming type, outgoing document type, LGA.
- **Registration** (Dashboard): Effective Date, deadline, days to deadline; totals (submissions, awaiting payment, registered, provisional, in progress, closed, own-use, late); SLA red / amber; records with flags; average days in queue; evaluation status counts; by category (submissions, registered, fees, late charges, waivers, collected, outstanding); by status; by primary activity; by LGA (registrants and own-use); money (total due, collected, with Finance, outstanding, collection rate, unpaid on closed, credits); monthly (12 months from the Effective Date month, then the last 12); work queues: awaiting payment oldest first (with reminder due), overdue deficiency responses, ready for decision, my assigned evaluations (the logged-in user).

## 25. Acknowledgement email **[G9]**

- Sent through the email adapter (provider chosen by `EMAIL_PROVIDER`). Mode: Send / Preview (the officer reviews before sending) / Off.
- **On saving an inward item**: to the suggested unit's email(s) and its division's email(s), merged without duplicates; CC `ackEmailCc`. Subject "Acknowledgement {ACK} - {type} from {sender}". Body: the item details, received (and deemed) time, received by, unit, division, and "Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration." Slip PDF attached.
- **On routing**: to the routed unit and division unless every address was already emailed. Subject "Routed to {unit}: {ACK} - {sender}". Body adds routed by, action, priority, action officer, response due, file reference.
- **Resend** (Registry officer): asks to confirm if it was emailed before.
- Each send records "emailed to" and "emailed on" on the item. **Missing address**: a warning on save and an item history entry "Not emailed: no address" (unit {unit}, division {division}).
- A kept slip PDF (attached to an email) is stored in Vercel Blob with private access.

## 26. Daily review

Source: `modDailyReview.RunDailyReview`, Guide B29.

Runs from Vercel Cron at 07:00 Lagos and from an admin "Run daily review now" button; **at most once per Lagos date** (a unique row per date; a second trigger the same date returns "already run" and does nothing). Everything is worked out from the state before any change, then applied:

1. Release every Awaiting Payment submission whose gate is cleared.
2. Every **new registration** in Received - Under Review whose determination due < today → Provisionally Registered (audit: "Determination due … has passed: provisionally registered (para 13(4)); the Ack No. serves as the registration number").
3. List Deficiency Notice Issued submissions past their response due. **Never lapse automatically.**
4. Integrity: any Registered new registration without a registration number gets one (should not happen in the app).
5. Counts: red, amber, unpaid / part-paid (open or registered), released, and if `unpaidReminderDays` is set, awaiting-payment submissions at least that many days old.
6. Audit "Daily review" with the summary; record the run (date, trigger, user if manual, summary).

## 27. Roles and separation of duties

### 27.1 Roles **[G2, G6, G7]**

A user can hold several roles. Every server action checks the role, then the record-level rules below.

| Role | Can do | Seed (flag for Kamiye to confirm) |
| --- | --- | --- |
| Front desk officer | Log delivered documents; view awaiting-registry list | Funmilayo Sorungbe, Aliu Funmilola |
| Registry officer | Registry intake, inward, outward, update, forward, close, dispatch, delivery, files, slips, Daily Register, pending actions, resend email, save submissions and own-use notifications, record payments | Olanrewaju Oluyombo, Abiodun Sodipo |
| Router | Route and re-route inward items | Oluwatoyin Sonoiki (Secretary to the Commission), Adetola Salami (Head of Administration) |
| Unit officer (per unit) | See items routed to their unit; confirm receipt; close | none; set per unit |
| Evaluating officer | Answer checks; confirm category; mark complete | none |
| Reviewing supervisor | All the evaluator can do on items they supervise; assign officers; issue deficiency notices; record show-cause date | none |
| Approving officer | Approve, refuse, lapse; register own-use | none |
| Finance officer | Record, confirm, reject, reverse payments | none |
| Admin | Settings, fee table, lists, units and emails, holidays, users and roles, signatories; cancel; recalculate pricing; run daily review; export registers; reverse payments | Kamiye (ICT) |
| Viewer | Dashboards and registers, read-only | Management, as needed |

Everyone signed in can read the registers and dashboards. Write access is by role only.

### 27.2 Separation of duties **[G8]**

Enforced on the server for each record, returning every reason at once:

- For a submission, the **approving officer, evaluating officer, reviewing supervisor and the user who saved it (Created By)** must be four different people. Checked when officers are assigned and again at approve, refuse and lapse. (The workbook checked approver ≠ evaluator, approver ≠ supervisor, approver ≠ creator and supervisor ≠ evaluator; the brief adds evaluator ≠ creator and supervisor ≠ creator.)
- The acting user must be the assigned officer for the action (§13.3).
- A Finance officer cannot confirm or reject a payment they recorded (403, including through a direct API call).
- Own-use registration: the approver is not the user who saved the notification.

## 28. Audit log

- Append-only, one log for both modules: timestamp (UTC, shown in Lagos time), user (id and name at the time), action, module, entity type and id, reference (ACK, OUN, PAY, OUT, FD, file ref), detail text, and structured before/after data.
- Written in the same transaction as the change it records. No update or delete, enforced in the database.
- Action names follow the workbook: New submission, Filing received, Registry acknowledgement, Payment recorded / confirmed / rejected / reversed, Released for evaluation, Blocked - awaiting Finance confirmation, Category confirmed, Pricing recalculated, Submission complete, Deficiency notice issued, Registered, Changes applied, Annual confirmation accepted, Provisional registration, Lapsed, Refused, Cancelled, Own-use notification, Daily review, Setting changed, Edited (field old → new); plus registry actions (Front desk logged, Inward saved, Routed, Forwarded, Closed, Outward saved, Dispatched, Delivered, File opened / issued / returned, Acknowledgement emailed / Not emailed: no address) and sign-in events.

## 29. Workbook records: real and EXAMPLE

| Sheet | Rows | Real or EXAMPLE | Notes |
| --- | --- | --- | --- |
| Front Desk Log | Row 6, OGSERC/FD/2026/00001 | **Real** | Verge Power Limited, "Petition to the Commission", received 3 Nov 2026 20:50, hand delivery, type "Letter from DisCo / GenCo / TCN", delivered by Emmanuel Arowos, 8 items, remarks "Delivered", status Awaiting registry. Phone saved as 8021846578 → restore **08021846578** and list in the import report **[G5]**. Received by "[Front desk officer 1]" → keep and flag **[G6]**. |
| Inward Register | Rows 6–8, ACK/2026/00001–00003 | EXAMPLE | Sample Mini-Grid Ltd ×2, NERC ×1. |
| Outward Register | Rows 6–7, OUT/2026/00001–00002 | EXAMPLE | |
| File Index | Rows 6–7, OGSERC/RL/001, OGSERC/GOV/001 | EXAMPLE | |
| File Movement | Rows 6–7 | EXAMPLE | |
| Acknowledgement Slip, Pending Actions, Daily Register, Registry Dashboard | n/a | Derived from the EXAMPLE rows | |
| Register, Documents, Evaluation, Payments, Own-Use, Finance Desk | 0 rows | Empty | |
| Audit Log | Row 5 | Test | "Daily review" by "Oluwafemi" on 5 Nov 2026 08:56; all counts 0. Not imported. |
| Settings, Lists, Registry Settings, Registry Lists | | Configuration | Seeded as reference data, except G2 staff numbers, the "[Name]" signatories and the second Effective Date. |
| Registry Desk, New Outward, File Desk | | Form defaults | Duty officer Olanrewaju Oluyombo and Secretary Oluwatoyin Sonoiki on the Desk are names from Registry Lists, not records. |

Production gets only the real Front Desk item (Phase 6). Development and preview environments seed the EXAMPLE rows behind `seedExamples` **[G4]**.

## 30. Worked examples (become automated tests)

Effective Date 22 Oct 2026, extension 0 → registration deadline **21 Dec 2026**.

### 30.1 Category

| Primary | Capacity | Others | Category | Why |
| --- | --- | --- | --- | --- |
| SDC | – | GEN | A | A wins |
| INT | – | – | B | |
| GEN | 12 | – | C | ≥ 10 MW |
| GEN | 5 | – | D | 1–10 MW |
| GEN | 0.5 | – | K | < 1 MW |
| CPT | 0.5 | – | D (flag CPT_BELOW_1MW; 1.4 = N → redirect to REG-01I) | |
| MGD | 0.3 | – | E | |
| DIS / MSL / IDN / TRD | – | – | F | |
| EST | – | – | G | |
| MET | – | – | H | |
| FRN | – | – | J | |
| SUP | 0.5 / 2 | – | K / K (setting) | |
| GEN | 5 | DIS | F | F fee 500k > D 300k |
| GEN | 12 | DIS | C | C and F tie at 500k; primary first |
| MGD | 12 | GEN | C | capacity applies to every activity |
| (own-use 500 kW) | | | I | REG-01I, fee ₦100,000 |

### 30.2 Fees and late charges (new registration, existing operator)

**[G14]** Late charge = `min(initial + daily × days late, cap)`. Deemed received 31 Dec 2026 = 10 days late; 31 Mar 2027 = 100 days late; 28 Aug 2027 = 250 days late.

| Cat | Fee | Late, 10 days | Total, 10 days | Late, 100 days | Late, 250 days |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 1,000,000 | 3,000,000 | 4,000,000 | 20,000,000 (cap) | 20,000,000 (cap) |
| B | 1,000,000 | 3,000,000 | 4,000,000 | 20,000,000 (cap) | 20,000,000 (cap) |
| C | 500,000 | 3,000,000 | 3,500,000 | 20,000,000 (cap) | 20,000,000 (cap) |
| D | 300,000 | 1,500,000 | 1,800,000 | **10,000,000 (cap)** | 10,000,000 (cap) |
| E | 250,000 | 1,500,000 | 1,750,000 | 10,000,000 (cap) | 10,000,000 (cap) |
| F | 500,000 | 3,000,000 | 3,500,000 | 20,000,000 (cap) | 20,000,000 (cap) |
| G | 500,000 | 3,000,000 | 3,500,000 | 20,000,000 (cap) | 20,000,000 (cap) |
| H | 250,000 | 1,500,000 | 1,750,000 | 10,000,000 (cap) | 10,000,000 (cap) |
| I | 100,000 | n/a | 100,000 | n/a | n/a |
| J | 250,000 | 1,500,000 | 1,750,000 | 10,000,000 (cap) | 10,000,000 (cap) |
| K | 100,000 | 200,000 | 300,000 | 1,100,000 | 2,000,000 (cap) |

Required test: **category D, 100 days late → late charge ₦10,000,000** (the workbook formula gives ₦10,500,000). Cap boundaries: A/B/C/F/G reach the cap at 95 days (1,000,000 + 200,000 × 95); D/E/H/J at 95 days (500,000 + 100,000 × 95); K at 190 days (100,000 + 10,000 × 190). One day before each boundary is below the cap (e.g. D, 94 days → ₦9,900,000).

Also: on time (deemed 21 Dec 2026) → late 0; an email filed at 18:00 on Mon 21 Dec 2026 is deemed received Tue 22 Dec → 1 day late (D: ₦600,000); waiver ₦100,000 on D, 10 days late → net fee 200,000, total 1,700,000 (`waiverReducesLate = N`); updates → fee 0, late 0, gate clears at save.

### 30.3 Deadlines and clocks

- Existing operator → 21 Dec 2026; with `extensionDays = 30` → 20 Jan 2027.
- New operator starting 1 Mar 2027 → deadline 30 Jan 2027.
- Unlicensed → licence application due 20 Jan 2027.
- Complete on 4 Jan 2027 → determination due 3 Feb 2027; daily review on 4 Feb 2027 → Provisionally Registered.
- Deficiency notice 4 Jan 2027 → response due 18 Jan 2027; lapse allowed from 19 Jan 2027.
- Changing `effectiveDate` to 2 Nov 2026 → deadline 1 Jan 2027 for the global deadline, the inward flag and unpriced records; saved submissions keep 21 Dec 2026 and are flagged PRICING_OUT_OF_DATE ("deadline 21 December 2026 → 1 January 2027; Effective Date 22 October 2026 → 2 November 2026"); "Recalculate all open submissions" with a reason moves them to 1 Jan 2027 and audits each (Q6).

### 30.4 Deemed receipt

- Email, Fri 18 Dec 2026 17:30 → Mon 21 Dec 2026.
- Email, Thu 24 Dec 2026 18:00 → Tue 29 Dec 2026 (25, 26, 28 Dec holidays; 27 Sunday).
- Hand delivery, Fri 18 Dec 2026 16:00 → Fri 18 Dec 2026.
- Hand delivery, Fri 18 Dec 2026 17:30 → Fri 18 Dec 2026 (no cut-off for hand delivery).
- Online portal, Fri 18 Dec 2026 16:59 → Fri 18 Dec 2026; 17:00 exactly → Mon 21 Dec 2026.
- Hand delivery, Sat 26 Dec 2026 10:00 → Tue 29 Dec 2026.
- Hand delivery, Tue 3 Nov 2026 20:50 (Verge Power) → Tue 3 Nov 2026.
- Email, Thu 31 Dec 2026 18:00 → Mon 4 Jan 2027 (1 Jan holiday; 2–3 Jan weekend) → numbered OGSERC/ACK/**2027**/… (Q3).
- Urgent item deemed Thu 24 Dec 2026 → response due Tue 29 Dec 2026.
