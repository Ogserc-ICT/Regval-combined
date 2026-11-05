/**
 * [G4] No example data in production. EXAMPLE rows may be seeded only in
 * development and preview environments, and only when SEED_EXAMPLES=true.
 */
export function examplesAllowed(env: NodeJS.ProcessEnv = process.env): { allowed: boolean; reason: string } {
  if (env.VERCEL_ENV === "production") return { allowed: false, reason: "Vercel production" };
  if (!env.VERCEL_ENV && env.NODE_ENV === "production") return { allowed: false, reason: "a production build" };
  if (env.SEED_EXAMPLES !== "true") return { allowed: false, reason: "SEED_EXAMPLES is not true" };
  return { allowed: true, reason: env.VERCEL_ENV ? `Vercel ${env.VERCEL_ENV}` : "development" };
}
