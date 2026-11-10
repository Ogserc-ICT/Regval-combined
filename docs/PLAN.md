# OGSERC Registry & Evaluation — Plan

Phase 0 · 5 Nov 2026 · companion to `docs/SPEC.md` (rules) and `docs/QUESTIONS.md` (open points).

## 1. Decisions to approve

| Area | Proposal | Why |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router), TypeScript strict, React Server Components, Server Actions for forms, route handlers for PDFs, exports, cron. **Cache Components off** (`cacheComponents: false`): every page is signed-in and must show current register data, so pages render per request (decided in Phase 1). Next.js 16 calls middleware "proxy" (`src/proxy.ts`). | Fixed by the brief |
| Database | PostgreSQL on Neon via the Vercel Marketplace; new project and database | Fixed by the brief |
| ORM | **Drizzle ORM** with the `node-postgres` driver | SQL-first, typed, thin; real interactive transactions and `SELECT … FOR UPDATE` for the counters; no query engine binary; easy to drop to raw SQL for triggers and reports |
| Migrations | **drizzle-kit** generating plain SQL files, committed and reviewed; hand-written SQL migrations for triggers, grants and constraints; applied by `drizzle-kit migrate` as a Vercel build step against `DATABASE_URL_UNPOOLED` | Migrations never run on a cold start |
| Auth | **Better Auth**: email + password (Better Auth's scrypt hashing), database sessions (12 hours), admin-created accounts only (sign-up and self-service account endpoints disabled), forced password change on first sign-in, sign-in rate limit (5 a minute). Optional TOTP two-factor can be added later. A Microsoft Entra ID provider can be added later without schema change (Q18) | Staff-only; works on Vercel with Postgres; sessions are revocable rows; no third-party identity service needed on day one |
| Authorisation | Our own `user_roles` table and one `authorize(user, action, record)` function called by every server action and route handler; UI hides what the server would refuse | **[G6–G8]** on the server |
| Validation | Zod schemas shared by forms and server actions | One validator per field type (phone, CAC, email) **[G5]** |
| Dates | `date-fns` + `@date-fns/tz`; one `lagos` module that owns "now", "today", working days and deemed receipt; `APP_TODAY` honoured outside production only | **[G13]** |
| Money | Integers in kobo (`bigint`), formatted at the edge | No floating-point rounding |
| UI | Tailwind CSS, shadcn/ui (Radix primitives), lucide icons, `next-themes` (dark by default), TanStack Table for registers, Recharts for dashboard charts | Premium dashboard look, one design system for both modules |
| PDFs | `@react-pdf/renderer` in Node route handlers, streamed; slips kept for email stored in Vercel Blob (private) | No local disk, no Office |
| Exports | CSV and `.xlsx` (`exceljs`), generated in chunks and streamed | Replaces "Back up workbook now" |
| Email | `EmailTransport` interface with `console` (dev) and `resend` providers, chosen by `EMAIL_PROVIDER`; a `graph` provider can be added behind the same interface (Q19) | **[G9]** |
| Cron | Vercel Cron `0 6 * * *` → `/api/cron/daily-review` with `CRON_SECRET` | 07:00 Lagos |
| Tests | Vitest (domain unit tests, worked examples), Vitest + real Postgres for service and concurrency tests, Playwright for a few end-to-end role checks; GitHub Actions with a Postgres service container | Acceptance checks run in CI |
| Hosting | Vercel Pro, one project; function region and Neon region London (`lhr1` / `aws-eu-west-2`) if Neon offers it, else Frankfurt (`fra1` / `aws-eu-central-1`) | Closest to Lagos; confirm in Phase 1 (Q20) |

## 2. Architecture

```
app/ (routes, RSC pages, server actions, route handlers)
   │  calls
   ▼
src/server/services/   one service per use case: authorize → validate → transaction → audit → side effects
   │  uses                                   │ enqueues
   ▼                                         ▼
src/domain/   pure functions, no I/O         src/server/email, pdf, blob
   (category, fees, deadlines, documents,
    checks, flags, statuses, deemed receipt,
    working days, gate, next action)
   ▲
src/server/db/  Drizzle schema, queries, numbering service, audit writer
```

- **Domain layer is pure.** Every workbook formula in `SPEC.md` becomes a pure TypeScript function taking a plain record, its related rows, settings, reference data and "today". The same functions feed screens, PDFs, the dashboard, the daily review and exports, so one rule is never written twice. Worked examples in `SPEC.md` §30 are its tests.
- **Stored vs derived.** Stored: inputs, values set by actions, numbers, snapshots, and the deemed receipt date (frozen at save, since the holiday list can change later). Derived on read: everything green in the workbook (balances, flags, statuses of inward/outward items, SLA, counts). Volumes are small (a few thousand rows a year), so registers compute derived fields in the service layer per page; the dashboard uses SQL aggregates for counts plus domain functions where a rule is needed. If a list grows slow, a derived column is materialised and refreshed in the same transaction as its inputs.
- **Service pattern.** Every mutation is one function: `authorize` (role + record rules, returns 403 with every reason) → Zod validation (422 with every field error) → domain checks (409 with every blocking reason) → one DB transaction (writes, numbers, audit rows) → after commit: email and Blob uploads (failures recorded on the item, never rolled back into the transaction).
- **Numbering service** (§4).
- **Audit writer** inside the same transaction (§5).
- **Server-only time.** "Today" never comes from the browser.
- **Errors.** Blocked actions return a list, shown together, as the workbook buttons do.

## 3. Database schema

Postgres naming: snake_case tables, `id uuid` primary keys (except reference tables keyed by code), `created_at`/`updated_at timestamptz`, `created_by`/`updated_by` user ids. Every record table that can hold EXAMPLE data has `is_example boolean not null default false`. Text for every phone, CAC, TIN and reference **[G5]**.

### 3.1 Identity and access

| Table | Key columns |
| --- | --- |
| `users` | id, name, email (unique), active, must_change_password, unit_id (for unit officers), created_by, is_seeded_unconfirmed |
| `sessions`, `accounts`, `verifications`, `two_factors` | Better Auth tables |
| `user_roles` | user_id, role (enum: front_desk, registry, router, unit_officer, evaluator, supervisor, approver, finance, admin, viewer); unique (user_id, role) |

### 3.2 Settings and reference data

| Table | Key columns |
| --- | --- |
| `settings` | key (pk), value jsonb, updated_by, updated_at. Typed by one Zod schema; audited on change |
| `holidays` | date (pk), name, status (fixed, provisional, estimated, state) |
| `signatories` | id, name, designation, signatory_role (chairman_ceo, commissioner, secretary, other), active, confirmed |
| `divisions` | id, name (unique), email (nullable) |
| `units` | id, name (unique), division_id, unit_group, email (nullable), active |
| `lgas` | name (pk), in_ogun |
| `fee_schedule` | category (A–K), version, effective_from, registration_fee, late_initial, late_daily, late_cap (kobo), description, late_tier |
| `activities` | code (pk), name, cat_10mw_plus, cat_1_to_10mw, cat_below_1mw, capacity_based |
| `forms` | form (pk, REG-01A…K), category, title, order_para |
| `form_documents` | form, key, no, document, required_when (condition key, nullable); pk (form, key) |
| `document_conditions` | key (pk), question |
| `eval_checks` | id (pk, '1.1'…'9.7'), stage, text, rule_text, kind (auto, manual), applicability (always, ms, lic, unlic, docs, nonco, waiver, new), post_approval |
| `correspondence_types` | id, name (unique), category, default_unit_id, order_ref, response_target_days, para_10_3_wording, filing_type (nullable), active |
| `outgoing_document_types` | id, name, response_expected, response_days, active |
| `file_classes` | id, name, code (unique) |
| `list_items` | list_key, value, sort, active, meta jsonb; for simple drop-downs (modes with register channel, sender categories, actions, priorities, ack-via, security, file status, registrant types, licence statuses, payment channels and purposes, fuels, refusal grounds, filing types) |

### 3.3 Numbering, audit, jobs

| Table | Key columns |
| --- | --- |
| `counters` | series (ACK, FD, OUT, PAY, OUN, DEF, REG, FILE), year (0 for unyeared), scope ('' or file class code), last_value; pk (series, year, scope) |
| `audit_log` | id bigserial, at, user_id, user_name, action, module, entity_type, entity_id, reference, detail, data jsonb, prev_hash, hash |
| `daily_review_runs` | lagos_date (pk), started_at, finished_at, trigger (cron, manual), user_id, summary jsonb |
| `email_messages` | id, kind, entity_type, entity_id, to, cc, subject, body, attachment_blob_keys, status (preview, queued, sent, failed, skipped_no_address), provider_message_id, error, created_by, sent_at |
| `import_runs` | id, started_at, source_file, report jsonb (Phase 6) |

### 3.4 Registry

| Table | Key columns |
| --- | --- |
| `front_desk_items` | id, fd_no (unique), fd_year, received_at, sender, subject, correspondence_type_id, mode, delivered_by, phone, volumes, received_by_user_id, received_by_placeholder (import only), remarks, inward_item_id, registered_at, is_example |
| `inward_items` | id, ack_no (unique), ack_year, received_at, mode, deemed_receipt_date, correspondence_type_id, sender, sender_category, sender_ref, document_date, subject, cac_no, related_ogserc_no, in_response_to_outward_id, lga, contact_person, phone, email, delivered_by, volumes, schedule2_count, fee_evidence, payment_reference, amount_shown_kobo, received_by_user_id, ack_issued_via, file_id, unit_override_id, action_required, priority, action_officer, response_due_override, routed_by_user_id, routed_at, forwarded_on, unit_officer_received_by, unit_received_at, closed_manual_on, ack_emailed_to, ack_emailed_at, front_desk_item_id, source (new_inward, registry_intake, register_direct, own_use_direct, import), remarks, is_example |
| `outward_items` | id, out_no (unique), out_year, document_date, document_type_id, subject, addressee, recipient_category, recipient_contact, related_ogserc_no, in_reply_to_inward_id, file_id, originating_unit_id, prepared_by, signatory_id, signatory_name, signatory_designation, dispatch_mode, dispatched_on, dispatched_by_user_id, tracking_ref, delivery_confirmed, delivered_on, received_by_recipient, response_expected (nullable = type default), response_due_override, remarks, is_example |
| `files` | id, file_ref (unique), title, file_class_id, owning_unit_id, opened_on, current_volume, security, status, closed_on, remarks, is_example |
| `file_movements` | id, file_id, out_at, volume, released_by_user_id, issued_to, unit_id, purpose, return_by_override, returned_at, received_back_by_user_id, remarks, is_example |

Constraint: an FD item links to at most one inward item (unique `inward_item_id`). Inward items keyed by ACK; submissions and own-use rows reference `inward_item_id` (unique), which gives "one ACK, one filing".

### 3.5 Registration

| Table | Key columns |
| --- | --- |
| `submissions` | id, inward_item_id (unique), ack_no (unique), status (nullable = draft), filing_type, form_filed, linked_submission_id, linked_registration_no, registered_name, trading_name, date_submitted, submission_channel, registrant_type, cac_no, tin, registered_address, principal_lga, other_lgas, towns_estates, primary_activity_code, installed_capacity_mw numeric, customers, licence_status, compliance_officer, phone, email, operating_on_effective_date, planned_start_date, approved_waiver_kobo, category_override, override_reason, 8 condition columns (nullable boolean; holds_any_licence derived), form_sections_not_complete, capacity_in_sections_mw, confirmed_category, category_confirmed_reason, released_on, date_submission_complete, deficiency_notice_date, show_cause_date, certificate_issue_date, registration_no (unique), certificate_needs_reissue, remarks, created_by, saved_at, priced_category, priced_fee_kobo, priced_late_initial_kobo, priced_late_daily_kobo, priced_late_cap_kobo, priced_deadline, priced_effective_date, priced_fee_version, front_desk_item_id, is_example |
| `submission_other_activities` | submission_id, position, activity_code |
| `submission_licences` | submission_id, position, licence_no, expiry_date |
| `deficiency_notices` | id, submission_id, def_no (unique), issued_on, response_due, documents_outstanding, balance_kobo, checks_failed, issued_by |
| `evaluations` | submission_id (pk), evaluating_officer_id, reviewing_supervisor_id, approving_officer_id, started_on, flag_override_reason, final_decision, reasons, review_date, approval_date, remarks |
| `evaluation_answers` | submission_id, check_id, value (Y, N, NA), answered_by, answered_at; manual checks only |
| `document_checklist` | id, owner_type (submission, own_use), owner_id, form, key, value (Y, N, NA, null), remarks, updated_by, updated_at; unique (owner_type, owner_id, key) |
| `payments` | id, pay_no (unique), date_received, owner_type, owner_id, reference (ACK or OUN, denormalised), purpose, channel, amount_kobo (> 0), rrr, recorded_by, recorded_at, finance_status (pending, confirmed, rejected), verified_with_bank, decided_by, decided_at, finance_remarks, reversed, reversed_by, reversed_at, reversal_reason, is_example |
| `own_use_notifications` | id, inward_item_id (unique), ack_no, oun_no (unique, null until saved), name, date_filed, cac_no, site_address, lga, nature_of_business, grid_connected, distribution_licensee, contact_person, phone, email, flag_override_reason, remarks, created_by, priced_fee_kobo, priced_threshold_kw, registration_no (unique), certificate_issue_date, registered_by, front_desk_item_id, is_example |
| `own_use_units` | notification_id, position, make_model, kw numeric, fuel, avg_mwh |

Database-level guards (hand-written migrations): payments cannot be updated except the Finance decision and reversal columns, and only from Pending / not reversed; numbers (`ack_no`, `fd_no`, `out_no`, `pay_no`, `oun_no`, `registration_no`, `def_no`, `file_ref`) cannot change once set; nothing in the registers can be deleted by the app role.

## 4. Numbering service **[G12]**

```ts
issueNumber(tx, series, { year, scope }) → string
  INSERT INTO counters (series, year, scope, last_value) VALUES ($1,$2,$3,0)
    ON CONFLICT DO NOTHING;
  UPDATE counters SET last_value = last_value + 1
    WHERE series=$1 AND year=$2 AND scope=$3
    RETURNING last_value;          -- row lock held until the transaction ends
  format(series, year, scope, last_value)
```

- Always called with the transaction that saves the record, so a failed save releases nothing, and a committed number is never reissued.
- 20 parallel saves → 20 consecutive numbers (acceptance test runs 20 concurrent transactions against real Postgres).
- One ACK counter for New Inward, Registry Intake and direct Register / Own-Use entries.
- A cancelled, refused or lapsed record keeps its number.
- Typed file references (overtyped by the officer) do not move the counter; generated ones skip any reference already in use.

## 5. Audit log

- Written by `audit(tx, {...})` inside each service transaction.
- `prev_hash`/`hash` (SHA-256 of the previous hash + row content) make tampering detectable; an admin "Verify audit chain" check runs in the daily review.
- A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_log`; the app's database role also lacks those privileges.
- Before/after values stored in `data` give each record's history page.

## 6. Auth and roles

- Accounts are created by an admin (name, email, roles, unit). The user gets a one-time set-password link by email (console transport in development) or a temporary password shown once to the admin.
- Sessions: database rows, 12-hour limit, signed out after `idleMinutes` without activity (default 4; Phase 8c, §11f), revocable by admin. Sign-in, sign-out and failed attempts audited.
- `requireUser()` on every page and action; `authorize()` checks roles and record rules and returns every reason. The UI uses the same function to hide buttons, but the server is the gate. Route handlers (PDFs, exports, cron) apply the same checks; cron uses `CRON_SECRET` only.
- Seed: the people named in `SPEC.md` §27.1, created inactive-until-confirmed ("flag for Kamiye to confirm"), with Kamiye as the first active admin (email from an environment variable, never hard-coded). No other names in code **[G2, G6]**.
- Preview deployments are behind Vercel Deployment Protection in addition to app sign-in.

## 7. Screens

Sidebar (dark by default, collapsible; light mode available): one entry per module; entries hidden when the user has no role for them. Top bar: global search by any number (ACK, FD, OUT, PAY, OUN, REG, file ref) or name; user menu; theme toggle. Admin footer shows the deployed commit (`VERCEL_GIT_COMMIT_SHA`) **[G10]**. Effective Date placeholder banner for admins **[G1]**.

| Module | Screens |
| --- | --- |
| Dashboard | Registry counters; registration figures by category, status, activity, LGA, month; money; work queues (awaiting payment, Finance queue, overdue deficiency responses, ready for decision, my evaluations, awaiting routing, items for my unit) |
| Front desk | Log a document (form); Awaiting registry list; FD item page |
| Registry intake | Intake form with "pull from front desk" and "pull acknowledged filing" pickers; list of acknowledged filings without a saved Register entry |
| Inward | New inward (with front-desk pull); Inward Register (filters: status, unit, type, date, flags; EXAMPLE badge); item page (details, deemed receipt, status, response due, linked reply, slip, email log, history, update / forward / close actions) |
| Routing | Routing queue (awaiting routing first); route form on the item page (Router only) |
| Outward | New outward (get number); Outward Register; item page (dispatch, delivery, response tracking) |
| Files | File Index; file page (movements, linked correspondence); new file; issue; return; overdue files |
| Pending actions | List by unit with overdue flags; PDF |
| Register | Register list (filters: status, category, filing type, SLA, flags, payment status); new submission form; submission page with tabs: Summary (category, fees, deadlines, next action, flags), Details, Documents, Payments, Evaluation, History; action bar showing allowed actions and blocking reasons |
| Payments and Finance | Payments ledger; record payment; Finance Desk (pending, oldest first) with confirm / reject; reverse |
| Documents | Per-submission checklist (also a tab); cross-submission outstanding-documents view |
| Evaluation | EVAL-01 form per submission: officers, checks by stage (auto values greyed), counts, recommended outcome, approval blockers, decision buttons; my evaluations |
| Own-use | Own-use list; notification form with generator units; notification page; register with certificate (when enabled) |
| Reports | Acknowledgement slip (by ACK), Daily Register (by date), pending actions (by unit) as PDF |
| Audit log | Filterable, read-only; per-record history links |
| Admin | Settings (grouped, with notes and sources); fee table (versioned); activity map; forms and documents; evaluation checks (read-only text); correspondence and document types; units and divisions with emails (missing addresses highlighted); file classes; simple lists; holidays (with status); users and roles; signatories; run daily review now and run history; export registers (CSV / .xlsx); audit chain check; import (Phase 6) |

Every number displayed is a link to its record. Every date shown is Lagos time.

## 8. Project layout

As built in Phase 1, `app/` lives at `src/app/`, sign-in is `src/app/sign-in`, the first-sign-in password page is `src/app/account/password`, and the seed is `seed/seed.ts` with data in `seed/data/`.

```
app/
  (auth)/sign-in
  (app)/layout.tsx              sidebar shell
  (app)/dashboard
  (app)/front-desk, registry-intake, inward, routing, outward, files, pending
  (app)/register, payments, finance, documents, evaluation, own-use
  (app)/reports, audit, admin/...
  api/cron/daily-review/route.ts
  api/pdf/slip/[ack]/route.ts, api/pdf/daily-register/route.ts, api/pdf/pending/route.ts
  api/export/[register]/route.ts
src/
  domain/          pure rules + tests (category.ts, fees.ts, deadlines.ts, documents.ts, checks.ts,
                   flags.ts, workflow.ts, registry.ts, deemed.ts, workdays.ts, validators.ts, money.ts)
  server/
    db/            schema/*.ts, client.ts, migrations/
    services/      one file per use case group
    auth/          better-auth config, authorize.ts, roles.ts
    numbering.ts, audit.ts, lagos.ts, settings.ts
    email/         transport.ts, console.ts, resend.ts, templates/
    pdf/           slip.tsx, daily-register.tsx, pending.tsx
    blob.ts
  components/      ui (shadcn), data-table, forms, shell
seed/              reference.ts (all environments), examples.ts (dev/preview only), people.ts
tests/             integration (Postgres), e2e (Playwright)
```

## 9. Environments and deployment

- **Local**: Postgres in Docker (or a Neon dev branch), `.env.local`, `EMAIL_PROVIDER=console`, `APP_TODAY` allowed, seed with examples.
- **Preview**: a Neon branch per preview via the Vercel–Neon integration, migrated and seeded with reference data + EXAMPLE rows; Deployment Protection on.
- **Production**: migrations as a build step; reference data seed (idempotent); never EXAMPLE rows (guard checks `VERCEL_ENV`); cron enabled; region pinned; custom subdomain of ogserc.org.ng (DNS records prepared for whoever manages the domain).
- **Environment variables**: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `CRON_SECRET`, `EMAIL_PROVIDER`, provider keys, `EMAIL_FROM`, `BLOB_READ_WRITE_TOKEN`, `BOOTSTRAP_ADMIN_EMAIL`, `APP_TODAY` (development and preview tests only).
- **Backups**: Neon point-in-time restore; admin "Export registers" (CSV and .xlsx).

## 10. Testing and acceptance

| Acceptance check (brief) | Test |
| --- | --- |
| One Effective Date moves every deadline (as updated for Q6) | Domain + service test: change setting, assert global deadline, inward flag, unpriced record deadline, PRICING_OUT_OF_DATE on saved ones; then "Recalculate all open submissions" moves them and writes one audit entry each with the reason |
| 20 parallel saves → 20 consecutive ACKs | Integration: 20 concurrent transactions on real Postgres |
| Inward item and Register entry share the ACK series | Integration: interleave New Inward, Registry Intake and direct saves |
| Phone 08021846578 kept; 8021846578 rejected clearly | Validator unit test + form round-trip |
| Email 17:30 Fri 18 Dec 2026 → Mon 21 Dec | `deemed.ts` test |
| Email 18:00 Thu 24 Dec 2026 → Tue 29 Dec | `deemed.ts` test |
| Hand delivery 16:00 Fri 18 Dec 2026 → same day | `deemed.ts` test |
| Category D, 100 days late → ₦10,000,000 (G14) | `fees.ts` test |
| Approval refused while Commissioner empty | Service test: reason listed |
| Finance 403 confirming own payment, incl. direct API | Service test + Playwright direct POST |
| Non-Router 403 on routing | Service test + Playwright direct POST |
| Daily review twice on one Lagos date runs once | Integration: two concurrent triggers |
| Production has no EXAMPLE records; previews do | Seed guard test + check on preview |
| Unit with no email → warning and "Not emailed: no address" | Service test |
| Worked examples A–K | `SPEC.md` §30 tables as table-driven tests |

CI: typecheck, lint, unit, integration (Postgres service), e2e against a built app; required on pull requests.

## 11. As built in Phase 2

- Reference data (fee table, activities, forms, 124 form documents, 63 checks, lists, units, divisions, correspondence types, signatories) is extracted straight from the workbook into `seed/data/reference.json` and seeded idempotently.
- Submissions store activity **codes** (SDC, GEN …), not names. Other activities and licences are child rows with no fixed limit.
- `src/domain/registration/assess.ts` computes every calculated column of the Register and EVAL-01 for one submission; `assessMany` does the same for lists with a fixed number of queries. A test checks both agree.
- Every evaluation action behind the Finance gate audits a blocked attempt in its own transaction, so it survives the refusal.
- Database guards (migration 0003): register rows cannot be deleted; ACK, OUN, PAY, DEF and REG numbers cannot change once issued; a payment's facts cannot change after recording; Finance decisions and reversals are final.
- `all(db, thunks)` runs independent queries in parallel on the pool but one at a time inside a transaction (one connection).
- Not built yet (Q14): the acknowledgement letter, deficiency notice, EVAL-01 and CERT-01 documents.

## 11a. As built in Phase 3

- Tables (migration 0004): `front_desk_items`, `outward_items`, `files`, `file_movements`; `users.unit_id` for unit officers; foreign keys from inward items to their front-desk item (unique, so an FD item is registered once), file and "in response to" outward item.
- Guards (migration 0005): registry rows cannot be deleted; FD, OUT and file reference numbers cannot change once issued; an FD item's link to its inward item and a file movement's facts (out time, holder, unit, returned time) are locked once set.
- `src/domain/registry.ts` holds every Registry calculation (response due, status, working days, flags, Register entry state, outward status and flags, file movement status, "currently with", email recipients). The services in `src/server/services/registry/` (front desk, inward, intake, outward, files, load) call it; nothing derived is stored.
- Registry Intake runs in one transaction: ACK (or the pulled item's ACK), inward item, front-desk link, then the Register or Own-Use row. The Register save runs in a savepoint: when it cannot be saved yet, the row stays "started" with the reasons shown, and the intake still succeeds. Started rows are completed on the submission or own-use page, keeping their ACK; the OUN is issued when the own-use row is saved.
- Two inward flags cannot occur in the app because the save refuses the cause: "our ref not found in Outward" (the OUT number must exist) and "file ref not in File Index" (routing and outward items must quote a file that exists). The Schedule 2 flag follows the Q16 default: it compares the count entered with the documents on the Schedule 2 list of the form filed, once the Register or Own-Use entry gives the form; no flag before that.
- Emails ([G9]): the adapter and sending arrive in Phase 4. The "no address" rule is live: when the unit and its division have no email, New Inward, Registry Intake and routing warn and the item's history records "Not emailed: no address". With `ackEmailMode = Off` nothing is checked.
- Confirm receipt and close are open to a unit officer only for items routed to their own unit (Q17 default); the Registry can close any item. Forwarding before routing asks for confirmation.
- File references: generated per class (`OGSERC/{code}/{nnn}`), never yearly (Q5 default); a typed reference must be unique, and the generator skips any number already typed in.
- Not built yet (Phase 4): acknowledgement slip, Daily Register and Pending actions PDFs; sending emails; the daily review.

## 11b. As built in Phase 4

- Tables (migration 0006): `daily_review_runs` (one row per Lagos date) and `email_messages` (every acknowledgement and routing email: preview, queued, sent, failed, discarded).
- PDFs: `@react-pdf/renderer` in Node route handlers, rendered on request: `/api/pdf/slip/[id]` and `/api/pdf/daily-register?date=` (Registry officer, admin), `/api/pdf/pending?unit=` (anyone signed in; unit officers default to their unit). Built-in Helvetica has no naira sign, so PDFs print "NGN".
- Email adapter (`src/server/email/transport.ts`): `console`, `resend` (HTTP API, no SDK) and `memory` (tests), chosen by `EMAIL_PROVIDER`. Emails are queued in the save's transaction and delivered after commit; the slip PDF is attached and kept in Vercel Blob (private) when `BLOB_READ_WRITE_TOKEN` is set. A failed send is recorded on the message and in the item history and never undoes the save. `ackEmailMode`: Send (deliver at once), Preview (officer reviews on the item page, then Send now / Discard), Off.
- Routing emails go to the routed unit and division unless every address was already emailed for the item. Resend asks to confirm when the acknowledgement was emailed before.
- Daily review (`src/server/services/daily-review.ts`): one transaction that first claims the date's row in `daily_review_runs` (a second trigger waits on it, then finds it taken and does nothing). Releases cleared submissions, makes past-determination new registrations provisional, lists overdue deficiency responses (never lapses), counts SLA red/amber, unpaid and reminders. "Registered without a number" is reported, not repaired: approval always issues the number in the app.
- Cron: `vercel.json` `0 6 * * *` → `/api/cron/daily-review`, Bearer `CRON_SECRET` checked in constant time. Admin › Daily review has "Run now" and the run history.

## 11c. As built in Phase 5

- Dashboard (`src/server/services/dashboard.ts`): headline tiles, work queues for the signed-in user (my evaluations, items for my unit, awaiting routing, awaiting payment with reminder, Finance Desk, ready for decision, overdue deficiency responses), Registry counters, Registration money, status, service levels, monthly submissions (12 months from the Effective Date month), by category with money, by activity and by LGA. Charts are single-series bars in the accent colour with values as text and hover titles (no chart library).
- Admin › Reference data: fee table (audited; sets "Fees revised on"; saved submissions keep frozen pricing and are flagged), activity map, divisions and units with email addresses (validated; units that cannot be emailed are listed), correspondence types (registration filing types cannot be switched off and keep their filing mapping), and 18 drop-down lists (add and switch off; never rename; values the rules rely on are locked; file class codes unique and fixed). Forms, Schedule 2 documents, conditions and EVAL-01 checks are shown read-only.
- Admin › Export registers: Register, payments, own-use, inward, outward, front desk, files, movements and the audit log as .xlsx (exceljs, text columns kept as text) or CSV (UTF-8 BOM, formula-injection guard). Admin only; each export is audited.
- Not built: a "versioned" fee table with history rows. The audit log keeps every old → new value and the saved pricing snapshots keep what each submission was charged, which covers the need; say if separate fee versions are wanted.

## 11d. As built in Phase 6

- Workbook import (`src/server/services/import.ts`): reads the .xlsm with exceljs, finds each sheet's header row and maps columns by header text, then imports in one transaction (files → front desk → inward → outward → "in response to" links → movements). Numbers keep the workbook's value and the counters move past them. Re-running is safe: a record already there is counted; a number the app already gave a different item is reported as an error and left alone. Phones that lost their leading zero are restored and listed; names that are not user accounts are kept as written and listed. Registration sheets are checked and any rows listed for entry through the app (they are empty today). Dry run by default; every run is kept in `import_runs`.
- Admin › Import (upload, 4 MB limit) and `pnpm import:workbook <file> [--commit]` run the same import.
- EXAMPLE rows for development and preview are the workbook's own EXAMPLE rows, loaded by the same importer in "examples" mode by the seed, flagged `is_example`; refused in production [G4].
- Admin › Go-live checks: live readiness (EXAMPLE rows, records present, import done, Effective Date, signatories, holidays, roles, seeded staff, unit emails, email provider, Blob, cron secret, daily review, public address, audit chain).
- `docs/GO-LIVE.md` holds the platform steps; `docs/ACCEPTANCE.md` maps each acceptance check to its test.

## 11e. As built in Phase 7 (optional offline workbook)

- `pnpm export:workbook [--with-examples] [--out <folder>]` writes `OGSERC_Registry_and_Evaluation_<commit>.xlsm` (or `..._TRAINING.xlsm`) into `exports/` (git-ignored), from the reference workbook in `docs/source` and the database in `DATABASE_URL`. Run it against production for the real staff, signatories and settings. It refuses to build from uncommitted changes.
- The workbook is patched, not regenerated: sheets, formulas, buttons and VBA stay as the Registry knows them. Cells are rewritten in the sheet XML (`scripts/workbook/xlsx.ts`); everything else is copied byte for byte.
- Gap fixes: G1 Registry Settings reads the one Effective Date and the deadline with the extension; G2 officer lists hold names from the accounts with each role; G3 one signatory list feeds the certificate signatories (no Commissioner → approvals blocked, as in the app); G4 registers empty (EXAMPLE rows, the real Verge Power row and the test audit entry removed; cached formula results cleared), or a TRAINING copy that keeps the EXAMPLE rows; G5 every phone, CAC, TIN and reference column and form input formatted as Text; G10 commit and build time stamped; G14 Late Charge = `MIN(initial + daily × days, cap)`, checked against the app for category D, 100 days late (₦10,000,000).
- G11: the VBA is edited without Excel (`scripts/workbook/vba.ts`, MS-CFB + MS-OVBA): the partner-workbook procedures are deleted, and the two paths that did real work in the combined workbook become direct calls (`RX_LogInward` → `RegistryDesk.RX_LogFiling`; `RX_NextAck` reads the Register, Own-Use and Inward Register here). The compiled-code caches are reset, so Excel recompiles the macros from the edited source on open. Every edit asserts a single match.
- Also from the app: settings and policies, Registry service targets, holidays, the fee table, unit and division emails.
- Checks: `scripts/workbook/build.test.ts` (no Excel needed; runs in CI) and `scripts/workbook/verify-excel.ps1`, which opens the export in desktop Excel, checks every gap fix and runs a real Registry Intake save through the macros in test mode. Both pass for the clean and the TRAINING copy (6 Nov 2026).

## 11f. Phase 8 plan: live updates, notifications, idle sign-out (agreed 9 Nov 2026)

Requested by Kamiye after go-live. Built in three stages, each stopped for testing.

**8a. Live updates.** Vercel functions cannot hold open sockets, so each visible tab polls `GET /api/pulse` every 5 seconds (paused while the tab is hidden, immediate when it comes back). The pulse returns the audit chain's `seq`: every change in the app writes an audit row, so a new `seq` means something changed. On a change the page re-renders from the server (`router.refresh()`). If the person has typed into a form on the page, nothing is redrawn; a "New changes · Refresh" button appears instead. Polling never counts as activity for 8c. A push service (Pusher, Ably) was considered and not chosen: one more account, keys and plan for a gain of a few seconds.

**8b. Notifications.** A `notifications` table (recipient, title, reference, link, read time), written in the same transaction as the action, so a notification exists exactly when the action committed. Never sent to the person who acted. The pulse also returns the unread count. Header bell: amber with a red count when unread, a short Web Audio chime on arrival (browsers allow sound only after the person has clicked the page once since it loaded), a list with "mark all read", a per-person mute, and optional system pop-ups (Notification API, permission asked once; title and reference only). Recipients:

| Action | Notified |
| --- | --- |
| Front desk item logged | Registry officers |
| Inward saved, registry intake (ACK issued) | Routers |
| Item routed or re-routed; forwarded | Unit officers of that unit |
| Unit closes an item | Registry officers |
| Payment recorded | Finance officers |
| Payment rejected | Whoever recorded it |
| Payment confirmed (released for evaluation) | Assigned evaluator, else supervisors (to assign) |
| Officers assigned | Each newly assigned officer |
| Submission marked complete | Assigned reviewing supervisor and approving officer |
| Deficiency notice issued | Registry officers and the assigned evaluator |
| Approved, refused, lapsed, provisional | Registry officers and the assigned evaluator |

*As built (8b):* table `notifications` and `users.notify_sound` (migration 0008). `notify(tx, actor, …)` in `src/server/services/notifications.ts` resolves roles, a unit's officers and named people to active, confirmed accounts, minus the actor. Wired into front desk, New Inward, Registry Intake (not for a pulled item: its routers were told at New Inward), routing, forwarding, a unit closing, payment recorded and rejected, `tryRelease` (so Finance confirmation and the daily review both announce a release), officers assigned (only newly assigned people), marked complete, deficiency notice, approve, changes applied, lapse, refuse and the daily review's provisional registrations. Cancel is not announced (not in the table). The pulse returns the unread count and newest unread; `/api/notifications` lists the latest 30; marking read and the sound switch are server actions that only touch the signed-in person's own rows. Hidden tabs poll every 30 s so pop-ups still arrive while the app is minimised; with several tabs open only one chimes and pops up. Tests: `tests/integration/notifications.test.ts`.

**8c. Idle sign-out and resume.** After `idleMinutes` (admin setting, default 4) with no mouse, keyboard, touch or scroll, every tab signs out; a 30-second warning comes first. Enforced on the server as well: sessions carry `last_activity_at`, refreshed only by real activity (a throttled activity ping from the browser), never by the pulse; a session idle longer than the limit is refused and revoked. Before sign-out, the page's form fields are saved to a `form_drafts` table against the person (not the browser, so nothing is left on a shared PC). After the same person signs in again they return to the same page with the fields refilled. Drafts are deleted once restored or after 24 hours. Password fields and file inputs are never saved. Forms with added rows (licences, other activities) are restored row by row. This replaces the 12-hour idle rule in §6; the 12-hour absolute session limit stays.

*As built (8c):* setting `idleMinutes` (Admin › Settings › Security, 1 to 240, default 4). Migration 0009 adds `sessions.last_activity_at` and `form_drafts` (unique per person and page). `src/components/shell/session-guard.tsx` (in the app layout and on the password page) shares the last activity time across tabs through `localStorage`, pings `POST /api/activity` at most every 20 s, warns 30 s before the limit and saves the page's typed-in forms (`PUT /api/drafts`), then calls `idleSignOutAction` (audited "Signed out: inactive") and loads `/sign-in?reason=idle&next=<page>`. A hidden tab saves its typing when it is hidden (its timers are slowed) and drops that copy when shown again while still signed in. The server: `getCurrentActor` runs `checkIdle` on every page, action and route handler and ends a session idle longer than the limit plus 60 s of grace (so the browser always acts first), auditing it once; only the activity ping moves the clock, never polling or page loads. Sign-in follows `next` only to an in-app path (`isDraftPath`). After sign-in, opening the page refills it (`src/lib/drafts-client.ts`: native setters plus input/change events, so controlled React fields work; several passes for fields revealed by earlier choices; `useDraftRows` lets the Register and Own-Use forms add rows first), deletes the draft and says so. Drafts older than 24 h are ignored and cleared. Tests: `src/lib/drafts-client.test.ts` (happy-dom), `src/server/services/drafts.test.ts`, `tests/integration/idle.test.ts`.

## 12. Phase map

| Phase | Delivers |
| --- | --- |
| 1 | Scaffold, Drizzle schema for identity, settings, reference data, counters, audit; migrations; Better Auth; roles and `authorize`; settings screen basics; numbering service; `lagos` and holidays; validators; audit writer; app shell with sidebar and dark mode; CI; first preview on Vercel |
| 2 | Register, pricing, fees, documents, payments and Finance gate, evaluation and decisions, own-use, signatories |
| 3 | Front desk, registry intake, inward, routing, update/forward/close, outward, files, pending actions |
| 4 | Slip, Daily Register and pending PDFs; email adapter; daily review cron |
| 5 | Combined dashboard; admin screens; exports |
| 6 | Import of the real record with report; full test run; production setup |
| 7 | Optional workbook export |
| 8 | Live updates (8a), notifications (8b), idle sign-out with resume (8c) |

Phase 2 needs the registry's inward item to hold the ACK. Phase 2 creates the `inward_items` table and the direct-entry path (`SPEC.md` §18.3); Phase 3 adds the registry screens on top.
