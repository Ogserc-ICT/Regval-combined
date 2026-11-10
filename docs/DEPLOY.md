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
   | `CRON_SECRET` | ✓ | ✓ | Random string (used from Phase 4) |

   Do **not** set `APP_TODAY` in production; the code ignores it there anyway.
6. **Deployment Protection.** Project › Settings › Deployment Protection › Vercel Authentication: **on for Preview deployments**.
7. **Deploy.** Push a branch or open a pull request to get a preview. The build log shows "Migrations applied.", the seed summary and the Next.js build. Sign in with the bootstrap admin; you'll be asked to choose a new password.
8. **Create the staff.** Admin › Staff & roles: add the Registration officers, evaluators, supervisors, approvers and Finance officers, each with a one-time password. (Before Phase 9 the seed added six Registry staff from the workbook; it no longer does, and on preview databases it marks them deleted.)

The admin footer shows the deployed commit (`VERCEL_GIT_COMMIT_SHA`, [G10]).

## If the build fails with "No database connection string found"

The first build step (`tsx scripts/migrate.ts`) needs the database URL **at build time**.

- A push to `main` builds **Production**; any other branch builds **Preview**. The database must be connected to the environment being built: Project › Storage › your Neon database › Settings, tick Production and Preview, then Redeploy.
- The message lists the database-related variable names the build can see (never their values). If they all carry a prefix you chose when connecting Neon (for example `STORAGE_DATABASE_URL`), add `DB_ENV_PREFIX=STORAGE` for both environments, or reconnect without a prefix.
- Variables added after a build don't apply to it: use Redeploy (without the build cache) once they are set.

## The daily review (dashboard steps)

Since Phase 9 there is no email and no Blob store: the acknowledgement emails and slips left with the Registry. `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN` and `SEED_EXAMPLES` can be removed from the project.

1. **Cron secret.** Project › Settings › Environment Variables: add `CRON_SECRET` (a long random string) for Production and Preview. Vercel sends it to `/api/cron/daily-review`; without it the endpoint answers 401. The schedule (`0 6 * * *`, 07:00 Lagos) is in `vercel.json` and Vercel runs cron jobs on **production** deployments only. Check it under Project › Settings › Cron Jobs after the next production deploy.

## Production (Phase 6)

The full go-live checklist is in [GO-LIVE.md](GO-LIVE.md). In short:


- Cron (`0 6 * * *` → `/api/cron/daily-review`, 07:00 Lagos) runs on production only; confirm `CRON_SECRET` is set there.
- Custom domain: a subdomain of ogserc.org.ng. Vercel shows the DNS record (usually a `CNAME` to `cname.vercel-dns.com`); send it to whoever manages the ogserc.org.ng zone.
- Backups: Neon point-in-time restore, plus Admin › Export registers (CSV or Excel, any register).
