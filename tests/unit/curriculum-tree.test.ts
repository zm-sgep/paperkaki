import { describe, expect, it } from "vitest";
import { assembleCurriculumTree, type CurriculumVersionSummary } from "@/domain/curriculum";

const version: CurriculumVersionSummary = {
  id: "v1",
  code: "TEST-V1",
  subject: "Test Subject",
  title: "Test curriculum",
  levels: ["P3"],
  status: "draft",
  effectiveFrom: null,
  publishedAt: null,
};

const outcome = (id: string, topicId: string, sortOrder: number, code = id) => ({
  id,
  code,
  statement: `${id} statement`,
  childLabel: `${id} label`,
  level: "P3",
  sortOrder,
  verification: "unverified" as const,
  topicId,
});

const topic = (id: string, domainId: string, sortOrder: number, code = id) => ({
  id,
  code,
  title: id,
  parentLabel: `${id} label`,
  level: "P3",
  sortOrder,
  scopeNotes: [],
  domainId,
});

describe("assembleCurriculumTree", () => {
  it("orders by sort order, then code, whatever the input order", () => {
    const tree = assembleCurriculumTree(
      version,
      [
        { id: "d2", code: "D2", title: "Second", sortOrder: 2 },
        { id: "d1", code: "D1", title: "First", sortOrder: 1 },
      ],
      [topic("t3", "d1", 2), topic("t1", "d1", 1), topic("t2", "d2", 1), topic("t4", "d1", 2, "A-first")],
      [outcome("o3", "t1", 2), outcome("o1", "t1", 1), outcome("o2", "t1", 2, "A-tie")],
    );
    expect(tree.domains.map((domain) => domain.code)).toEqual(["D1", "D2"]);
    expect(tree.domains[0]?.topics.map((t) => t.id)).toEqual(["t1", "t4", "t3"]);
    expect(tree.domains[0]?.topics[0]?.outcomes.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
  });

  it("keeps the version and drops domains left with no topics, and outcomes with no topic", () => {
    const tree = assembleCurriculumTree(
      version,
      [
        { id: "d1", code: "D1", title: "First", sortOrder: 1 },
        { id: "d2", code: "D2", title: "Empty after filtering", sortOrder: 2 },
      ],
      [topic("t1", "d1", 1)],
      [outcome("o1", "t1", 1), outcome("orphan", "missing-topic", 1)],
    );
    expect(tree.version).toBe(version);
    expect(tree.domains.map((domain) => domain.id)).toEqual(["d1"]);
    expect(tree.domains[0]?.topics[0]?.outcomes.map((o) => o.id)).toEqual(["o1"]);
  });

  it("does not leak the flat-row helper fields into the tree", () => {
    const tree = assembleCurriculumTree(
      version,
      [{ id: "d1", code: "D1", title: "First", sortOrder: 1 }],
      [topic("t1", "d1", 1)],
      [outcome("o1", "t1", 1)],
    );
    expect(tree.domains[0]?.topics[0]).not.toHaveProperty("domainId");
    expect(tree.domains[0]?.topics[0]?.outcomes[0]).not.toHaveProperty("topicId");
  });
});
