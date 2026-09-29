import { describe, expect, it } from "vitest";
import { createDevAuthService, normaliseEmail, parseAdminEmails } from "@/services/auth/dev-adapter";

const secret = "unit-test-secret-that-is-at-least-32-chars";

describe("dev auth adapter", () => {
  it("normalises email by trimming and lower-casing", () => {
    expect(normaliseEmail("  Parent.A@Example.TEST ")).toBe("parent.a@example.test");
  });

  it("parses the admin list, ignoring case, spaces and blanks", () => {
    expect([...parseAdminEmails(" Admin@Example.test, ,other@example.test ")]).toEqual([
      "admin@example.test",
      "other@example.test",
    ]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("identifies a parent by the normalised email", async () => {
    const auth = createDevAuthService({ secret });
    expect(await auth.authenticate({ email: " Parent-A@Example.test " })).toEqual({
      provider: "dev",
      subject: "parent-a@example.test",
      email: "parent-a@example.test",
      role: "parent",
    });
  });

  it("gives the admin role only to listed emails, whatever their casing", async () => {
    const auth = createDevAuthService({ secret, adminEmails: "Admin@example.test" });
    expect((await auth.authenticate({ email: "ADMIN@example.test" }))?.role).toBe("admin");
    expect((await auth.authenticate({ email: "parent-a@example.test" }))?.role).toBe("parent");
  });

  it("rejects text that is not an email address", async () => {
    const auth = createDevAuthService({ secret });
    for (const email of ["", "   ", "no-at-sign", "a@b", "a b@example.test", `${"a".repeat(250)}@example.test`]) {
      expect(await auth.authenticate({ email })).toBeNull();
    }
  });

  it("issues sessions that it can read back", async () => {
    const auth = createDevAuthService({ secret });
    const token = await auth.issueSession("00000000-0000-4000-8000-000000000041");
    expect((await auth.readSession(token))?.parentProfileId).toBe("00000000-0000-4000-8000-000000000041");
    expect(await auth.readSession("garbage")).toBeNull();
  });
});
