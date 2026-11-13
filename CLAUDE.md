# OGSERC Registration & Evaluation

Standalone, staff-only web app for the Ogun State Electricity Regulatory Commission (OGSERC): operator registration under Order No. OGSERC/ORD/2026/001, forms REG-01A to REG-01K, payments and the Finance gate, the EVAL-01 evaluation, own-use notifications. One Next.js app with one PostgreSQL database, hosted on Vercel Pro.

It began as a combined app that also held the Registry (front desk, inward and outward correspondence, routing, files, the Daily Register). The Registry was removed on 10 Nov 2026 (Phase 9) and belongs to the separate registry app. The repo keeps its name.

This project shares no code, database, number series or Vercel project with the existing Registration & Evaluation app or the registry app, and must not depend on either. The build brief is `docs/COMBINED_BUILD.md`. Read it before any work.

## Working rules

- Work phase by phase as `docs/COMBINED_BUILD.md` says. After each phase, stop, summarise what changed and what comes next, and wait for "Go to Phase N".
- The workbook in `docs/source/` is the spec and is read-only. Its Guide mentions `docs/SPEC.md`, `src/domain` and `npm run export:workbook` from another repo; those are not available here. This project's own `docs/SPEC.md` is written in Phase 0.
- Where the workbook is unclear or contradicts itself, add the question to `docs/QUESTIONS.md`; don't guess.
- The ACK series is this app's own (prefix `OGSERC/ACK`, an admin setting; Q25). Every number (ACK, PAY, OUN, DEF, REG) is issued inside a database transaction, per year, and never reused.
- Every submission and own-use notification records the date, time and channel received; the deemed receipt date (para 10(3)) is computed on save, then fixed, and sets the ACK year and the days late.
- Enforce roles and separation of duties on the server, not only in the UI.
- Compute every date, deadline and "today" in Africa/Lagos on the server.
- Store phones, CAC numbers, TINs and references as strings.
- Never hard-code staff names. They come from user accounts and admin-editable lists.
- No example data in production. Seed it only in development and preview environments.
- Stack: Next.js (App Router), TypeScript, Tailwind, PostgreSQL. The ORM, migration tool and auth approach are chosen in Phase 0 and recorded in `docs/PLAN.md`.
- Design: a modern, premium dashboard with a sidebar, dark mode by default.
- Nothing may depend on a local disk or desktop Office: generate PDFs on request and store any kept file in Vercel Blob. There is no email.

## Commands

`pnpm db:up` (local Postgres in Docker) · `pnpm export:workbook` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:integration` · `pnpm build`. Schema changes: edit `src/server/db/schema/*`, then `pnpm db:generate`.

This Next.js version (16.4) differs from older ones; read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).

## Key docs

- `docs/COMBINED_BUILD.md`: build brief, gaps G1 to G14 (G4, G7, G9, G11 not applicable), phases, acceptance checks
- `docs/SPEC.md`: the registration rules (written in Phase 0; registry sections marked not applicable in Phase 9)
- `docs/PLAN.md`: architecture, schema, ORM, auth, screens (written in Phase 0)
- `docs/QUESTIONS.md`: open questions for Kamiye and the Commission (written in Phase 0)
- `docs/GO-LIVE.md`: production checklist; `docs/ACCEPTANCE.md`: acceptance check → test; `docs/END-TO-END.md`: walk-through of the whole app

## Status

Update this list as each phase finishes.

- Phase 0, spec and plan: done 5 Nov 2026; Q1, Q3, Q4, Q6 decided and G14 added 6 Nov 2026
- Phase 1, scaffold and foundations: done 6 Nov 2026; deployed on Vercel with a Neon database and signed in successfully
- Phase 2, Registration module: done 6 Nov 2026 (Q9, Q15 on defaults; logo added)
- Phase 3, Registry module: done 6 Nov 2026; removed in Phase 9
- Phase 4, outputs and automation: done 6 Nov 2026 (daily review cron kept; slip, Daily Register and email removed in Phase 9)
- Phase 5, dashboard and admin: done 6 Nov 2026 (registry parts removed in Phase 9)
- Phase 6, go-live: done 6 Nov 2026; production steps in docs/GO-LIVE.md are for Kamiye (workbook import removed in Phase 9)
- Phase 7, offline workbook export: done 6 Nov 2026; reviewed in Excel and accepted (`pnpm export:workbook`); its Registry sheets left as they were (Q27)
- Phase 8, live updates, notifications, idle sign-out (plan in docs/PLAN.md §11f, agreed 9 Nov 2026): 8a live updates done 9 Nov 2026; 8b notifications done 10 Nov 2026; 8c idle sign-out with resume built 10 Nov 2026, tested by Kamiye 13 Nov 2026
- Phase 9, re-scope (Registry removed; receipt, deemed receipt, ACK and sent dates moved into the Register): done 10 Nov 2026, pushed
- Admin data tools (Admin › Data management: clear registers up to a factory reset, delete entries) and docs/END-TO-END.md: done 10 Nov 2026
- Phase 10, the four registration PDFs (acknowledgement letter, deficiency notice, EVAL-01, CERT-01): done 13 Nov 2026 on the templates in `docs/templates/` (Q26); Q12 and Q28a, e answered (Commissioner Femi Omisanjo); Q28b–d, f–h on defaults
- Go-live: 13 Nov 2026, signatories entered (Jide Onakoya, Femi Omisanjo), BETTER_AUTH_URL set to https://regval-combined.vercel.app, daily review run; every Admin › Go-live check Ready. Q8–Q11, Q13, Q15, Q20, Q21, Q25, Q27 and Q28 answered the same day; still open: Q2 (gazetted date), Q18 (Microsoft sign-in), Q23 (full form sections)
