import { describe, expect, it } from "vitest";
import { checkCanMarkVerified, hasPageReference } from "@/domain/curriculum";

describe("checkCanMarkVerified", () => {
  it("needs a named verifier", () => {
    expect(checkCanMarkVerified({ verifierProfileId: null, links: [{ pageOrSection: "p. 35" }] })).toMatchObject({
      ok: false,
      reason: "missing_verifier",
    });
    expect(checkCanMarkVerified({ verifierProfileId: "", links: [{ pageOrSection: "p. 35" }] })).toMatchObject({
      ok: false,
      reason: "missing_verifier",
    });
  });

  it("needs at least one source link", () => {
    expect(checkCanMarkVerified({ verifierProfileId: "p1", links: [] })).toMatchObject({
      ok: false,
      reason: "no_source_link",
    });
  });

  it("needs a page or section on at least one link", () => {
    expect(
      checkCanMarkVerified({ verifierProfileId: "p1", links: [{ pageOrSection: null }, { pageOrSection: "  " }] }),
    ).toMatchObject({ ok: false, reason: "no_page_reference" });
  });

  it("passes when one link has a page, even if another has none", () => {
    expect(
      checkCanMarkVerified({ verifierProfileId: "p1", links: [{ pageOrSection: null }, { pageOrSection: "p. 36" }] }),
    ).toEqual({ ok: true });
  });

  it("treats blank text as no page reference", () => {
    expect(hasPageReference({ pageOrSection: null })).toBe(false);
    expect(hasPageReference({ pageOrSection: "   " })).toBe(false);
    expect(hasPageReference({ pageOrSection: "Section 5" })).toBe(true);
  });
});
