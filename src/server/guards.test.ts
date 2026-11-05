import { describe, expect, it } from "vitest";
import { examplesAllowed } from "./seed-guard";
import { lagosToday, serverNow, todayOverride } from "./time";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("APP_TODAY override [G13]", () => {
  const real = new Date("2026-11-05T09:15:00Z"); // 10:15 in Lagos
  it("applies in development and keeps the time of day", () => {
    const e = env({ NODE_ENV: "development", APP_TODAY: "2026-12-18" });
    expect(lagosToday(e, real)).toBe("2026-12-18");
    expect(serverNow(e, real).toISOString()).toBe("2026-12-18T09:15:00.000Z");
  });
  it("applies on Vercel preview", () => {
    expect(todayOverride(env({ NODE_ENV: "production", VERCEL_ENV: "preview", APP_TODAY: "2026-12-18" }))).toBe("2026-12-18");
  });
  it("is ignored in production", () => {
    expect(todayOverride(env({ NODE_ENV: "production", VERCEL_ENV: "production", APP_TODAY: "2026-12-18" }))).toBeNull();
    expect(todayOverride(env({ NODE_ENV: "production", APP_TODAY: "2026-12-18" }))).toBeNull();
    expect(lagosToday(env({ NODE_ENV: "production", VERCEL_ENV: "production", APP_TODAY: "2026-12-18" }), real)).toBe("2026-11-05");
  });
  it("rejects a malformed date", () => {
    expect(() => todayOverride(env({ NODE_ENV: "development", APP_TODAY: "18/12/2026" }))).toThrow();
  });
});

describe("EXAMPLE rows [G4]", () => {
  it("never in production", () => {
    expect(examplesAllowed(env({ VERCEL_ENV: "production", SEED_EXAMPLES: "true" })).allowed).toBe(false);
    expect(examplesAllowed(env({ NODE_ENV: "production", SEED_EXAMPLES: "true" })).allowed).toBe(false);
  });
  it("in preview and development only when asked", () => {
    expect(examplesAllowed(env({ NODE_ENV: "production", VERCEL_ENV: "preview", SEED_EXAMPLES: "true" })).allowed).toBe(true);
    expect(examplesAllowed(env({ NODE_ENV: "development", SEED_EXAMPLES: "true" })).allowed).toBe(true);
    expect(examplesAllowed(env({ NODE_ENV: "development" })).allowed).toBe(false);
  });
});
