import { expect, test, type Page } from "@playwright/test";
import {
  FIXTURE_SERVER,
  INTERNAL_WORDS,
  drawStroke,
  expectFamilyWords,
  expectNoSideScroll,
  newDevice,
  parentMakesMock,
  shot,
  signInAs,
} from "./support";

/**
 * Marking, the quick check, results and the marked paper, on a phone and on an iPad in landscape. A parent
 * makes a mock and gives it to the iPad; the child gets one word problem wrong with working shown; the
 * parent is asked for a quick check, saves a mark and reads the results; both open the marked paper.
 * Runs on the server with recorded AI answers (no model is called).
 */
test.use({ baseURL: FIXTURE_SERVER });

const progress = (page: Page) => page.locator("[data-progress]");
const next = (page: Page) => page.getByRole("button", { name: "Next question" });

/** Steps forward to the first typed question worth 3 or more marks (a word problem) and returns its number. */
async function goToWordProblem(page: Page): Promise<number> {
  for (let guard = 0; guard < 60; guard += 1) {
    const surface = await page.locator("[data-question-surface]").innerText();
    if (/\([3-9] marks\)/.test(surface) && (await page.locator("[data-typed-answer]").isVisible())) {
      return Number(/Question (\d+) of/.exec((await progress(page).innerText()).trim())?.[1]);
    }
    await next(page).click();
  }
  throw new Error("no word problem found");
}

