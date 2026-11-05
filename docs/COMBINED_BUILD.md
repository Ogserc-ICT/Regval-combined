# OGSERC Combined Registry & Evaluation App — Claude Code Build Brief

5 Nov 2026 · Kamiye Oladipo Ojedokun

## How to use this brief

Claude Code builds the combined app as a new, standalone project from an empty folder, working through the phases below and stopping for review after each. The starter kit zip is the whole starting folder: `START-HERE.md`, `CLAUDE.md`, this brief and the workbook.

1. Create an empty private repo in the OGSERC GitHub organisation, named `ogserc-registry-evaluation`.
2. Make a new folder with that name on your computer and unzip the starter kit into it.
3. Put the folder under git and push it:

```
git init -b main
git add .
git commit -m "Start combined app: build brief and reference workbook"
git remote add origin <new-repo-url>
git push -u origin main
```

4. Open Claude Code in the folder and give it this instruction:

```
Read CLAUDE.md and docs/COMBINED_BUILD.md, then inspect docs/source/OGSERC_Registry_and_Evaluation_Combined.xlsm. This is a new standalone project with no existing code. Do Phase 0 only. Stop when it is done and show me the spec and plan before writing any code.
```

5. Review each phase, then reply "Go to Phase N".

This project shares no code, database, number series or Vercel project with the Registration & Evaluation app or the registry app. Everything below this section is written to Claude Code.

## Goal and decisions

Build one standalone, staff-only web app from scratch that does everything the combined workbook does, with the rules enforced on the server, hosted on Vercel Pro. These decisions are made; do not reopen them.

- **Standalone.** A new repo and codebase with its own database and Vercel project. It shares no code, data or number series with the existing Registration & Evaluation app or the registry app, and must not depend on either.
- **Stack.** Next.js (App Router), TypeScript, Tailwind and PostgreSQL. Propose the ORM, migration tool and auth approach in Phase 0.
- **Registration and Registry in one app**, with one OGSERC/ACK series and one front desk, exactly as the combined workbook works.
- **The workbook is the spec.** Its Guide, Settings notes, formulas, lists and VBA define the rules for both modules. Where it is unclear or contradicts itself, list the question; don't guess.
- **This app is the system of record** for everything it handles.
- **Staff only.** No public applicant portal.
- **Look and feel.** A modern, premium dashboard with a sidebar, dark mode by default. One design across both modules so it feels like one product.
- **Time.** Africa/Lagos for every date, deadline and "today", computed on the server.

## Source material

The workbook has 31 sheets and about 4,000 lines of VBA. Read both: the sheets hold the data, lists and formulas, and the VBA holds most of the workflow rules. Extract the VBA with `oletools` (olevba).

| Workbook area | Sheets | In the app |
| --- | --- | --- |
| Registry hub and forms | Registry Desk, Front Desk, New Inward, Registry Intake, New Outward, Update Item, Routing Desk, File Desk | Registry screens |
| Registry records | Inward Register, Outward Register, Front Desk Log, File Index, File Movement, Pending Actions | Registry tables |
| Registry outputs | Acknowledgement Slip, Daily Register, Registry Dashboard | PDFs and the combined dashboard |
| Registry config | Registry Settings, Registry Lists | Admin |
| Registration records | Register, Documents, Evaluation, Payments, Finance Desk, Own-Use | Registration screens and tables |
| Registration outputs | Dashboard, Audit Log | Combined dashboard and one audit log |
| Registration config | Settings, Lists | Admin |
| Instructions | Guide, Registry Guide | Read for rules |

| VBA module | Lines | What it holds |
| --- | --- | --- |
| RegistryDesk.bas | 1,439 | Registry forms and buttons: front desk, inward, outward, update, forward, close, dispatch, delivery, files, slips, Daily Register |
| modRegistry.bas | 1,115 | Registry Intake, pulling front desk and acknowledged items, creating Register or Own-Use rows under the shared ACK, ACK numbering |
| modIntake.bas | 421 | Saving submissions and own-use notifications, category confirmation, pricing snapshot, document checklist |
| modCommon.bas | 344 | Audit entries, serials, CAC/phone/email validation, settings access |
| modWorkflow.bas | 255 | Mark complete, deficiency, approve and register, lapse, refuse, cancel |
| modPayments.bas | 204 | Record, confirm, reject and reverse payments; the Finance gate |
| modDailyReview.bas | 89 | The daily review |

