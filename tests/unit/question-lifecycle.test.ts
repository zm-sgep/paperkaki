import { describe, expect, it } from "vitest";
import {
  canTransition,
  canonicalJson,
  decideReview,
  describeVerification,
  inlineText,
  isEditableInPlace,
  isGenerationCandidate,
  questionFingerprint,
  referencedAssetKeys,
  stemSummary,
  HUMAN_ANSWER_CHECK_NOTE,
  type ReviewChecklist,
} from "@/domain/questions";
import { buildDraft } from "../factories/questions";

const allTicked: ReviewChecklist = { curriculum: true, answer: true, clarity: true, ageAppropriate: true };
const bed = { outcome: { code: "O1" } };
const draft = () => buildDraft(bed as never);

describe("question status transitions", () => {
  it("follows draft -> in review -> approved -> retired", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("in_review", "draft")).toBe(true);
    expect(canTransition("approved", "retired")).toBe(true);
  });

  it("never skips review, reopens an approved question or revives a retired one", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
    expect(canTransition("approved", "in_review")).toBe(false);
    expect(canTransition("retired", "approved")).toBe(false);
    expect(canTransition("retired", "draft")).toBe(false);
  });

  it("edits only drafts in place and uses only approved questions for papers", () => {
    expect(isEditableInPlace("draft")).toBe(true);
    for (const s of ["in_review", "approved", "retired"] as const) expect(isEditableInPlace(s)).toBe(false);
    expect(isGenerationCandidate("approved")).toBe(true);
    for (const s of ["draft", "in_review", "retired"] as const) expect(isGenerationCandidate(s)).toBe(false);
  });
});

describe("decideReview", () => {
  it("approves when every item is ticked and the answer check passes", () => {
    expect(decideReview({ decision: "approved", checklist: allTicked, notes: "", verification: { ok: true } })).toEqual({
      ok: true,
      notes: null,
    });
  });

  it("names each unticked item", () => {
    const result = decideReview({
      decision: "approved",
      checklist: { ...allTicked, clarity: false, ageAppropriate: false },
      notes: "",
      verification: { ok: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toHaveLength(2);
  });

  it("blocks approval when the automatic check fails, even with every box ticked", () => {
    const result = decideReview({
      decision: "approved",
      checklist: allTicked,
      notes: "",
      verification: { ok: false, reasons: ["Expression gives 15.75 but the stored answer is 16"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("automatic answer check failed");
  });

  it("records the answer tick as the human check when the verifier cannot check it", () => {
    const result = decideReview({
      decision: "approved",
      checklist: allTicked,
      notes: "Checked with a ruler.",
      verification: { ok: true, needsHumanCheck: true },
    });
    expect(result).toEqual({ ok: true, notes: `Checked with a ruler. ${HUMAN_ANSWER_CHECK_NOTE}` });
  });

  it("does not accept a human check without the answer tick", () => {
    expect(
      decideReview({
        decision: "approved",
        checklist: { ...allTicked, answer: false },
        notes: "",
        verification: { ok: true, needsHumanCheck: true },
      }).ok,
    ).toBe(false);
  });

  it("needs a reason to request changes or retire", () => {
    for (const decision of ["changes_requested", "retired"] as const) {
      expect(decideReview({ decision, checklist: allTicked, notes: "  ", verification: { ok: true } }).ok).toBe(false);
      expect(decideReview({ decision, checklist: allTicked, notes: "Wrong wording", verification: { ok: true } })).toEqual({
        ok: true,
        notes: "Wrong wording",
      });
    }
  });
});

describe("describeVerification", () => {
  it("speaks plainly about each result", () => {
    expect(describeVerification({ ok: true }).tone).toBe("good");
    expect(describeVerification({ ok: true, needsHumanCheck: true }).tone).toBe("human");
    expect(describeVerification({ ok: false, reasons: ["nope"] })).toEqual({ tone: "bad", lines: ["nope"] });
  });
});

describe("questionFingerprint", () => {
  it("ignores key order and secondary outcome order, but not content", () => {
    const a = draft();
    const reordered = JSON.parse(JSON.stringify({ ...a, answer: { unit: "$", value: "15.75", kind: "number" } }));
    expect(questionFingerprint(reordered)).toBe(questionFingerprint(a));
    expect(questionFingerprint({ ...a, secondaryOutcomeCodes: ["B", "A"] })).toBe(
      questionFingerprint({ ...a, secondaryOutcomeCodes: ["A", "B"] }),
    );
    expect(questionFingerprint({ ...a, marks: 3 })).not.toBe(questionFingerprint(a));
  });

  it("canonicalJson sorts keys deeply", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});

describe("content helpers", () => {
  it("summarises the first paragraph and reads fractions as text", () => {
    const d = draft();
    expect(stemSummary(d.content, 20)).toHaveLength(20);
    expect(inlineText([{ t: "text", v: "Add " }, { t: "frac", n: 1, d: 2, whole: 3 }, { t: "blank" }])).toBe("Add 3 1/2____");
  });

  it("lists asset keys from image blocks in stem and solution", () => {
    const d = draft();
    d.content.stem.push({ t: "image", assetKey: "q/a.png", alt: "a" });
    d.workedSolution.push({ t: "image", assetKey: "q/b.png", alt: "b" });
    expect(referencedAssetKeys(d)).toEqual(["q/a.png", "q/b.png"]);
  });
});