test.describe("marking, quick check, results and the marked paper", () => {
  test("a wrong word problem with working goes to a quick check, then to results and the marked paper", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const tag = testInfo.project.name;
    const email = `e2e-marking-${tag}@example.test`;
    const name = "Test Child A";
    const landscape = tag === "ipad-landscape";

    // The parent makes Mock 1 and gives it to the iPad, then hands the device over.
    await signInAs(page, email);
    await parentMakesMock(page, name);
    await page.getByRole("button", { name: "Do it on iPad instead" }).click();
    await expect(page.locator("[data-ipad-status]")).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: `Hand this device to ${name}` }).click();
    await expect(page).toHaveURL(/\/today$/);

    // The child: one word problem answered wrongly, with working shown. Nothing else.
    await page.getByRole("link", { name: "Start" }).click();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(progress(page)).toHaveText(/^Question 1 of \d+$/);
    const wordProblem = await goToWordProblem(page);
    await page.getByRole("textbox", { name: "Your answer" }).fill("0.01");
    await drawStroke(page, page.getByTestId("working-canvas"));
    await expect(page.getByTestId("working-canvas")).toHaveAttribute("data-stroke-count", "1");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Questions" }).click();
    await page.getByRole("dialog", { name: "All questions" }).getByRole("button", { name: "Check your paper" }).click();
    await page.getByRole("button", { name: "Submit paper" }).click();
    await page.getByRole("dialog", { name: "Submit your paper?" }).getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toBeVisible();
    // Handing in shows no score: results come once the paper is marked, and never inside Mock Mode.
    expect(await page.locator("body").innerText()).not.toMatch(/score|\d+\s*\/\s*\d+|marks|points/i);

    // The parent, on their own phone or laptop: Home says a quick check is needed.
    const { context: parentContext, device: parent } = await newDevice(browser, page, baseURL);
    await signInAs(parent, email);
    await expect(async () => {
      await parent.goto("/home");
      await expect(parent.getByRole("heading", { level: 1 })).toContainText("We need a quick check on 1 answer");
    }).toPass({ timeout: 45_000 });
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectFamilyWords(parent);
    await shot(parent, "home-quick-check", tag);
    await parent.getByRole("link", { name: "Check answers" }).click();

    // The quick check: one question, the answer, the working, the right answer, the scheme, a suggestion.
    await expect(parent).toHaveURL(/\/progress\/review\/[0-9a-f-]{36}$/);
    const attemptId = /\/review\/([0-9a-f-]{36})$/.exec(parent.url())?.[1] ?? "";
    await expect(parent.getByRole("heading", { level: 1, name: `We need a quick check on Question ${wordProblem}.` })).toBeVisible();
    await expect(parent.locator("[data-child-answer]")).toHaveText("0.01");
    await expect(parent.getByAltText(`${name}'s working for Question ${wordProblem}`)).toBeVisible();
    await expect(parent.getByRole("heading", { name: "The right answer" })).toBeVisible();
    await expect(parent.getByRole("heading", { name: "How it is marked" })).toBeVisible();
    await expect(parent.locator("[data-suggestion]")).toContainText(/We suggest 2 out of \d/);
    await expect(parent.getByText("The method looks right, but there is a slip in the last step.")).toBeVisible();
    await expect(parent.getByRole("button", { name: "Save and next" })).toHaveAttribute("data-variant", "primary");
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);
    const choices = parent.getByRole("radio");
    expect(await choices.count()).toBeGreaterThanOrEqual(4);
    for (const label of await parent.locator("fieldset label").all()) expect((await label.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expect(parent.getByRole("radio", { name: /^2/ })).toBeChecked();
    await expectFamilyWords(parent);
    await expectNoSideScroll(parent);
    await shot(parent, "review", tag);
    await parent.getByRole("button", { name: "Save and next" }).click();

    // Results, in order: score, change, attention, one action, topics, marked paper.
    await expect(parent).toHaveURL(new RegExp(`/progress/results/${attemptId}$`));
    const score = parent.locator("[data-score]");
    await expect(score).toHaveText(/^Score: 2\/\d+$/);
    await expect(parent.locator("[data-change]")).toHaveText("First mock — this is your starting point");
    const attention = parent.locator("[data-attention] li");
    expect(await attention.count()).toBeGreaterThanOrEqual(1);
    expect(await attention.count()).toBeLessThanOrEqual(3);
    await expect(parent.locator("[data-next-action]")).toHaveText(/^.+ needs attention$|^Time for|^Ready for/);
    const cta = parent.locator('[data-variant="primary"]');
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveText(/^Start 15-minute .+ practice$/);
    await expect(parent.locator("[data-topics] tbody tr").first()).toContainText(/Needs attention|Getting there|Strong/);
    await expect(parent.getByRole("link", { name: "Marked paper" })).toBeVisible();
    const y = async (locator: ReturnType<Page["locator"]>) => (await locator.first().boundingBox())!.y;
    const order = [score, parent.locator("[data-change]"), parent.locator("[data-attention]"), cta, parent.locator("[data-topics]"), parent.getByRole("link", { name: "Marked paper" })];
    const ys = [];
    for (const item of order) ys.push(await y(item));
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(await parent.locator("body").innerText()).not.toMatch(/predict|%/i);
    await expectFamilyWords(parent);
    await expectNoSideScroll(parent);
    await shot(parent, "results", tag, true);

    // Home moves on: the result has been seen, so the mistakes are next.
    await parent.goto("/home");
    await expect(parent.getByRole("heading", { level: 1 })).toContainText(/Go through \d+ mistakes? from Mathematics End-of-year exam · Mock 1/);

    // The marked paper: mistakes first, the question with what the child wrote and the worked solution.
    await parent.goto(`/progress/results/${attemptId}`);
    await parent.getByRole("link", { name: "Marked paper" }).click();
    await expect(parent).toHaveURL(new RegExp(`/progress/results/${attemptId}/paper$`));
    await expect(parent.getByRole("heading", { level: 1, name: "Marked paper" })).toBeVisible();
    const firstCard = parent.locator("[data-mistakes] [data-question]").first();
    await expect(firstCard).toContainText(`Question ${wordProblem}`);
    await expect(firstCard).toContainText(/✗ 2\/\d/);
    await expect(firstCard.locator("[data-answer-line]")).toHaveText("0.01");
    await expect(firstCard.getByAltText(`Working for Question ${wordProblem}`)).toBeVisible();
    if (landscape) {
      const paperBox = (await parent.locator("[data-paper-side]").boundingBox())!;
      const panelBox = (await parent.locator("[data-feedback-panel]").boundingBox())!;
      expect(panelBox.x).toBeGreaterThan(paperBox.x + paperBox.width - 1);
      const share = paperBox.width / (paperBox.width + panelBox.width);
      expect(share).toBeGreaterThan(0.58);
      expect(share).toBeLessThan(0.72);
    } else {
      await expect(parent.locator("[data-feedback-panel]")).toBeHidden();
      await firstCard.getByRole("button", { name: /Show feedback/ }).click();
      const sheet = parent.locator("[data-feedback-panel]");
      await expect(sheet).toBeVisible();
      const box = (await sheet.boundingBox())!;
      expect(box.y + box.height).toBeGreaterThan(800);
    }
    const panel = parent.locator("[data-feedback-panel]");
    await expect(panel.getByRole("heading", { level: 2, name: `Question ${wordProblem}` })).toBeVisible();
    await expect(panel.locator("[data-what-happened]")).toContainText("They wrote 0.01");
    await expect(panel.getByText("slip in the calculation")).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3, name: "Worked solution" })).toBeVisible();
    await expect(panel.locator("[data-worked-solution]")).not.toBeEmpty();
    await expect(panel.getByRole("link", { name: "Try one like this" })).toHaveAttribute("href", /\/progress\/practice/);
    await expect(parent.locator("[data-right-answers]")).toBeVisible();
    await expectFamilyWords(parent);
    await expectNoSideScroll(parent);
    await shot(parent, "paper", tag);
    await panel.getByRole("link", { name: "Try one like this" }).click();
    await expect(parent.getByRole("heading", { level: 1, name: "Practice" })).toBeVisible();

    // Nobody else can see any of it.
    const other = await newDevice(browser, page, baseURL);
    await signInAs(other.device, `e2e-marking-other-${tag}@example.test`);
    for (const path of [`/progress/results/${attemptId}`, `/progress/results/${attemptId}/paper`, `/progress/review/${attemptId}`]) {
      expect((await other.device.goto(path))?.status(), path).toBe(404);
    }
    expect((await other.device.goto(`/api/attempts/${attemptId}/working/${wordProblem}`))?.status()).toBe(404);
    await other.context.close();
    await parentContext.close();

    // The child: Today points at the results, which are warm and lead to the mistakes.
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1, name: "Your Mathematics End-of-year exam · Mock 1 is marked" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await page.getByRole("link", { name: "See my results" }).click();
    await expect(page).toHaveURL(new RegExp(`/results/${attemptId}$`));
    await expect(page.locator("[data-score]")).toHaveText(/^Your score: 2\/\d+$/);
    await expect(page.locator("[data-headline]")).toContainText(/Let's fix \d+ mistakes?\.$/);
    const things = page.locator("[data-things] li");
    expect(await things.count()).toBeGreaterThanOrEqual(1);
    expect(await things.count()).toBeLessThanOrEqual(3);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Review mistakes");
    const childText = await page.locator("body").innerText();
    expect(childText).not.toMatch(INTERNAL_WORDS);
    expect(childText).not.toMatch(/Prepare|Account|Sign out|weak|rank|other children|average/);
    await expectNoSideScroll(page);
    await shot(page, "child-results", tag);

    await page.getByRole("link", { name: "Review mistakes" }).click();
    await expect(page).toHaveURL(new RegExp(`/results/${attemptId}/paper$`));
    const childFirst = page.locator("[data-mistakes] [data-question]").first();
    await expect(childFirst).toContainText(`Question ${wordProblem}`);
    if (!landscape) await childFirst.getByRole("button", { name: /Show feedback/ }).click();
    await expect(page.locator("[data-feedback-panel]").locator("[data-what-happened]")).toContainText("You wrote 0.01");
    await expect(page.locator("[data-feedback-panel]").locator("[data-worked-solution]")).not.toBeEmpty();
    await expect(page.locator("[data-feedback-panel]").getByRole("link", { name: "Try one like this" })).toHaveAttribute("href", /\/practice\?outcome=/);
    expect(await page.locator("body").innerText()).not.toMatch(INTERNAL_WORDS);
    // The child never sees the marker's note to the parent.
    expect(await page.locator("body").innerText()).not.toContain("The method looks right");
    await shot(page, "child-paper", tag);

    // Going through the mistakes is done with one press, and Today moves on.
    if (!landscape) await page.getByRole("button", { name: "Close feedback" }).click();
    await page.getByRole("button", { name: "I've been through my mistakes" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("mistake");
    // Not theirs: another child's results are a 404 for this device too.
    expect((await page.goto("/results/00000000-0000-4000-8000-000000000999"))?.status()).toBe(404);
  });
});