The workbook is the only spec. The Guide mentions `docs/SPEC.md`, `src/domain` and `npm run export:workbook`: those belong to another repo, are not available here, and must not be recreated from guesses. In Phase 0, write the rules up as this project's own `docs/SPEC.md`, covering both modules.

**Real data.** Only one record in the file is real: Front Desk Log row 6, OGSERC/FD/2026/00001, a petition from Verge Power Limited received 3 Nov 2026 and still awaiting registry. Every row whose sender, addressee, title or purpose starts with "EXAMPLE" is test data.

## Gap fixes

Fourteen gaps were found in the workbook (G14 added 6 Nov 2026 after Phase 0). Don't carry any of them into the app. The "Workbook export" notes apply only if the optional offline workbook export (Phase 7) is built.

1. **G1 One Effective Date.** Settings B7 says 22 Oct 2026 (deadline 21 Dec 2026). Registry Settings B14 says 2 Nov 2026 (deadline 1 Jan 2027). Both are placeholders, but they disagree.
    - App: one `effectiveDate` setting plus `extensionDays` (para 25). Every deadline, late check and the inward "Filed after registration deadline?" flag derive from it. Show admins a banner while it is still a placeholder.
    - Workbook export: one Effective Date cell feeds both halves.
2. **G2 Staff lists hold numbers.** Lists BK6 (Evaluating Officers) = 69, BM6 (Reviewing Supervisors) = 82, BO6 (Approving Officers) = 65, the character codes of E, R and A.
    - App: officers come from user accounts and roles, never free text.
    - Import: ignore these values.
    - Workbook export: write real staff names per role.
3. **G3 Signatories split across two lists.** Settings B29 (Chairman / CEO) and B30 (Commissioner) are "[Name]", which blocks every new-registration approval. Registry Lists already has Jide Onakoya (Chairman) and Oluwatoyin Sonoiki (Secretary to the Commission).
    - App: one Signatories table (name, designation, role) for certificates and outgoing letters. Seed the Chairman from Registry Lists and flag it for Kamiye to confirm. Leave Commissioner empty and keep approval blocked, with a clear message, until an admin fills it. Never invent a name.
    - Workbook export: one signatory list for both halves.
4. **G4 Example rows in the registers.** Inward Register (3), Outward Register (2), File Index (2) and File Movement (2) hold EXAMPLE rows using ACK/2026/00001–00003 and OUT/2026/00001–00002.
    - App: no example data in production. Seed it only in development and preview environments, behind a flag.
    - Import: skip every EXAMPLE row.
    - Workbook export: clean by default; a `--with-examples` option builds a training copy with TRAINING in the file name.
5. **G5 Phone numbers lose their leading zero.** Front Desk C10 is formatted General, while New Inward C17 and Registry Intake C22 are text. Front Desk Log K6 saved Verge Power's phone as 8021846578.
    - App: store phones, CAC numbers, TINs and references as strings. Use one phone validator everywhere: 11 digits starting with 0, or +234 and 10 digits, ignoring spaces and dashes.
    - Import: restore 08021846578 for Verge Power and list it in the import report for confirmation.
    - Workbook export: text-format every phone, CAC, TIN and reference cell.
6. **G6 Officer names are typed.** Front Desk Log M6 "Received by" is "[Front desk officer 1]", though Registry Lists names Funmilayo Sorungbe and Aliu Funmilola as front desk staff.
    - App: every "Received / Released / Dispatched / Recorded by" field comes from the logged-in user.
    - Import: keep the placeholder and flag it. Don't guess who it was.
7. **G7 Routing is restricted by a name pick.** The Routing PIN column in Registry Lists is empty.
    - App: a Router role, enforced on the server. Today that is Oluwatoyin Sonoiki (Secretary to the Commission) and Adetola Salami (Head of Administration). Anyone else gets 403.
