import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Mock Mode against the development-only preview page (/dev/mock-preview). It is a 404 in a
 * production build, so this spec runs with playwright.mock-preview.config.ts (`next dev`).
 * Each test gets its own attempt id, so saved state never leaks between tests or projects.
 */

let counter = 0;
function attemptId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

async function openMock(page: Page, id = attemptId()): Promise<string> {
  await page.goto(`/dev/mock-preview?attempt=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Mathematics WA2 · Mock 1" })).toBeVisible();
  return id;
}

const progress = (page: Page) => page.locator("[data-progress]");
const next = (page: Page) => page.getByRole("button", { name: "Next question" });
const previous = (page: Page) => page.getByRole("button", { name: "Previous question" });
const canvas = (page: Page) => page.getByTestId("working-canvas");
const answerBox = (page: Page) => page.getByRole("textbox", { name: "Your answer" });

async function goToQuestion(page: Page, n: number) {
  while (true) {
    const text = (await progress(page).innerText()).trim();
    const current = Number(/Question (\d+) of/.exec(text)?.[1]);
    if (current === n) return;
    await (current < n ? next(page) : previous(page)).click();
  }
}

async function drawStroke(page: Page, area: Locator, from = 0.1) {
  const box = (await area.boundingBox())!;
  const x = box.x + box.width * from;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) await page.mouse.move(x + i * 8, y + Math.sin(i / 3) * 18);
  await page.mouse.up();
}

test("shows no app navigation, points, hints or correctness", async ({ page }) => {
  await openMock(page);
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(page.locator("a")).toHaveCount(0);
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const word of ["home", "prepare", "rewards", "points", "hint", "correct", "well done"]) {
    expect(body, word).not.toContain(word);
  }
  await expect(progress(page)).toHaveText("Question 1 of 8");
  await expect(page.getByRole("timer")).toContainText("45:00");
});

test("answers a multiple-choice question, can change it, and shows the choice by more than colour", async ({ page }) => {
  await openMock(page);
  const cards = page.locator("[data-mcq] label");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(2)).toContainText("(3)");
  await cards.nth(2).click();
  await expect(page.getByRole("radio").nth(2)).toBeChecked();
  // A tick, not only a colour, marks the chosen card.
  await expect(cards.nth(2).locator("svg")).toHaveCSS("opacity", "1");
  await expect(cards.nth(1).locator("svg")).toHaveCSS("opacity", "0");
  await cards.nth(0).click();
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  await expect(page.getByRole("radio").nth(2)).not.toBeChecked();
  await page.getByRole("button", { name: "Clear my choice" }).click();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("shows the unit beside the box and keeps typed answers, working and position after a reload", async ({ page }) => {
  const id = await openMock(page);
  await page.locator("[data-mcq] label").nth(2).click();
  await next(page).click();
  await expect(page.locator("[data-typed-answer]")).toContainText("cm");
  await answerBox(page).fill("340");
  await next(page).click();
  await expect(progress(page)).toHaveText("Question 3 of 8");
  await expect(canvas(page)).toHaveAttribute("data-stroke-count", "0");
  await drawStroke(page, canvas(page));
  await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");

  // Autosave is debounced; wait for it to reach this device's storage before reloading.
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(`paperkaki.mock.attempt.${key}`) ?? "", id))
    .toContain('"strokes"');

  await page.reload();
  await expect(progress(page)).toHaveText("Question 3 of 8");
  await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");
  await previous(page).click();
  await expect(answerBox(page)).toHaveValue("340");
  await previous(page).click();
  await expect(page.getByRole("radio").nth(2)).toBeChecked();
  // The clock kept its place too: it does not start again from 45:00.
  await expect(page.getByRole("timer")).not.toContainText("45:00");
});

test("draws with the mouse, undoes, redoes, erases a stroke and clears after asking", async ({ page }) => {
  await openMock(page);
  await goToQuestion(page, 3);
  const area = canvas(page);
  await drawStroke(page, area, 0.1);
  await drawStroke(page, area, 0.5);
  await expect(area).toHaveAttribute("data-stroke-count", "2");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(area).toHaveAttribute("data-stroke-count", "1");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(area).toHaveAttribute("data-stroke-count", "2");

  // Eraser removes whole strokes it touches.
  await page.getByRole("button", { name: "Eraser" }).click();
  const box = (await area.boundingBox())!;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(box.x + box.width * 0.1 + 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1 + 60, y + 4, { steps: 4 });
  await page.mouse.up();
  await expect(area).toHaveAttribute("data-stroke-count", "1");
  await page.getByRole("button", { name: "Pen", exact: true }).click();

  // Clear asks first, and Keep working changes nothing.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Clear your working for this question?")).toBeVisible();
  await page.getByRole("button", { name: "Keep working" }).click();
  await expect(area).toHaveAttribute("data-stroke-count", "1");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(area).toHaveAttribute("data-stroke-count", "0");
});

test("ignores a resting palm while the pen is down, and lets a finger draw when no pen is used", async ({ page }) => {
  await openMock(page);
  await goToQuestion(page, 3);
  const drawWith = (pointerType: "pen" | "touch", pointerId: number, withPen: boolean) =>
    page.evaluate(
      ({ pointerType, pointerId, withPen }) => {
        const el = document.querySelector<HTMLCanvasElement>("[data-testid=working-canvas]")!;
        const r = el.getBoundingClientRect();
        const fire = (type: string, id: number, kind: string, x: number, y: number) =>
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: kind, isPrimary: kind === "pen" || !withPen, button: 0, buttons: type === "pointerup" ? 0 : 1, pressure: kind === "pen" ? 0.6 : 0.5, clientX: r.left + x, clientY: r.top + y }));
        if (withPen) {
          fire("pointerdown", 1, "pen", 60, 60);
          // A palm lands on the glass while the pen is down and drags.
          fire("pointerdown", 2, "touch", 200, 150);
          for (let i = 1; i < 10; i += 1) fire("pointermove", 2, "touch", 200 + i * 10, 150);
          fire("pointerup", 2, "touch", 300, 150);
          for (let i = 1; i < 10; i += 1) fire("pointermove", 1, "pen", 60 + i * 12, 60 + i * 3);
          fire("pointerup", 1, "pen", 170, 87);
        } else {
          fire("pointerdown", pointerId, pointerType, 60, 200);
          for (let i = 1; i < 10; i += 1) fire("pointermove", pointerId, pointerType, 60 + i * 12, 200);
          fire("pointerup", pointerId, pointerType, 170, 200);
        }
      },
      { pointerType, pointerId, withPen },
    );
  // Finger only: draws.
  await drawWith("touch", 5, false);
  await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");
  // Pen with a palm: only the pen stroke is added.
  await page.waitForTimeout(1000);
  await drawWith("pen", 1, true);
  await expect(canvas(page)).toHaveAttribute("data-stroke-count", "2");
});

test("submit review lists unanswered and flagged questions, jumps back, and confirms twice", async ({ page }) => {
  await openMock(page);
  await page.locator("[data-mcq] label").nth(1).click(); // Q1 answered
  await next(page).click();
  await answerBox(page).fill("340"); // Q2 answered
  await goToQuestion(page, 4);
  await page.getByRole("button", { name: "Flag", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flagged", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Questions" }).click();
  const dialog = page.getByRole("dialog", { name: "All questions" });
  await expect(dialog.getByRole("button", { name: /^Question 1, done/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Question 3, not done/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Question 4, not done, flagged for review/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Check your paper" }).click();

  await expect(page.getByRole("heading", { name: "Check your paper", level: 2 })).toBeVisible();
  await expect(page.getByText("You have answered 2 of 8 questions.")).toBeVisible();
  const unanswered = page.locator("[data-review-group=unanswered]");
  await expect(unanswered).toContainText("Not answered yet (6)");
  await expect(unanswered.getByRole("button", { name: "Question 1", exact: true })).toHaveCount(0);
  await expect(unanswered.getByRole("button", { name: "Question 3" })).toBeVisible();
  await expect(page.locator("[data-review-group=flagged]").getByRole("button", { name: "Question 4" })).toBeVisible();
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const word of ["correct", "points", "hint", "wrong"]) expect(text, word).not.toContain(word);

  // Tap to jump back to a question, then return to the review.
  await unanswered.getByRole("button", { name: "Question 3" }).click();
  await expect(progress(page)).toHaveText("Question 3 of 8");
  await page.getByRole("button", { name: "Questions" }).click();
  await page.getByRole("dialog", { name: "All questions" }).getByRole("button", { name: "Check your paper" }).click();

  // Submit needs a second confirmation, and "Keep checking" hands nothing in.
  await page.getByRole("button", { name: "Submit paper" }).click();
  const confirm = page.getByRole("dialog", { name: "Submit your paper?" });
  await expect(confirm).toContainText("You can't change answers after this.");
  await confirm.getByRole("button", { name: "Keep checking" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("heading", { name: "Your paper is handed in" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit paper" }).click();
  await page.getByRole("dialog", { name: "Submit your paper?" }).getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByRole("heading", { name: "Your paper is handed in" })).toBeVisible();
});

test("End asks first, keeps the paper safe and can stop for now", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "End", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "End your mock for now?" });
  await expect(dialog).toContainText("Your answers are saved");
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(dialog).toBeHidden();
  await expect(progress(page)).toHaveText("Question 1 of 8");
  await page.getByRole("button", { name: "End", exact: true }).click();
  await page.getByRole("button", { name: "Stop for now" }).click();
  await expect(page.getByRole("heading", { name: "Your mock is saved" })).toBeVisible();
  await page.getByRole("button", { name: "Continue mock" }).click();
  await expect(progress(page)).toHaveText("Question 1 of 8");
});

test("timer: can be hidden per device, turns amber at 10 minutes and shows a gentle banner at 5", async ({ page }) => {
  await page.clock.install();
  await openMock(page);
  const timer = page.getByRole("timer");
  await expect(timer).toHaveAttribute("data-tone", "calm");

  await page.getByRole("button", { name: "Hide timer" }).click();
  await expect(timer).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show timer" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByRole("button", { name: "Show timer" }).click();

  await page.clock.fastForward("35:30"); // 9:30 left
  await expect(timer).toHaveAttribute("data-tone", "amber");
  await expect(page.locator("[data-timer-banner]")).toHaveCount(0);
  await page.clock.fastForward("05:00"); // 4:30 left
  const banner = page.locator("[data-timer-banner=five-minutes]");
  await expect(banner).toContainText("About 5 minutes left");
  await banner.getByRole("button", { name: "OK" }).click();
  await expect(banner).toHaveCount(0);
});

test("every button, choice card and input is at least 44px, on each main screen", async ({ page }) => {
  await openMock(page);

  async function expectBigTargets(label: string) {
    const targets = page.locator("[data-mock-mode] button:visible, [data-mock-mode] [data-mcq] label:visible, [data-mock-mode] input[type=text]:visible");
    const count = await targets.count();
    expect(count, label).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const target = targets.nth(i);
      const box = (await target.boundingBox())!;
      const name = (await target.innerText().catch(() => "")) || (await target.getAttribute("aria-label")) || `#${i}`;
      expect(box.width, `${label}: "${name.trim()}" width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label}: "${name.trim()}" height`).toBeGreaterThanOrEqual(44);
    }
  }

  await expectBigTargets("multiple choice");
  await page.locator("[data-mcq] label").nth(0).click();
  await expectBigTargets("multiple choice, chosen");
  await goToQuestion(page, 3);
  await drawStroke(page, canvas(page));
  await expectBigTargets("working question");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expectBigTargets("clear confirmation");
  await page.getByRole("button", { name: "Keep working" }).click();
  await page.getByRole("button", { name: "Questions" }).click();
  await expectBigTargets("question list");
  await page.getByRole("dialog", { name: "All questions" }).getByRole("button", { name: "Check your paper" }).click();
  await expectBigTargets("check your paper");
  await page.getByRole("button", { name: "Submit paper" }).click();
  await expectBigTargets("submit confirmation");
  await page.getByRole("button", { name: "Keep checking" }).click();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expectBigTargets("end dialog");
});

test("no sideways scrolling and the writing area is never covered by a control", async ({ page }) => {
  await openMock(page);
  await goToQuestion(page, 5); // the bar graph question
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 60) };
  const topmostIsCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-testid") === "working-canvas", centre);
  expect(topmostIsCanvas).toBe(true);
});
