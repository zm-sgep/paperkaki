import { describe, expect, it } from "vitest";
import { HOME_ILLUSTRATION } from "@/components/parent/home-illustrations";
import { PARENT_ACTION_ORDER } from "@/domain/recommendations/next-parent-action";

describe("Home illustrations", () => {
  it("gives every next action a picture, and only those", () => {
    expect(Object.keys(HOME_ILLUSTRATION).sort()).toEqual([...PARENT_ACTION_ORDER].sort());
  });

  it("shows the done picture only when nothing is left to do", () => {
    const done = Object.entries(HOME_ILLUSTRATION).filter(([, name]) => name === "check-burst");
    expect(done).toEqual([["done_today", "check-burst"]]);
  });
});
