import { describe, expect, it } from "vitest";
import { isDraftPath } from "./drafts";

describe("isDraftPath (also guards the after-sign-in redirect)", () => {
  it("accepts in-app pages with their query", () => {
    for (const p of ["/dashboard", "/register/0b6f6a4e-1111-2222-3333-444444444444?tab=details", "/inward?q=ACK%2F2026"]) expect(isDraftPath(p)).toBe(true);
  });
  it("refuses other sites, API routes and odd input", () => {
    for (const p of ["//evil.example", "https://evil.example", "/\\evil.example", "/api/drafts", "dashboard", "", "/a b", 42, null, `/${"x".repeat(600)}`]) {
      expect(isDraftPath(p)).toBe(false);
    }
  });
});
