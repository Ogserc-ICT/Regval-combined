# Acceptance checks: where each one is proved

The brief's acceptance checks (`docs/COMBINED_BUILD.md`) and the automated test that proves each one. Unit tests run with `pnpm test:unit`; integration tests run against a real PostgreSQL with `pnpm test:integration`. All pass as of Phase 7 (6 Nov 2026).

| # | Check | Test |
| --- | --- | --- |
| 1 | Changing the Effective Date moves the deadline, the inward "filed after deadline" flag and unpriced records; saved submissions are flagged and the one-click recalculation (reason required, logged) moves them | `tests/integration/registration.test.ts` › "Effective Date change and recalculation (Q6, acceptance check 1)"; `src/domain/settings.test.ts` › "changing the Effective Date moves the deadline"; `src/domain/registration/pricing.test.ts` › "a saved snapshot keeps its deadline when the Effective Date changes (Q6)"; the inward flag reads the same deadline: `src/domain/registry.test.ts` › "REG-01: after deadline …" |
| 2 | 20 parallel saves get 20 consecutive ACK numbers | `tests/integration/numbering.test.ts` › "acceptance: 20 parallel saves …" |
| 3 | A registry inward item and a direct Register entry share the ACK series | `tests/integration/registry.test.ts` › "interleaved saves take consecutive ACK numbers" (New Inward, Registry Intake, direct Register, direct Own-use) |
| 4 | 08021846578 kept with its zero; 8021846578 rejected clearly | `src/domain/validators.test.ts` › both "acceptance:" tests; saved and shown: `tests/integration/registration.test.ts` › "freezes the pricing, keeps the phone's leading zero …"; restored on import: `tests/integration/import.test.ts` |
| 5 | Email 17:30 Fri 18 Dec 2026 → Mon 21 Dec | `src/domain/deemed.test.ts` |
| 6 | Email 18:00 Thu 24 Dec 2026 → Tue 29 Dec | `src/domain/deemed.test.ts` |
| 7 | Hand delivery 16:00 Fri 18 Dec 2026 → that day (Q1) | `src/domain/deemed.test.ts` |
| 8 | Category D, 100 days late → ₦10,000,000 (G14) | `src/domain/registration/pricing.test.ts` › "required: category D, 100 days late …" |
| 9 | Approval refused while the Commissioner signatory is empty, with the reason | `src/domain/registration/assess.test.ts` › "acceptance: approval is refused …"; end to end in `tests/integration/registration.test.ts` (evaluation and decisions) |
| 10 | Finance gets 403 confirming a payment they recorded, including a direct call | `tests/integration/registration.test.ts` › "acceptance: a Finance officer gets 403 …". The check is in the service every server action calls, so a direct POST meets the same 403 |
| 11 | No Router role → 403 on routing | `tests/integration/registry.test.ts` › "a user without the Router role gets 403 on routing, through the service"; `tests/integration/access.test.ts` |
| 12 | Daily review triggered twice on one Lagos date runs once | `tests/integration/outputs.test.ts` › "acceptance: triggered twice on one Lagos date, it runs once" (two concurrent runs) |
| 13 | Production has no EXAMPLE records; previews do | `tests/integration/import.test.ts` › "acceptance: production has no EXAMPLE records …"; live on **Admin › Go-live checks** |
| 14 | Unit with no email → warning and "Not emailed: no address" | `tests/integration/outputs.test.ts` › "acceptance: a unit with no email …" |
| 15 | Worked examples of fees, late charges, categories and deadlines, A to K | `src/domain/registration/pricing.test.ts` › "fees and late charges, categories A–K (SPEC §30.2)", "category (SPEC §7, §30.1)" |
| 16 | Workbook export: one Effective Date, names in the staff lists, text phone cells, no EXAMPLE rows, a clean commit hash, no partner-workbook code, the G14 formula | `scripts/workbook/build.test.ts` (every item, no Excel needed); in Excel: `scripts/workbook/verify-excel.ps1`, which also saves a filing through the macros |
