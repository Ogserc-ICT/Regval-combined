/**
 * Finds the database connection strings. The Vercel–Neon integration sets
 * DATABASE_URL / DATABASE_URL_UNPOOLED, and also the POSTGRES_* aliases;
 * either set works. A custom prefix chosen in the integration (e.g.
 * STORAGE_DATABASE_URL) is accepted through DB_ENV_PREFIX.
 */

type Env = NodeJS.ProcessEnv;

function pick(env: Env, names: string[]): string | undefined {
  const prefix = env.DB_ENV_PREFIX ? `${env.DB_ENV_PREFIX.replace(/_$/, "")}_` : "";
  for (const n of names) {
    const v = env[prefix + n]?.trim() || env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Pooled connection for app traffic. */
export function pooledDatabaseUrl(env: Env = process.env): string | undefined {
  return pick(env, ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"]);
}

/** Direct connection for migrations and the seed (falls back to pooled). */
export function directDatabaseUrl(env: Env = process.env): string | undefined {
  return pick(env, ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"]);
}

/** A message for a missing database: lists the database-like variable names it can see, never their values. */
export function missingDatabaseMessage(env: Env = process.env): string {
  const seen = Object.keys(env)
    .filter((k) => /DATABASE|POSTGRES|^PG|NEON/i.test(k))
    .sort();
  const where = env.VERCEL_ENV ? ` (Vercel ${env.VERCEL_ENV} build)` : "";
  return [
    `No database connection string found${where}.`,
    "Expected DATABASE_URL_UNPOOLED / DATABASE_URL (or POSTGRES_URL_NON_POOLING / POSTGRES_URL).",
    seen.length
      ? `Database-related variables present: ${seen.join(", ")}. If they share a custom prefix, set DB_ENV_PREFIX to it.`
      : "No database-related variables are present: connect the Neon database to this project and to this environment (docs/DEPLOY.md step 4), then redeploy.",
  ].join("\n");
}
