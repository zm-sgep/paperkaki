import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findBankQuestion } from "./bank";
import { FIXTURE_SERVER, INTERNAL_WORDS, expectFamilyWords, expectNoSideScroll, newDevice, parentMakesMock, signInAs } from "./support";

/**
 * The learning loop on a phone and on an iPad in landscape: a marked mock, then the child's mistakes one at a
 * time, "try one like this", a practice set (right and wrong, a hint, "Show how", one like this), the calm end
 * screen and Today moving on; the child's and the parent's Progress; the parent's "Suggest to ..." pinning a
 * practice on the child's Today; and Mock 2 leaning towards the topic that went wrong.
 *
 * The child answers by looking the question up in the question bank (the app never shows an answer before it
 * is asked for). Set LOOP_SHOTS_DIR to save screenshots.
 */

// The server that offers notice upload too (support.ts: parentMakesMock adds the child by hand); no model is called here.
test.use({ baseURL: FIXTURE_SERVER, actionTimeout: 15_000 });

const shotsDir = process.env.LOOP_SHOTS_DIR;
async function shot(page: Page, name: string, tag: string, fullPage = false) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `loop-${name}-${tag}.png`), fullPage });
}

/** What a child page must never show: percentages, codes, and the word "mastery". */
async function expectChildClean(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(INTERNAL_WORDS);
  expect(text).not.toMatch(/%|mastery|master(ed)?\b/i);
  expect(text).not.toMatch(/Prepare|Account|Sign out|Add child/);
  await expectNoSideScroll(page);
}

const progress = (page: Page) => page.locator("[data-progress]");

type Give = { option: number } | { typed: string } | null;

/** The question on screen as a child sees it: its words, and the choices when it has them. */
async function shownQuestion(page: Page, scope: string): Promise<string> {
  const choices = page.locator("[data-mcq]");
  return `${await page.locator(scope).innerText()}\n${(await choices.count()) > 0 ? await choices.innerText() : ""}`;
}

async function give(page: Page, answer: Give) {
  if (!answer) return;
  if ("option" in answer) await page.locator("[data-mcq] label").nth(answer.option).click();
  else await page.getByRole("textbox", { name: "Your answer" }).fill(answer.typed);
}

/** Answers every question of the mock: right, except a topic that is answered wrongly (or left blank when a wrong answer would need a person). */
async function doMock(page: Page, weakTopic: string) {
  const total = Number(/of (\d+)/.exec(await progress(page).innerText())?.[1]);
  const next = page.getByRole("button", { name: "Next question" });
  for (let n = 1; n <= total; n += 1) {
    const question = findBankQuestion(await shownQuestion(page, "[data-question-surface]"));
    await give(page, question.topicLabel === weakTopic ? question.wrong : question.right);
    if (n < total) {
      await next.click();
      await expect(progress(page)).toHaveText(`Question ${n + 1} of ${total}`);
    }
  }
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Questions" }).click();
  await page.getByRole("dialog", { name: "All questions" }).getByRole("button", { name: "Check your paper" }).click();
  await page.getByRole("button", { name: "Submit paper" }).click();
  await page.getByRole("dialog", { name: "Submit your paper?" }).getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toBeVisible();
}

type Checked = "right" | "wrong" | "unclear";

/** Answers the practice question on screen and presses Check answer. Returns what the feedback says. */
async function checkOne(page: Page, wantWrong: boolean): Promise<Checked> {
  const question = findBankQuestion(await shownQuestion(page, "[data-question-card]"));
  await give(page, wantWrong ? (question.wrong ?? question.right) : question.right);
  await page.getByRole("button", { name: "Check answer" }).click();
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible();
  return (await feedback.getAttribute("data-feedback")) as Checked;
}

const continueButton = (page: Page) => page.getByRole("button", { name: /^(Next question|Finish)$/ });

