/**
 * The server's clock ([G13]). Every "now" and "today" comes from here, in
 * Africa/Lagos, never from the browser.
 *
 * APP_TODAY=YYYY-MM-DD shifts the Lagos date (keeping the real time of day)
 * for testing. It is ignored in production: on Vercel production, and in any
 * production build that is not running on Vercel.
 */
import { isLocalDate, lagosDate, lagosInstant, lagosMinuteOfDay, type LocalDate } from "@/domain/dates";

export function todayOverrideAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (!env.VERCEL_ENV && env.NODE_ENV === "production") return false;
  return true;
}

export function todayOverride(env: NodeJS.ProcessEnv = process.env): LocalDate | null {
  const v = env.APP_TODAY?.trim();
  if (!v || !todayOverrideAllowed(env)) return null;
  if (!isLocalDate(v)) throw new Error(`APP_TODAY must be YYYY-MM-DD, got "${v}"`);
  return v;
}

/** The current instant (shifted to APP_TODAY's date when the override applies). */
export function serverNow(env: NodeJS.ProcessEnv = process.env, realNow: Date = new Date()): Date {
  const override = todayOverride(env);
  if (!override) return realNow;
  const mins = lagosMinuteOfDay(realNow);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  const shifted = lagosInstant(override, `${hh}:${mm}`);
  return new Date(shifted.getTime() + realNow.getUTCSeconds() * 1000 + realNow.getUTCMilliseconds());
}

/** Today's Lagos date. */
export function lagosToday(env: NodeJS.ProcessEnv = process.env, realNow: Date = new Date()): LocalDate {
  return lagosDate(serverNow(env, realNow));
}
