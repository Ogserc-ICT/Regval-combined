# OGSERC Registration & Evaluation App — Claude Code Build Brief

5 Nov 2026 · Kamiye Oladipo Ojedokun · re-scoped 10 Nov 2026 (Phase 9: the Registry was removed)

## How to use this brief

This project began as one app for both halves of the combined workbook: Registration & Evaluation and the Registry. On 10 Nov 2026 the scope changed: **the Registry is no longer part of this app**, which is now a standalone Registration & Evaluation app. The Registry's modules had already been built (Phases 3 to 6) and were taken out again in Phase 9; see "Build phases" for the history. The repo keeps its name.

Claude Code works phase by phase and stops for review after each. Kamiye replies "Go to Phase N" to start the next one.

This project shares no code, database, number series or Vercel project with the existing Registration & Evaluation app or the separate registry app, and must not depend on either. Everything below this section is written to Claude Code.

## Goal and decisions

Build one standalone, staff-only web app that does everything the Registration & Evaluation half of the combined workbook does, with the rules enforced on the server, hosted on Vercel Pro. These decisions are made; do not reopen them.

- **Standalone.** Its own repo, database and Vercel project. It shares no code, data or number series with the existing Registration & Evaluation app or the registry app, and must not depend on either.
- **Stack.** Next.js (App Router), TypeScript, Tailwind and PostgreSQL. The ORM, migration tool and auth approach were chosen in Phase 0 (`docs/PLAN.md`).
- **Registration only.** Operator registration under Order No. OGSERC/ORD/2026/001: forms REG-01A to REG-01K, payments and the Finance gate, the EVAL-01 evaluation, own-use notifications. No front desk, inward or outward correspondence, routing, files or Daily Register: those belong to the separate registry app.
- **The workbook is the spec** for the registration rules. Its Guide, Settings notes, formulas, lists and VBA define them. Where it is unclear or contradicts itself, list the question; don't guess.
- **This app is the system of record** for everything it handles.
- **Staff only.** No public applicant portal.
- **Look and feel.** A modern, premium dashboard with a sidebar, dark mode by default.
- **Time.** Africa/Lagos for every date, deadline and "today", computed on the server.

## Source material

The workbook (`docs/source/`, read-only) has 31 sheets and about 4,000 lines of VBA. Only the registration half is in scope; the registry half is kept for reference and for the offline workbook export.

| Workbook area | Sheets | In the app |
| --- | --- | --- |
| Registration records | Register, Documents, Evaluation, Payments, Finance Desk, Own-Use | Registration screens and tables |
| Registration outputs | Dashboard, Audit Log | Dashboard and the audit log |
| Registration config | Settings, Lists | Admin |
| Instructions | Guide | Read for rules |
| Registry (out of scope) | Registry Desk, Front Desk, New Inward, Registry Intake, New Outward, Update Item, Routing Desk, File Desk, Inward Register, Outward Register, Front Desk Log, File Index, File Movement, Pending Actions, Acknowledgement Slip, Daily Register, Registry Dashboard, Registry Settings, Registry Lists, Registry Guide | Not in this app. Only the para 10(3) deemed-receipt rule and the holiday list (Registry Settings) are used, now on the Register |

| VBA module | Lines | What it holds |
| --- | --- | --- |
| modIntake.bas | 421 | Saving submissions and own-use notifications, category confirmation, pricing snapshot, document checklist |
| modCommon.bas | 344 | Audit entries, serials, CAC/phone/email validation, settings access |
| modWorkflow.bas | 255 | Mark complete, deficiency, approve and register, lapse, refuse, cancel |
| modPayments.bas | 204 | Record, confirm, reject and reverse payments; the Finance gate |
| modDailyReview.bas | 89 | The daily review |
| RegistryDesk.bas, modRegistry.bas | 2,554 | Registry (out of scope) |

The Guide mentions `docs/SPEC.md`, `src/domain` and `npm run export:workbook` from another repo; those are not available here. This project's own `docs/SPEC.md` was written in Phase 0.

**Real data.** The workbook holds no real registration records, so there is nothing to import. Its only real record, Verge Power Limited's petition (Front Desk Log row 6), is correspondence and belongs to the registry app. Every row whose sender, addressee, title or purpose starts with "EXAMPLE" is test data.

## Gap fixes

Fourteen gaps were found in the workbook (G14 added 6 Nov 2026). The numbers are kept; four no longer apply since the Registry was removed. Don't carry any of the others into the app. The "Workbook export" notes apply only to the optional offline workbook export.

