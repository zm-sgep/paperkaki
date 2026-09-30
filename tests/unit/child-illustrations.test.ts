import { describe, expect, it } from "vitest";
import { CHILD_ILLUSTRATION } from "@/components/child/child-illustrations";
import { CHILD_ACTION_ORDER } from "@/domain/recommendations/next-child-action";

describe("Child mission illustrations", () => {
  it("gives every mission a picture, and only those", () => {
    expect(Object.keys(CHILD_ILLUSTRATION).sort()).toEqual([...CHILD_ACTION_ORDER].sort());
  });

  it("shows the done picture only when nothing is left to do", () => {
    const done = Object.entries(CHILD_ILLUSTRATION).filter(([, name]) => name === "check-burst");
    expect(done).toEqual([["done_today", "check-burst"]]);
  });
});