test.describe("the learning loop", () => {
  test("a marked mock leads to mistakes, practice, progress, a suggestion and a mock that leans", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    const tag = testInfo.project.name;
    const email = `e2e-loop-${tag}@example.test`;
    const name = "Test Child L";
    const weakTopic = "Fractions";

    // The parent makes Mock 1 and gives it to the iPad, then hands the device over.
    await signInAs(page, email);
    const { assessmentId } = await parentMakesMock(page, name);
    await page.getByRole("button", { name: "Do it on iPad instead" }).click();
    await expect(page.locator("[data-ipad-status]")).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: `Hand this device to ${name}` }).click();
    await expect(page).toHaveURL(/\/today$/);

    // The child does the whole mock: everything right except Fractions.
    await page.getByRole("link", { name: "Start" }).click();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(progress(page)).toHaveText(/^Question 1 of \d+$/);
    await doMock(page, weakTopic);

    // Marked at once (nothing needed a person to look): Today points at the results.
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("is marked");
    await page.getByRole("link", { name: "See my results" }).click();
    await expect(page.locator("[data-headline]")).toContainText(/Let's fix \d+ mistakes?\./);
    await expectChildClean(page);

    // Meanwhile the parent, on their own device, sees what Mock 2 will lean towards: the topic that went wrong, and every topic stays.
    const { context: parentContext, device: parent } = await newDevice(browser, page, baseURL);
    await signInAs(parent, email);
    await parent.goto(`/prepare/${assessmentId}`);
    const focus = parent.locator("[data-mock-focus]");
    await expect(focus).toHaveText(/^Mock 2 will focus a little more on .+, and still cover every topic\.$/);
    await expect(focus).toContainText(weakTopic);
    expect((await focus.innerText()).toLowerCase()).not.toMatch(/weight|blueprint|mastery|%/);
    await expectFamilyWords(parent);
    await shot(parent, "mock-2", tag);

    // Mistakes, one at a time: the question, what they wrote, how it works, and one like it.
    const review = page.getByRole("link", { name: "Review mistakes" });
    await expect(review).toHaveAttribute("href", /\/results\/[0-9a-f-]{36}\/mistakes$/);
    await review.click();
    await expect(page.locator("[data-mistake-heading]")).toHaveText(/^Mistake 1 of (\d+)$/);
    const mistakeCount = Number(/of (\d+)/.exec(await page.locator("[data-mistake-heading]").innerText())?.[1]);
    expect(mistakeCount).toBeGreaterThanOrEqual(2);
    await expect(page.locator("[data-worked-solution]")).not.toBeEmpty();
    await expect(page.locator("[data-answer-line]")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Next mistake" })).toHaveAttribute("data-variant", "primary");
    await expect(page.getByRole("button", { name: "Try one like this" })).toHaveAttribute("data-variant", "secondary");
    await expectChildClean(page);
    await shot(page, "mistake", tag);
    await page.getByRole("link", { name: "Next mistake" }).click();
    await expect(page.locator("[data-mistake-heading]")).toHaveText(`Mistake 2 of ${mistakeCount}`);
    await page.getByRole("link", { name: "Previous mistake" }).click();
    await expect(page.locator("[data-mistake-heading]")).toHaveText(`Mistake 1 of ${mistakeCount}`);

    // "Try one like this": a one-question practice on the same skill.
    await page.getByRole("button", { name: "Try one like this" }).click();
    await expect(page).toHaveURL(/\/practice\/session\/[0-9a-f-]{36}$/);
    await expect(progress(page)).toHaveText("Question 1 of 1");
    const firstCheck = await checkOne(page, true);
    if (firstCheck === "wrong") {
      await expect(page.locator("[data-feedback-heading]")).toHaveText("Not quite");
      await expect(page.locator("[data-hint]")).toBeVisible();
      await expect(page.locator("[data-solution]")).toHaveCount(0);
      await page.getByRole("button", { name: "Show how" }).click();
      await expect(page.locator("[data-solution]")).toContainText("Answer:");
      await expect(page.getByRole("button", { name: "Show how" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Next question" }).or(page.getByRole("button", { name: "Finish" }))).toHaveAttribute("data-variant", "primary");
      await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    }
    await expectChildClean(page);
    await continueButton(page).click();
    // The end screen is calm: what they did, and one next step. Mistakes are not yet gone through, so that is next.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Good work\. You practised .+ for 1 minute\.$/);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Review mistakes");
    await expectChildClean(page);

    // Go through the mistakes: jump to the last one, which has the one way to finish.
    const attemptId = /\/results\/([0-9a-f-]{36})/.exec(await page.getByRole("link", { name: "Review mistakes" }).getAttribute("href") ?? "")?.[1] ?? "";
    expect(attemptId).toHaveLength(36);
    await page.goto(`/results/${attemptId}/mistakes?n=999`);
    await expect(page.locator("[data-mistake-heading]")).toHaveText(`Mistake ${mistakeCount} of ${mistakeCount}`);
    await page.getByRole("button", { name: "I've fixed my mistakes" }).click();
    await expect(page).toHaveURL(/\/today$/);

    // Today: the next mission is practice, started in one tap. A one-question try does not count as the day's practice.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Practise /);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Start");
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectChildClean(page);
    await shot(page, "today-practice", tag);

    // Practice home, in the order UX_SPEC 8 gives.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Practice" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Practice" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/^Practise /);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator("[data-browse]")).not.toHaveAttribute("open", "");
    await expectChildClean(page);
    await shot(page, "practice-home", tag, true);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click();
    await page.getByRole("button", { name: "Start" }).click();

    // The practice set: right and wrong, a hint, Show how, one like this; progress dots; nothing about points.
    await expect(page).toHaveURL(/\/practice\/session\/[0-9a-f-]{36}$/);
    await expect(progress(page)).toHaveText(/^Question 1 of \d+$/);
    const setSize = Number(/of (\d+)/.exec(await progress(page).innerText())?.[1]);
    expect(setSize).toBeGreaterThanOrEqual(6);
    expect(setSize).toBeLessThanOrEqual(10);
    await expect(page.locator("[data-dot]")).toHaveCount(setSize);
    await expect(page.locator("[data-dot][data-current]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Check answer" })).toBeDisabled();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    expect((await page.locator("main").innerText()).toLowerCase()).not.toMatch(/point|reward|badge|streak/);
    await expectChildClean(page);
    await shot(page, "practice-question", tag);

    let sawWrong = false;
    let usedSimilar = false;
    for (let guard = 0; guard < 20; guard += 1) {
      const label = (await progress(page).innerText()).trim();
      const position = Number(/Question (\d+) of/.exec(label)?.[1]);
      // Question 1 right; then the first question a wrong answer can be marked for by rule gets one; the rest right.
      const checked = await checkOne(page, position >= 2 && !sawWrong);
      if (checked === "right") {
        await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Well done!");
        await expect(page.locator("[data-hint]")).toHaveCount(0);
      } else {
        sawWrong = true;
        await expect(page.locator("[data-hint]")).toBeVisible();
        await expect(page.locator("[data-solution]")).toHaveCount(0);
        await expect(page.locator("[data-feedback-heading]")).toHaveText(checked === "wrong" ? "Not quite" : "Let's look at this one together");
        await shot(page, "practice-feedback", tag);
        await page.getByRole("button", { name: "Show how" }).click();
        await expect(page.locator("[data-solution]")).toContainText("Answer:");
        if (!usedSimilar && (await page.getByRole("button", { name: "Try one like this" }).count()) > 0) {
          usedSimilar = true;
          await page.getByRole("button", { name: "Try one like this" }).click();
          // The new question comes straight after this one, and the set is one longer.
          await expect(progress(page)).toHaveText(`Question ${position + 1} of ${setSize + 1}`);
          continue;
        }
      }
      await expectChildClean(page);
      const last = await page.getByRole("button", { name: "Finish" }).count();
      await continueButton(page).click();
      if (last > 0) break;
      await expect(page.locator("[data-feedback]")).toHaveCount(0);
    }
    expect(sawWrong).toBe(true);

    // The calm end screen: what they did, and one next action. One set is the day's practice.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Good work\. You practised .+ for \d+ minutes?\.$/);
    await expect(page.getByText("You're done for today. Nice work.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("See my progress");
    expect((await page.locator("main").innerText()).toLowerCase()).not.toMatch(/point|reward|badge|streak/);
    await expectChildClean(page);
    await shot(page, "practice-end", tag);
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're done for today. Nice work.");

    // The child's Progress: a map of stars, their mocks, a place for badges; no numbers about how good they are.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
    const cards = page.locator("[data-topic-card]");
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    for (const card of await cards.all()) await expect(card.locator("[data-stars]")).toHaveAttribute("role", "img");
    await expect(page.getByRole("heading", { level: 2, name: "Achievements" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Your mocks" })).toBeVisible();
    const stars = await page.locator("[data-stars]").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-stars"))));
    expect(stars.every((count) => count >= 0 && count <= 4)).toBe(true);
    await expectChildClean(page);
    await shot(page, "child-progress", tag, true);

    // The parent, on their own device: one sentence, one action, topic states in plain words, detail underneath.
    // Progress opens with what needs the parent first: the results they have not looked at yet.
    await parent.goto("/progress");
    await expect(parent.locator('[data-variant="primary"]')).toHaveText("See what needs work");
    await parent.goto(`/progress/results/${attemptId}`);
    await expect(parent.locator("[data-score]")).toBeVisible();
    await parent.goto("/progress");
    await expect(parent.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
    const summary = parent.locator("[data-summary]");
    await expect(summary).toHaveText(/(needs attention|improved)\.$/);
    expect(await summary.innerText()).not.toMatch(/%|master/i);
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);
    // Practice was done today, so the next step for the parent is the next mock (suggesting is one tap away on a topic).
    await expect(parent.locator('[data-variant="primary"]')).toHaveText("Get the next mock");
    const words = await parent.locator("[data-state-word]").allInnerTexts();
    expect(words.length).toBeGreaterThanOrEqual(3);
    for (const word of words) expect(["Not started", "Learning", "Getting there", "Almost there", "Secure", "Remembered"]).toContain(word);
    await expect(parent.locator("[data-recent-results] li")).toHaveCount(1);
    await expect(parent.locator("[data-detail]")).not.toHaveAttribute("open", "");
    await expectFamilyWords(parent);
    await expectNoSideScroll(parent);
    await shot(parent, "parent-progress", tag, true);
    await parent.locator("[data-detail] summary").click();
    await expect(parent.locator("[data-detail] h3").first()).toBeVisible();
    expect(await parent.locator("body").innerText()).not.toMatch(/P3-[A-Z]{2}/);

    // A topic: its skills in plain words, how much that rests on, one action.
    await parent.locator("[data-topic-states] a").first().click();
    await expect(parent).toHaveURL(/\/progress\/topics\/[0-9a-f-]{36}$/);
    await expect(parent.locator("[data-outcomes] li").first()).toBeVisible();
    await expect(parent.getByText(/Based on \d+ questions? from \d+ sessions?/).first()).toBeVisible();
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectFamilyWords(parent);
    expect((await parent.request.get("/progress/topics/00000000-0000-4000-8000-000000000999")).status()).toBe(404);

    // "Suggest to ...": one button, and the topic becomes the child's next mission.
    await expect(parent.locator('[data-variant="primary"]')).toHaveText(new RegExp(`^Suggest .+ practice to ${name}$`));
    await parent.locator('[data-variant="primary"]').click();
    await expect(parent).toHaveURL(/\/progress\/practice\?topic=[0-9a-f-]{36}$/);
    await expect(parent.getByRole("heading", { level: 1, name: "Practice" })).toBeVisible();
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(parent.getByRole("button", { name: `Suggest to ${name}` })).toHaveAttribute("data-variant", "primary");
    await expectFamilyWords(parent);
    await shot(parent, "parent-suggest", tag);
    await parent.getByRole("button", { name: `Suggest to ${name}` }).click();
    await expect(parent.locator("[data-suggested]")).toContainText(`Suggested to ${name}`);
    await parent.goto("/home");
    await expect(parent.getByRole("heading", { level: 1 })).toContainText(/practice is ready for/);

    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Practise /);
    await expect(page.getByText("Your grown-up picked this for you.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Start");
    await expectChildClean(page);

    // Mock 2 is made once the practice is done.
    await parent.goto(`/prepare/${assessmentId}`);
    await parent.getByRole("button", { name: "Create another mock" }).click();
    await expect(parent).toHaveURL(new RegExp(`/prepare/${assessmentId}/mocks/[0-9a-f-]{36}$`), { timeout: 60_000 });
    await expect(parent.getByRole("heading", { level: 1, name: "Mock 2 is ready" })).toBeVisible();
    await parentContext.close();

    // Another family cannot reach any of it.
    const other = await newDevice(browser, page, baseURL);
    await signInAs(other.device, `e2e-loop-other-${tag}@example.test`);
    expect((await other.device.goto("/progress"))?.status()).toBe(200);
    await expect(other.device.getByRole("heading", { level: 2, name: "Nothing to show yet" })).toBeVisible();
    expect((await other.device.goto("/progress/practice?topic=00000000-0000-4000-8000-000000000999"))?.status()).toBe(200);
    await expect(other.device.getByText("Nothing to suggest yet")).toBeVisible();
    await other.context.close();
  });
});