1. **G1 One Effective Date.** Settings B7 says 22 Oct 2026 (deadline 21 Dec 2026). Registry Settings B14 says 2 Nov 2026 (deadline 1 Jan 2027). Both are placeholders, but they disagree.
    - App: one `effectiveDate` setting plus `extensionDays` (para 25). Every deadline and late check derives from it, including the own-use "filed after the deadline" flag. Show admins a banner while it is still a placeholder.
    - Workbook export: one Effective Date cell feeds both halves.
2. **G2 Staff lists hold numbers.** Lists BK6 (Evaluating Officers) = 69, BM6 (Reviewing Supervisors) = 82, BO6 (Approving Officers) = 65, the character codes of E, R and A.
    - App: officers come from user accounts and roles, never free text.
    - Workbook export: write real staff names per role.
3. **G3 Signatories split across two lists.** Settings B29 (Chairman / CEO) and B30 (Commissioner) are "[Name]", which blocks every new-registration approval. Registry Lists names Jide Onakoya (Chairman).
    - App: one Signatories table (name, designation, role) for certificates. Seed Jide Onakoya as Chairman / CEO, flagged for Kamiye to confirm. Leave Commissioner empty and keep approval blocked, with a clear message, until an admin fills it. Never invent a name.
    - Workbook export: one signatory list for both halves.
4. **G4 Example rows in the registers.** *Not applicable: registry removed.* The EXAMPLE rows were all in the registry registers. The rule stays: production never holds example data.
5. **G5 Phone numbers lose their leading zero.** Front Desk Log K6 saved a phone as 8021846578.
    - App: store phones, CAC numbers, TINs and references as strings. Use one phone validator everywhere: 11 digits starting with 0, or +234 and 10 digits, ignoring spaces and dashes.
    - Workbook export: text-format every phone, CAC, TIN and reference cell.
6. **G6 Officer names are typed.**
    - App: every "Recorded / Saved / Decided by" field comes from the logged-in user.
7. **G7 Routing is restricted by a name pick.** *Not applicable: registry removed.*
8. **G8 Separation of duties is only a reminder.** Guide row 9 says the buttons compare typed names.
    - App: enforce on the server that approver, evaluator, supervisor and the person who saved the submission are four different people, and that Finance cannot confirm or reject a payment they recorded. Return every blocking reason at once, as the workbook buttons do.
9. **G9 Email depends on desktop Outlook.** *Not applicable: registry removed.* The unit and division acknowledgement emails are out of scope; there is no email adapter.
10. **G10 The workbook build can't be traced.** Settings B50 says "39f98f8+local changes".
    - App: show the deployed commit (`VERCEL_GIT_COMMIT_SHA`) in the admin footer.
    - Workbook export: stamp the clean commit hash and build time, and refuse to build from uncommitted changes.
11. **G11 Leftover two-workbook code.** *Not applicable: registry removed.*
12. **G12 Numbering isn't safe for several users.** `AssignNumber` takes the highest number on the sheet plus one.
    - App: issue every series (ACK, PAY, OUN, DEF, REG) from a counters table inside a database transaction with row locking. Numbers are per year, locked once issued and never reused, even when a record is cancelled. The ACK prefix (default `OGSERC/ACK`) is an admin setting.
13. **G13 "Today" is the computer's date.** Deemed receipt uses a 17:00 cut-off, weekends and the holiday list (Registry Settings rows 21–36, several marked "Estimated" or "Provisional").
    - App: compute dates in Africa/Lagos on the server. Holidays are admin-editable with a status. Keep a test-only today override (`APP_TODAY`) that is disabled in production.
14. **G14 The late charge exceeds the Order's cap.** The Register "Late Charge" formula is `initial + MIN(daily × days late, cap)`. The Order caps the whole late charge: `MIN(initial + daily × days late, cap)`. Category D, 100 days late: the workbook gives ₦10,500,000; the Order gives ₦10,000,000.
    - App: late charge = `min(initial + daily × days late, cap)` (`docs/SPEC.md` §8.2).
    - Workbook export: write the Late Charge column as `MIN(initial + daily × days late, cap)`.

## What moved into the Register (Phase 9)