8. **G8 Separation of duties is only a reminder.** Guide row 9 says the buttons compare typed names.
    - App: enforce on the server that approver, evaluator, supervisor and the person who saved the submission are four different people, and that Finance cannot confirm or reject a payment they recorded. Return every blocking reason at once, as the workbook buttons do.
9. **G9 Email depends on desktop Outlook, and most addresses are missing.** Acknowledgement emails use `Outlook.Application` in Display mode. Only one unit email (it@ogserc.org.ng) and two of five division emails (engineeringstandards@ogserc.org.ng, empr@ogserc.org.ng) are filled.
    - App: send through an email adapter whose provider is set by environment variables. Build a dev transport that logs to the console plus one real provider behind the same interface. Keep "preview before sending" as an option.
    - App: an admin screen for unit and division addresses. When an address is missing, warn on save and log "Not emailed: no address" on the item.
10. **G10 The workbook build can't be traced.** Settings B50 says "39f98f8+local changes".
    - App: show the deployed commit (`VERCEL_GIT_COMMIT_SHA`) in the admin footer.
    - Workbook export: stamp the clean commit hash and build time, and refuse to build from uncommitted changes.
11. **G11 Leftover two-workbook code.** `RX_NextAck` still looks for a partner correspondence workbook (`RX_Partner`, `RegLink_MaxInwardSerial`) and can prompt "SYNC WITH CORRESPONDENCE REGISTRY".
    - App: don't port it. One numbering service covers everything.
    - Workbook export: no partner-workbook code.
12. **G12 Numbering isn't safe for several users.** `AssignNumber` takes the highest number on the sheet plus one. That works in one file and breaks with many users at once.
    - App: issue every series (ACK, FD, OUT, PAY, OUN, DEF, REG, file references) from a counters table inside a database transaction with row locking. Numbers are per year, locked once issued and never reused, even when a record is cancelled.
13. **G13 "Today" is the computer's date.** Guide row 15 says so. Deemed receipt uses a 17:00 cut-off, weekends and the holiday list in Registry Settings rows 21–36, several marked "Estimated" or "Provisional".
    - App: compute dates in Africa/Lagos on the server. Holidays are admin-editable with a status. Keep a test-only today override (like `APP_TODAY`) that is disabled in production.
14. **G14 The late charge exceeds the Order's cap.** The Register "Late Charge" formula is `initial + MIN(daily × days late, cap)`, so the cap limits only the daily part. The Order caps the whole late charge: `MIN(initial + daily × days late, cap)`. Category D, 100 days late: the workbook gives ₦10,500,000; the Order gives ₦10,000,000.
    - App: late charge = `min(initial + daily × days late, cap)`. The Order overrides the workbook (`docs/SPEC.md` §8.2).
    - Workbook export: write the Late Charge column as `MIN(initial + daily × days late, cap)`, and check it against the category D, 100-days-late case when the workbook is built.

## Modules and roles

The sidebar has one entry per module below. Every module is built new in this project.

| Module | What it does | Replaces |
| --- | --- | --- |
| Dashboard | Registry counters (received today, awaiting routing, overdue, files out) beside registration figures by category, status, activity and LGA | Registry Desk counters, Dashboard, Registry Dashboard |
| Front desk | Log a delivered document, give it an FD number, list items awaiting registry | Front Desk, Front Desk Log |
| Registry intake | Pull a front desk item, issue the ACK, and create its Register or Own-Use entry under the same number | Registry Intake |
| Inward | Log other incoming items, deemed receipt (para 10(3)), acknowledgement slip, item history | New Inward, Inward Register, Update Item |
| Routing | Set unit, action, priority, action officer and response due | Routing Desk |
| Outward | Number letters before signature, record dispatch and delivery, link replies to inward items | New Outward, Outward Register |
| Files | File index, issue, return, new file, overdue files | File Desk, File Index, File Movement |
| Pending actions | Open inward items by unit, with overdue flags | Pending Actions |
| Register | Submissions, category, fees, late charges, clocks, flags | Register |
| Payments and Finance | Record, confirm, reject, reverse; the Finance gate | Payments, Finance Desk |
| Documents | Schedule 2 checklist per form | Documents |
| Evaluation | EVAL-01 checks and decisions | Evaluation |
| Own-use | REG-01I notifications | Own-Use |
| Reports | Acknowledgement slip, Daily Register, pending actions as PDF | Acknowledgement Slip, Daily Register |
| Audit log | Every action across both modules, append-only | Audit Log |
| Admin | Settings, fee table, lists, units and emails, holidays, staff and roles, signatories | Settings, Lists, Registry Settings, Registry Lists |

