# Go-live checklist

Phase 6, updated for Phase 9 (10 Nov 2026): the Registry left this app, so there is no workbook import, no email and no unit addresses to set up.

For Kamiye (ICT). Every step is in the Vercel or Neon dashboard or in the app; nothing needs the Vercel CLI. **Admin › Go-live checks** in the app checks most of this live and says what is still to do.

## 1. Decide the production database

Records in this app can never be deleted: the database refuses it, by design. Open **Admin › Go-live checks › Records already in the registers** on production.

- **Empty, or only records you are happy to keep:** carry on with step 2.
- **Test records you created while trying the app:** start production on a fresh database, so the Commission's registers and number series begin clean.
  1. Vercel › Project › Storage › Create Database › Neon, same region as before (London, or Frankfurt with `fra1` in `vercel.json`).
  2. Connect the new database to **Production** only. Disconnect the old one from Production (keep it for Preview if you like, or delete it in Neon).
  3. Redeploy production (Deployments › latest production › Redeploy, without build cache). The build applies every migration, seeds the reference data and creates the first admin from `BOOTSTRAP_ADMIN_*`.
  4. Staff accounts start again: the bootstrap admin creates them (step 4). Nothing else carries over.

## 2. Production environment variables

Project › Settings › Environment Variables, **Production**:

| Name | Value |
| --- | --- |
| `AUTH_SECRET` | 32+ random characters, different from Preview |
| `BETTER_AUTH_URL` | `https://<the production domain>` (step 3) |
| `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first admin; used only while no active admin exists |
| `CRON_SECRET` | Set (done in Phase 4) |
`BLOB_READ_WRITE_TOKEN`, `EMAIL_PROVIDER`, `EMAIL_FROM` and `RESEND_API_KEY` are no longer used (Phase 9) and can be removed.

Do **not** set `SEED_EXAMPLES` or `APP_TODAY` for Production. The code refuses both there anyway [G13].

## 3. Domain and region

1. Project › Settings › Domains › Add, e.g. `registration.ogserc.org.ng`. Vercel shows a DNS record (usually `CNAME registration → cname.vercel-dns.com`). Send it to whoever manages the ogserc.org.ng zone.
2. When the domain shows "Valid configuration", set `BETTER_AUTH_URL` to it and redeploy. Sign-in only accepts the address in `BETTER_AUTH_URL`.
3. Region: `vercel.json` pins functions to London (`lhr1`). It must match the Neon region (Neon › Project › Settings). If Neon is in Frankfurt, change `lhr1` to `fra1`, commit and redeploy.
4. Deployment Protection (Settings › Deployment Protection): Vercel Authentication on for **Preview** deployments.

## 4. In the app (production)

1. Sign in as the bootstrap admin and choose your own password.
2. **Admin › Staff & roles:** create the Registration officers, evaluators, supervisors, approvers and Finance officers, each with a one-time password. Approval needs four different people [G8]. Accounts that held only registry roles before Phase 9 now have no roles: give them a role or delete them.
3. **Admin › Signatories:** confirm the Chairman / CEO and **add the Commissioner**. New registrations cannot be approved without one [G3].
4. **Admin › Settings:** enter the gazetted Effective Date and clear "placeholder" (Q2). Check the ACK number prefix under Receipt and letters (Q25).
5. **Admin › Holidays:** confirm the provisional and estimated dates, and keep the list six months ahead; deemed receipt depends on it.

There is nothing to import: the workbook holds no real registration records.

## 5. First week

- **Cron:** Settings › Cron Jobs lists `/api/cron/daily-review` at `0 6 * * *` (07:00 Lagos). The morning after deploying, Admin › Daily review shows a "Scheduled" run.
- **Backups:** Neon point-in-time restore (check the retention period in Neon › Project › Settings); weekly Admin › Export registers as an extra copy.
- **Tests:** the GitHub Actions workflow runs typecheck, lint, unit and integration tests on every push; keep it green.
- **Go-live checks:** revisit Admin › Go-live checks until every row says Ready.