1. **Deemed receipt (para 10(3)).** Every submission and own-use notification records the date and time received and the channel (By hand, Email, Online portal). The deemed receipt date is computed on save: the 17:00 cut-off applies to Email and Online portal only; weekends and holidays roll forward for every channel. It is stored, fixed from then on, and sets the ACK year and the days late (Q3).
2. **ACK numbers** come from this app's own counter, with the prefix as an admin setting (default `OGSERC/ACK`). The separate registry app also issues OGSERC/ACK numbers (QUESTIONS.md Q25).
3. **Outgoing documents** are no longer numbered or tracked by a Registry. The Register records the date each deficiency notice, show-cause letter and certificate was actually sent. The deficiency and show-cause periods run from the sent dates.
4. **Deficiency responses** no longer arrive as inward items: "Mark complete" on a submission with an outstanding deficiency notice asks for the date the response was received, and logs it.
5. **Reports** are the registration documents the app must produce as PDFs: the para 10(3) acknowledgement letter, the deficiency notice, the EVAL-01 report and the CERT-01 certificate (QUESTIONS.md Q26 asks for the Commission's templates and wording).
6. **The dashboard** shows registration figures only (by category, status, activity and LGA) and the work queues of the workbook's Dashboard sheet.

## Modules and roles

| Module | What it does | Replaces |
| --- | --- | --- |
| Dashboard | Registration figures by category, status, activity and LGA, money, service levels, and work queues for the signed-in user | Dashboard |
| Register | Submissions with their receipt and deemed receipt, category, fees, late charges, clocks, flags, and the dates letters and certificates were sent | Register |
| Payments and Finance | Record, confirm, reject, reverse; the Finance gate | Payments, Finance Desk |
| Documents | Schedule 2 checklist per form | Documents |
| Evaluation | EVAL-01 checks and decisions | Evaluation |
| Own-use | REG-01I notifications | Own-Use |
| Reports | The acknowledgement letter, deficiency notice, EVAL-01 report and CERT-01 certificate as PDFs (next phase) | — |
| Audit log | Every action, append-only | Audit Log |
| Admin | Settings, fee table, lists, holidays, staff and roles, signatories, daily review, exports, go-live checks | Settings, Lists |

A user can hold several roles, but the separation-of-duties rules in G8 still apply to each record.

| Role | Can do |
| --- | --- |
| Registration officer | Enter filings and own-use notifications, record payments, keep the document checklist, record when deficiency notices and certificates were sent |
| Finance officer | Record, confirm, reject and reverse payments |
| Evaluating officer | Complete EVAL-01 checks |
| Reviewing supervisor | Review evaluations, assign officers, issue deficiency notices |
| Approving officer | Approve, refuse, lapse |
| Admin | Everything in Admin, run the daily review, cancel, recalculate |
| Viewer | Dashboards and registers, read-only |

## Vercel deployment

Deploy as one Vercel Pro project. Nothing may depend on a local disk, desktop Office or a machine being switched on.

- **Database.** Its own Postgres database from the Vercel Marketplace (Neon). Use the pooled connection string for app traffic and the direct one for migrations. Run migrations as a deploy step, never on a cold start.
- **Region.** The database region closest to Lagos that the provider offers, with the Vercel function region in the same place.
- **Daily review.** A Vercel Cron Job calls a protected route that checks `CRON_SECRET`. Cron runs in UTC, so `0 6 * * *` is 07:00 in Lagos. It runs at most once per Lagos date, logs each run to the audit log, and admins have a "Run daily review now" button.
- **PDFs.** Generate the registration documents on request in a route handler and stream them to the browser. If a PDF must be kept, store it in Vercel Blob with private access. Never write to the local filesystem.
- **Long jobs.** Keep requests short. Run register exports in chunks.
- **Auth.** Staff accounts with roles (Better Auth, `docs/PLAN.md` §6). Deployment Protection on for preview deployments.
- **Previews.** Each preview gets its own database branch with seed data, never production data.
- **Environment variables.** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `BETTER_AUTH_URL`, `CRON_SECRET`, `BOOTSTRAP_ADMIN_*`, and `APP_TODAY` (development and tests only).
- **Backups.** The database's point-in-time restore, plus the admin "Export registers" button (CSV and .xlsx).
- **Domain.** A subdomain of ogserc.org.ng.

## Build phases

After each phase, stop, summarise what changed and what comes next, and wait for "Go to Phase N".

| Phase | What it delivered | Status |
| --- | --- | --- |
| 0 | Spec and plan, no code | Done 5 Nov 2026 |
| 1 | Scaffold and foundations: database and migrations, auth and roles (G6, G8), unified settings (G1), the numbering service (G12), Lagos time and holidays (G13), validators (G5), the audit log, the app shell, CI, first preview | Done 6 Nov 2026 |
| 2 | Registration module: Register and intake, category and pricing snapshot, fees and late charges, the Documents checklist, Payments and the Finance gate, EVAL-01 and its decisions, Own-use, signatories (G3) | Done 6 Nov 2026 |
| 3 | Registry module | Done 6 Nov 2026; **removed in Phase 9** |
| 4 | Outputs and automation: the daily review cron (kept); the acknowledgement slip, Daily Register and pending-actions PDFs and the email adapter (removed in Phase 9) | Done 6 Nov 2026 |
| 5 | Dashboard and admin: dashboard, admin screens, register exports | Done 6 Nov 2026 (registry parts removed in Phase 9) |
| 6 | Go-live: production on Vercel; the workbook import (removed in Phase 9: nothing to import) | Done 6 Nov 2026 |
| 7 | Offline workbook export (optional) | Done 6 Nov 2026; registry sheets left as they were (QUESTIONS.md Q27) |
| 8 | Live updates, notifications, idle sign-out with resume | Built 10 Nov 2026; awaiting Kamiye's test |
| 9 | Re-scope: Registry removed; deemed receipt, ACK and sent dates moved into the Register | 10 Nov 2026 |
| 10 | The four registration PDFs: acknowledgement letter, deficiency notice, EVAL-01 report, CERT-01 certificate | Next, once the templates arrive (Q26) |

## Acceptance checks

The build is done only when every check below passes as an automated test, or is shown working on a preview deployment.

- [ ] Changing the Effective Date in one place moves the global registration deadline, the own-use "filed after the deadline" flag and every not-yet-priced record. Saved submissions keep their frozen pricing and are flagged "pricing out of date", and an admin's one-click "Recalculate all open submissions" (reason required, logged on each submission) moves their deadlines too. (Q6.)
- [ ] 20 parallel saves get 20 consecutive ACK numbers, with no duplicates.
- [ ] Phone 08021846578 is saved and shown with its zero; 8021846578 is rejected with a clear message.
- [ ] A submission received by email at 17:30 on a Friday is deemed received the next Monday; one received by hand at 17:30 keeps its day. (Q1.)
- [ ] An email item received at 18:00 on Thursday 24 Dec 2026 is deemed received Tuesday 29 Dec (25, 26 and 28 Dec are holidays).
- [ ] The ACK year is the year of the deemed receipt date, and the deemed receipt date cannot change once saved. (Q3.)
- [ ] A deficiency notice's response period runs from the date it was sent; it cannot lapse before it is sent; "Mark complete" on it asks for the date the response was received.
- [ ] A category D new registration 100 days late has a late charge of ₦10,000,000, not the workbook's ₦10,500,000 (G14).
- [ ] Approving a new registration is refused while the Commissioner signatory is empty, and the reason is shown.
- [ ] A Finance officer gets 403 confirming a payment they recorded, including through a direct API call.
- [ ] The daily review cron triggered twice on one Lagos date runs once.
- [ ] Production has no EXAMPLE records.
- [ ] Worked examples of the fee, late-charge, category and deadline rules pass as tests for every category from A to K.
- [ ] If the workbook export is used, the generated workbook has one Effective Date, names in the staff lists, text phone cells, no EXAMPLE rows, a clean commit hash and the G14 late-charge formula.

## Open questions for the Commission

None of these block the build. Each is a setting or an admin-editable list with a clear placeholder until it is answered. The full list is in `docs/QUESTIONS.md`.

- Whether this app replaces the existing Registration & Evaluation app once it is live, or runs alongside it.
- The ACK prefix: this app and the separate registry app both issue OGSERC/ACK numbers (Q25).
- The templates and wording of the acknowledgement letter, deficiency notice, EVAL-01 report and CERT-01 certificate (Q26).
- The gazetted Effective Date of the Order.
- The Commissioner's name, and confirmation that Jide Onakoya is the "Chairman / CEO" signatory.
- Whether hosting Commission data on servers outside Nigeria is acceptable under the Nigeria Data Protection Act 2023.
- The holiday dates marked "Estimated" or "Provisional".
- The TIN format, which Finance has not confirmed.
- The undecided policy settings in Settings rows 33–42.
- The names of the registration, evaluating, supervising, approving and Finance officers.