A user can hold several roles, but the separation-of-duties rules in G8 still apply to each record. Seed the people below from the workbook and flag them for Kamiye to confirm.

| Role | Can do | People in the workbook |
| --- | --- | --- |
| Front desk officer | Log delivered documents | Funmilayo Sorungbe, Aliu Funmilola |
| Registry officer | Intake, inward, outward, update, dispatch, files, slips, Daily Register, record payments | Olanrewaju Oluyombo, Abiodun Sodipo |
| Router | Route incoming items | Oluwatoyin Sonoiki, Adetola Salami |
| Unit officer | See items routed to their unit, confirm receipt, close | To be set per unit |
| Evaluating officer | Complete EVAL-01 checks | To be set |
| Reviewing supervisor | Review evaluations | To be set |
| Approving officer | Approve, refuse, lapse | To be set |
| Finance officer | Record, confirm, reject and reverse payments | To be set |
| Admin | Everything in Admin, run the daily review | Kamiye (ICT) |
| Viewer | Dashboards and registers, read-only | Management, as needed |

## Vercel deployment

Deploy as one Vercel Pro project. Nothing may depend on a local disk, desktop Office or a machine being switched on.

- **Database.** A new Vercel project with a new Postgres database from the Vercel Marketplace (Neon). Don't reuse the registration app's project or database. Use the pooled connection string for app traffic and the direct one for migrations. Run migrations as a deploy step, never on a cold start.
- **Region.** Pick the database region closest to Lagos that the provider offers (likely Europe), and set the Vercel function region to the same place.
- **Daily review.** A Vercel Cron Job calls a protected route that checks `CRON_SECRET`. Cron runs in UTC, so `0 6 * * *` is 07:00 in Lagos. Make it run at most once per Lagos date, log each run to the audit log, and keep a "Run daily review now" button for admins.
- **PDFs.** Generate acknowledgement slips, the Daily Register and pending-action lists on request in a route handler and stream them to the browser. If a PDF must be kept (for example a slip emailed to a filer), store it in Vercel Blob with private access. Never write to the local filesystem.
- **Long jobs.** Keep requests short. Run the workbook import and register exports in chunks.
- **Auth.** Staff accounts with roles, using the approach agreed in Phase 0. Turn on Deployment Protection for preview deployments.
- **Previews.** Each preview gets its own database branch with seed data, never production data.
- **Environment variables.** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `CRON_SECRET`, `EMAIL_PROVIDER` and its keys, `EMAIL_FROM`, and `APP_TODAY` (development only).
- **Backups.** Rely on the database's point-in-time restore. Add an admin "Export registers" button (CSV and .xlsx) in place of the workbook's "Back up workbook now".
- **Domain.** A subdomain of ogserc.org.ng. Prepare the DNS records for whoever manages that domain.

## Build phases

Work in seven phases (0 to 6), plus an optional Phase 7. After each, stop, summarise what changed and what comes next, and wait for "Go to Phase N".

