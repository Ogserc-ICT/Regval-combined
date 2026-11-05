import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, sessions, users, verifications } from "../db/schema";
import { MIN_PASSWORD_LENGTH } from "../services/users";

function origins(): string[] {
  const list = [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ];
  return [...new Set(list.filter((x): x is string => !!x))];
}

/**
 * Staff sign-in (docs/PLAN.md §6): email + password, database sessions,
 * no self sign-up (accounts are created by an admin), inactive accounts
 * cannot start a session.
 */
export const auth = betterAuth({
  appName: "OGSERC Registry & Evaluation",
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  trustedOrigins: origins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      active: { type: "boolean", required: false, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: true, input: false },
      pendingConfirmation: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // refreshed at most hourly while in use
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  // Accounts are managed by admins in the app; staff cannot change their own
  // name or email, delete themselves, sign up, or use email-link flows.
  disabledPaths: [
    "/sign-up/email",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    "/verify-email",
  ],
  telemetry: { enabled: false },
  databaseHooks: {
    session: {
      create: {
        // Defence in depth: the sign-in action checks this too.
        before: async (session) => {
          const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId));
          if (!u?.active) return false;
        },
      },
    },
  },
  plugins: [nextCookies()],
});
