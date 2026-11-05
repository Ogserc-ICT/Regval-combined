import { describe, expect, it } from "vitest";
import { directDatabaseUrl, missingDatabaseMessage, pooledDatabaseUrl } from "./env";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("database env resolution", () => {
  it("prefers the unpooled URL for migrations and the pooled one for the app", () => {
    const e = env({ DATABASE_URL: "pooled", DATABASE_URL_UNPOOLED: "direct" });
    expect(directDatabaseUrl(e)).toBe("direct");
    expect(pooledDatabaseUrl(e)).toBe("pooled");
  });
  it("accepts the POSTGRES_* names the Neon integration also sets", () => {
    const e = env({ POSTGRES_URL: "pooled", POSTGRES_URL_NON_POOLING: "direct" });
    expect(directDatabaseUrl(e)).toBe("direct");
    expect(pooledDatabaseUrl(e)).toBe("pooled");
  });
  it("accepts a custom integration prefix", () => {
    const e = env({ DB_ENV_PREFIX: "STORAGE", STORAGE_DATABASE_URL: "p", STORAGE_DATABASE_URL_UNPOOLED: "d" });
    expect(directDatabaseUrl(e)).toBe("d");
    expect(pooledDatabaseUrl(e)).toBe("p");
  });
  it("explains what is missing without printing values", () => {
    const none = missingDatabaseMessage(env({ VERCEL_ENV: "production" }));
    expect(none).toContain("Vercel production build");
    expect(none).toContain("connect the Neon database");
    const prefixed = missingDatabaseMessage(env({ STORAGE_DATABASE_URL: "postgres://secret" }));
    expect(prefixed).toContain("STORAGE_DATABASE_URL");
    expect(prefixed).not.toContain("secret");
    expect(prefixed).toContain("DB_ENV_PREFIX");
  });
});