1. **Phase 0 — Spec and plan, no code.** Read the workbook and its VBA. Write `docs/SPEC.md` covering both modules: data model, number series, categories and the activity map, fees and late charges, deadlines and clocks, the Finance gate, documents per form, the EVAL-01 checks, workflow states and every registry flow. Write `docs/PLAN.md` (architecture, schema, ORM, auth, screen list) and `docs/QUESTIONS.md` (anything unclear). List which workbook records are real and which are EXAMPLE.
2. **Phase 1 — Scaffold and foundations.** The Next.js project, database and migrations, auth and roles (G6–G8), unified settings (G1), the numbering service (G12), Lagos time and holidays (G13), shared validators (G5), the append-only audit log, the app shell (sidebar, dark mode), tests in CI and a first preview deployment on Vercel.
3. **Phase 2 — Registration module.** Register and submission intake, category and pricing snapshot, fees and late charges, the Documents checklist, Payments and the Finance gate, the EVAL-01 evaluation and its decisions (complete, deficiency, approve, provisional, lapse, refuse, cancel), Own-use and signatories (G3).
4. **Phase 3 — Registry module.** Front desk, registry intake creating Register or Own-Use entries under the same ACK, inward, routing, update, forward and close, outward with dispatch and delivery, files and movements, and pending actions.
5. **Phase 4 — Outputs and automation.** Acknowledgement slip and Daily Register PDFs, the email adapter (G9) and the daily review cron.
6. **Phase 5 — Dashboard and admin.** The combined dashboard, the admin screens and register exports.
7. **Phase 6 — Import and go-live.** Import the real record from the workbook with an import report. Run every test. Set up production on Vercel (cron, environment variables, region, domain).
8. **Phase 7 — Offline workbook export (optional).** Only if Kamiye asks for it: a script that generates a macro-enabled .xlsm mirror of the app's rules, meeting every "Workbook export" note above.

## Acceptance checks

The build is done only when every check below passes as an automated test, or is shown working on a preview deployment.

- [ ] Changing the Effective Date in one place moves the global registration deadline, the inward "Filed after registration deadline?" flag and every not-yet-priced record in both modules. Saved submissions keep their frozen pricing and are flagged "pricing out of date", and an admin's one-click "Recalculate all open submissions" (reason required, logged on each submission) moves their deadlines too. (Updated 6 Nov 2026, Q6.)
- [ ] 20 parallel saves get 20 consecutive ACK numbers, with no duplicates.
- [ ] A registry inward item and a direct Register entry draw from the same ACK series.
- [ ] Phone 08021846578 is saved and shown with its zero; 8021846578 is rejected with a clear message.
- [ ] An email item received at 17:30 on Friday 18 Dec 2026 is deemed received Monday 21 Dec.
- [ ] An email item received at 18:00 on Thursday 24 Dec 2026 is deemed received Tuesday 29 Dec (25, 26 and 28 Dec are holidays).
- [ ] A hand delivery received at 16:00 on Friday 18 Dec 2026 is deemed received that day. (The 17:00 cut-off applies to email and portal items only; Q1, 6 Nov 2026.)
- [ ] A category D new registration 100 days late has a late charge of ₦10,000,000, not the workbook's ₦10,500,000 (G14).
- [ ] Approving a new registration is refused while the Commissioner signatory is empty, and the reason is shown.
- [ ] A Finance officer gets 403 confirming a payment they recorded, including through a direct API call.
- [ ] A user without the Router role gets 403 on routing.
- [ ] The daily review cron triggered twice on one Lagos date runs once.
- [ ] Production has no EXAMPLE records; previews do.
- [ ] Saving an item for a unit with no email address shows a warning and logs "Not emailed: no address".
- [ ] Worked examples of the fee, late-charge, category and deadline rules pass as tests for every category from A to K.
- [ ] If Phase 7 is built, the generated workbook has one Effective Date, names in the staff lists, text phone cells, no EXAMPLE rows, a clean commit hash, no partner-workbook code and the G14 late-charge formula.

## Open questions for the Commission

None of these block the build. Make each one a setting or an admin-editable list, and leave a clear placeholder until it is answered.

- Whether this app replaces the Registration & Evaluation app and the registry app once it is live, or runs alongside them. If they all run, each keeps its own register and their ACK numbers will overlap.
- The gazetted Effective Date of the Order.
- The Commissioner's name, and confirmation that Jide Onakoya is the "Chairman / CEO" signatory.
- The email provider and the missing unit and division addresses. Resend is the simplest on Vercel; Microsoft Graph fits if the ogserc.org.ng mailboxes run on Microsoft 365.
- Whether hosting Commission data on servers outside Nigeria is acceptable under the Nigeria Data Protection Act 2023.
- The holiday dates marked "Estimated" or "Provisional" in Registry Settings.
- The TIN format, which Finance has not confirmed.
- The undecided policy settings in Settings rows 33–42. Settings B35 says data flags don't block approval, but its note says another app has this on. Decide which before Phase 2.
- The names of the evaluating, supervising, approving and Finance officers.
