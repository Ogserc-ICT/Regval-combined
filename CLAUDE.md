# OGSERC Registry & Evaluation (combined app)

Standalone, staff-only web app for the Ogun State Electricity Regulatory Commission (OGSERC). It combines two systems in one Next.js app with one PostgreSQL database, hosted on Vercel Pro:

- **Registration & Evaluation**: operator registration under Order No. OGSERC/ORD/2026/001, forms REG-01A to REG-01K, payments and the Finance gate, the EVAL-01 evaluation, own-use notifications.
- **Registry**: front desk, inward and outward correspondence, routing, files and file movements, acknowledgement slips, the Daily Register.

This project started from an empty folder. It shares no code, database, number series or Vercel project with the existing Registration & Evaluation app or the registry app, and must not depend on either. The full build plan is `docs/COMBINED_BUILD.md`. Read it before any work.

## Working rules

- Work phase by phase as `docs/COMBINED_BUILD.md` says. After each phase, stop, summarise what changed and what comes next, and wait for "Go to Phase N".
- The workbook in `docs/source/` is the spec and is read-only. Its Guide mentions `docs/SPEC.md`, `src/domain` and `npm run export:workbook` from another repo; those are not available here. This project's own `docs/SPEC.md` is written in Phase 0.
- Where the workbook is unclear or contradicts itself, add the question to `docs/QUESTIONS.md`; don't guess.
- One OGSERC/ACK series is shared by the Registry and the Register. Every number (ACK, FD, OUT, PAY, OUN, DEF, REG, file references) is issued inside a database transaction, per year, and never reused.
- Enforce roles and separation of duties on the server, not only in the UI.
- Compute every date, deadline and "today" in Africa/Lagos on the server.
- Store phones, CAC numbers, TINs and references as strings.
- Never hard-code staff names. They come from user accounts and admin-editable lists.
- No example data in production. Seed it only in development and preview environments.
- Stack: Next.js (App Router), TypeScript, Tailwind, PostgreSQL. The ORM, migration tool and auth approach are chosen in Phase 0 and recorded in `docs/PLAN.md`.
- Design: a modern, premium dashboard with a sidebar, dark mode by default, one look across both modules.
- Nothing may depend on a local disk or desktop Office: generate PDFs on request, store kept files in Vercel Blob, send email through the email adapter.

## Commands

`pnpm db:up` (local Postgres in Docker) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:integration` · `pnpm build`. Schema changes: edit `src/server/db/schema/*`, then `pnpm db:generate`.

This Next.js version (16.4) differs from older ones; read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).

## Key docs

- `docs/COMBINED_BUILD.md`: build brief, gaps G1 to G13, phases, acceptance checks
- `docs/SPEC.md`: the rules for both modules (written in Phase 0)
- `docs/PLAN.md`: architecture, schema, ORM, auth, screens (written in Phase 0)
- `docs/QUESTIONS.md`: open questions for Kamiye and the Commission (written in Phase 0)

## Status

Update this list as each phase finishes.

- Phase 0, spec and plan: done 5 Nov 2026; Q1, Q3, Q4, Q6 decided and G14 added 6 Nov 2026
- Phase 1, scaffold and foundations: done 6 Nov 2026; deployed on Vercel with a Neon database and signed in successfully
- Phase 2, Registration module: done 6 Nov 2026, awaiting review (Q9, Q15 on defaults; logo added)
- Phase 3, Registry module: not started
- Phase 4, outputs and automation: not started
- Phase 5, dashboard and admin: not started
- Phase 6, import and go-live: not started
- Phase 7, offline workbook export (optional): not requested
