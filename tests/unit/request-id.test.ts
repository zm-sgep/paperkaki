import { describe, expect, it } from "vitest";
import { generateRequestId, resolveRequestId } from "@/lib/request-id";
import { findSensitiveKeys } from "@/lib/sensitive-keys";

describe("resolveRequestId", () => {
  it("keeps a plain incoming ID", () => {
    expect(resolveRequestId("req-1234567890")).toBe("req-1234567890");
  });

  it.each([undefined, null, "", "short", "has spaces in it", "line\nbreak-injection", "x".repeat(200)])(
    "replaces a missing or unsafe ID (%j)",
    (incoming) => {
      const id = resolveRequestId(incoming);
      expect(id).not.toBe(incoming);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it("generates distinct IDs", () => {
    expect(generateRequestId()).not.toBe(generateRequestId());
  });
});

describe("findSensitiveKeys", () => {
  it("finds sensitive names at any depth, ignoring case", () => {
    expect(findSensitiveKeys({ ok: 1, Email: "x", nested: { list: [{ Nickname: "y" }] } })).toEqual([
      "Email",
      "nested.list[0].Nickname",
    ]);
  });

  it("returns nothing for identifiers and counts", () => {
    expect(findSensitiveKeys({ paperId: "p1", questionCount: 12 })).toEqual([]);
  });
});
