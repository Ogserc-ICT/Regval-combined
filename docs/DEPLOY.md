# Deploying to Vercel

For whoever sets up the Vercel project (Kamiye, ICT). This app has its own Vercel project and its own database; it shares nothing with the Registration & Evaluation app or the registry app.

## First preview deployment (Phase 1)

1. **Push the repo** to `Ogserc-ICT/Regval-combined` on GitHub (branch `main`).
2. **Create the Vercel project.** Vercel › Add New › Project › import `Regval-combined`. Framework: Next.js. Leave the build and install commands empty: `vercel.json` sets them (`pnpm vercel-build`, which runs migrations, then the seed, then `next build`).
3. **Function region.** `vercel.json` pins functions to London (`lhr1`). If the database ends up in Frankfurt (step 4), change it to `fra1` so the app and database sit together.
4. **Add the database.** Project › Storage › Create Database › Neon (Postgres), new database, region **AWS London (eu-west-2)** if offered, otherwise **Frankfurt (eu-central-1)**. Connect it to Production and Preview, and turn on **"Create database branch for deployment" for Preview**, so every preview gets its own branch and never sees production data. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct; used only by migrations).
5. **Environment variables** (Project › Settings › Environment Variables):

   | Name | Production | Preview | Value |
   | --- | --- | --- | --- |
   | `AUTH_SECRET` | ✓ | ✓ | 32+ random characters (`openssl rand -base64 32`); different per environment |
   | `BETTER_AUTH_URL` | ✓ | | `https://<production domain>` (previews use `VERCEL_URL` automatically) |
   | `BOOTSTRAP_ADMIN_NAME` | ✓ | ✓ | The first admin's full name |
   | `BOOTSTRAP_ADMIN_EMAIL` | ✓ | ✓ | The first admin's work email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | ✓ | ✓ | A strong temporary password (the admin must change it at first sign-in) |
   | `SEED_EXAMPLES` | | ✓ | `true` (refused in production by code, [G4]) |
   | `CRON_SECRET` | ✓ | ✓ | Random string (used from Phase 4) |
   | `EMAIL_PROVIDER`, `EMAIL_FROM`, provider key | ✓ | ✓ | From Phase 4 (Q19) |

   Do **not** set `APP_TODAY` in production; the code ignores it there anyway.
6. **Deployment Protection.** Project › Settings › Deployment Protection › Vercel Authentication: **on for Preview deployments**.
7. **Deploy.** Push a branch or open a pull request to get a preview. The build log shows "Migrations applied.", the seed summary and the Next.js build. Sign in with the bootstrap admin; you'll be asked to choose a new password.
8. **Confirm the seeded staff.** Admin › Staff & roles lists the six people from the workbook as inactive and "Confirm". Add each work email, check the roles, tick Confirmed and Active, and give them a one-time password.

The admin footer shows the deployed commit (`VERCEL_GIT_COMMIT_SHA`, [G10]).

## Production (Phase 6)

- Promote after the import of the real record.
- Cron (`0 6 * * *` → `/api/cron/daily-review`, 07:00 Lagos) is added in Phase 4.
- Custom domain: a subdomain of ogserc.org.ng. Vercel shows the DNS record (usually a `CNAME` to `cname.vercel-dns.com`); send it to whoever manages the ogserc.org.ng zone.
- Backups: Neon point-in-time restore, plus the admin "Export registers" button (Phase 5).
