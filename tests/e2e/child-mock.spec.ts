import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * The child experience end to end, on a phone and on an iPad in landscape: a parent makes a mock and
 * gives it to the iPad, hands the device over, and the child starts, answers, draws, reloads, checks
 * the paper, hands it in and lands on "done for today". Also the two ways a device is set up.
 *
 * Set CHILD_SHOTS_DIR to save screenshots of the main child screens.
 */

const PARENT_WORDS = /Prepare|Account|Sign out|Add child/;
const shotsDir = process.env.CHILD_SHOTS_DIR;

async function shot(page: Page, name: string, tag: string) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `child-${name}-${tag}.png`), fullPage: false });
}

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A date `days` ahead of today in Singapore, "YYYY-MM-DD". */
function singaporeDateAhead(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Adds the child and a WA2 in 14 days, chooses three topics and generates Mock 1. Ends on the mock page. */
async function parentMakesMock(page: Page, childName: string): Promise<{ assessmentId: string; mockUrl: string }> {
  await page.getByRole("link", { name: "Add your child" }).click();
  await page.getByLabel("Your child's name or nickname").fill(childName);
  await page.getByText("WA2", { exact: true }).click();
  await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(14));
  await page.getByRole("button", { name: "Choose topics" }).click();
  await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/scope$/);
  const assessmentId = /\/prepare\/([0-9a-f-]{36})\/scope$/.exec(page.url())?.[1] ?? "";
  for (const label of ["Fractions", "Whole numbers to 10 000", "Adding and subtracting bigger numbers"]) {
    await page.getByText(label, { exact: true }).click();
  }
  await page.getByRole("button", { name: "Confirm topics" }).click();
  await page.getByRole("button", { name: "Generate first mock" }).click();
  await expect(page).toHaveURL(new RegExp(`/prepare/${assessmentId}/mocks/[0-9a-f-]{36}$`), { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Mock 1 is ready" })).toBeVisible();
  return { assessmentId, mockUrl: page.url() };
}

const progress = (page: Page) => page.locator("[data-progress]");
const next = (page: Page) => page.getByRole("button", { name: "Next question" });
const previous = (page: Page) => page.getByRole("button", { name: "Previous question" });
const canvas = (page: Page) => page.getByTestId("working-canvas");

async function currentQuestion(page: Page): Promise<number> {
  return Number(/Question (\d+) of/.exec((await progress(page).innerText()).trim())?.[1]);
}

async function goToQuestion(page: Page, n: number) {
  for (let guard = 0; guard < 80; guard += 1) {
    const current = await currentQuestion(page);
    if (current === n) return;
    await (current < n ? next(page) : previous(page)).click();
  }
  throw new Error(`could not reach question ${n}`);
}

async function drawStroke(page: Page, area: Locator) {
  await area.scrollIntoViewIfNeeded();
  const box = (await area.boundingBox())!;
  const x = box.x + box.width * 0.15;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) await page.mouse.move(x + i * 8, y + Math.sin(i / 3) * 18);
  await page.mouse.up();
}

async function newDevice(browser: Browser, page: Page, baseURL: string | undefined, state?: Awaited<ReturnType<BrowserContext["storageState"]>>): Promise<{ context: BrowserContext; device: Page }> {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const context = await browser.newContext({ baseURL: baseURL ?? "", viewport, hasTouch: true, ...(state ? { storageState: state } : {}) });
  return { context, device: await context.newPage() };
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("child: the iPad mock, start to finish", () => {
  test("a parent gives the mock to the iPad, and the child does it, resumes it and hands it in", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const tag = testInfo.project.name;
    const name = "Test Child A";
    await signInAs(page, `e2e-child-flow-${tag}@example.test`);
    const { mockUrl } = await parentMakesMock(page, name);

    // The mock page: print stays the one primary action; the iPad is a quiet second choice.
    await expect(page.getByRole("link", { name: "Download mock paper" })).toHaveAttribute("data-variant", "primary");
    const ipad = page.getByRole("button", { name: "Do it on iPad instead" });
    await expect(ipad).toHaveAttribute("data-variant", "secondary");
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await ipad.click();
    await expect(page.getByText(`Mock 1 is waiting on ${name}'s Today screen.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Do it on iPad instead" })).toHaveCount(0);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByText(`Mock 1 is waiting on ${name}'s Today screen.`)).toBeVisible();

    // Parent Home now says where the mock is.
    await page.goto("/home");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Mathematics WA2 · Mock 1 is waiting on ${name}'s Today screen`);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);

    // Hand this device to the child, from Account.
    await page.goto("/account");
    await page.getByRole("button", { name: `Hand this device to ${name}` }).click();
    await expect(page).toHaveURL(/\/today$/);

    // Today: one mission, one button, four destinations, nothing that belongs to a parent.
    await expect(page.getByText(`Hi ${name}`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Mathematics WA2 · Mock 1" })).toBeVisible();
    await expect(page.getByText("45 min", { exact: true })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Start");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText(["Today", "Practice", "Progress", "Rewards"]);
    await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    for (const link of await nav.getByRole("link").all()) expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(await page.locator("body").innerText()).not.toMatch(PARENT_WORDS);
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("points");
    expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("16px");
    expect(await page.locator("[data-child-shell]").evaluate((el) => getComputedStyle(el).fontSize)).toBe("18px");
    await expectNoSideScroll(page);
    await shot(page, "today", tag);

    // The other three destinations are honest and friendly, and keep the same four tabs.
    for (const [label, text] of [
      ["Practice", "Practice will appear here after your first mock."],
      ["Progress", "Your progress will show here after your first mock."],
      ["Rewards", "Rewards will appear here when a grown-up sets them up."],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
      await expect(page.getByText(text)).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
      expect(await page.locator("body").innerText()).not.toMatch(PARENT_WORDS);
    }
    await expect(page).toHaveURL(/\/rewards$/);
    await nav.getByRole("link", { name: "Today" }).click();

    // A child device can never reach the parent's screens.
    for (const parentPath of ["/home", "/prepare", "/account", "/admin", mockUrl]) {
      await page.goto(parentPath);
      await expect(page, parentPath).toHaveURL(/\/sign-in$/);
    }
    await page.goto("/today");

    // Start: the calm screen first. No points, no offers.
    await page.getByRole("link", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}\/start$/);
    const attemptId = /\/mock\/([0-9a-f-]{36})\/start$/.exec(page.url())?.[1] ?? "";
    await expect(page.getByRole("heading", { level: 1, name: "Mathematics WA2 · Mock 1" })).toBeVisible();
    await expect(page.getByText("40 marks")).toBeVisible();
    await expect(page.getByText("45 min", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ questions$/)).toBeVisible();
    await expect(page.locator("[data-mock-start] ol > li")).toHaveCount(3);
    await expect(page.locator("nav")).toHaveCount(0);
    expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/point|reward|badge/);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Start" })).toHaveAttribute("data-variant", "primary");
    await shot(page, "premock", tag);
    await page.getByRole("button", { name: "Start" }).click();

    // Mock Mode: no navigation, no points, no hints.
    await expect(page).toHaveURL(new RegExp(`/mock/${attemptId}$`));
    await expect(progress(page)).toHaveText(/^Question 1 of \d+$/);
    const total = Number(/of (\d+)/.exec(await progress(page).innerText())?.[1]);
    await expect(page.locator("nav")).toHaveCount(0);
    await expect(page.locator("a")).toHaveCount(0);
    await expect(page.getByRole("timer")).toContainText(/4[45]:\d\d/);
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const word of ["home", "prepare", "account", "rewards", "points", "hint", "correct", "well done"]) expect(body, word).not.toContain(word);
    await shot(page, "mock", tag);

    // Question 1 (multiple choice) with working, question 2, then the first typed question.
    await page.locator("[data-mcq] label").nth(2).click();
    await page.getByRole("button", { name: "Use working space" }).click();
    await drawStroke(page, canvas(page));
    await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");
    await next(page).click();
    await page.locator("[data-mcq] label").nth(1).click();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();

    let typedQuestion = 0;
    for (let n = 3; n <= total && typedQuestion === 0; n += 1) {
      await next(page).click();
      if (await page.locator("[data-typed-answer]").isVisible()) typedQuestion = n;
    }
    expect(typedQuestion).toBeGreaterThan(2);
    await page.getByRole("textbox", { name: "Your answer" }).fill("42");
    await drawStroke(page, canvas(page));
    await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");

    // Reload: everything is where it was, from this device and from the server.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(progress(page)).toHaveText(`Question ${typedQuestion} of ${total}`);
    await expect(page.getByRole("textbox", { name: "Your answer" })).toHaveValue("42");
    await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");
    await goToQuestion(page, 2);
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await goToQuestion(page, 1);
    await expect(page.getByRole("radio").nth(2)).toBeChecked();
    await expect(canvas(page)).toHaveAttribute("data-stroke-count", "1");
    await expect(page.getByRole("timer")).toContainText(/4[45]:\d\d/);

    // The same paper on another device (no saved copy there): the server has it all.
    const { context: other, device } = await newDevice(browser, page, baseURL, await page.context().storageState());
    await device.goto(`/today`);
    await expect(device.getByRole("heading", { level: 1, name: "Carry on with your mock" })).toBeVisible();
    await expect(device.getByText(/^Question \d+ of \d+$/)).toBeVisible();
    await device.getByRole("link", { name: "Continue" }).click();
    await expect(device.locator("[data-progress]")).toHaveText(/^Question \d+ of \d+$/);
    await goToQuestion(device, 2);
    await expect(device.getByRole("radio").nth(1)).toBeChecked();
    await goToQuestion(device, typedQuestion);
    await expect(device.getByRole("textbox", { name: "Your answer" })).toHaveValue("42");
    await expect(device.getByTestId("working-canvas")).toHaveAttribute("data-stroke-count", "1");
    // The clock is the server's: the same on both devices, not restarted.
    const remaining = async (p: Page) => {
      const [m, s] = (/(\d+):(\d\d)/.exec(await p.getByRole("timer").innerText()) ?? []).slice(1).map(Number) as [number, number];
      return m * 60 + s;
    };
    expect(Math.abs((await remaining(device)) - (await remaining(page)))).toBeLessThan(20);
    expect(await remaining(device)).toBeLessThan(45 * 60);
    await other.close();

    // Check your paper lists what is not answered.
    await page.getByRole("button", { name: "Questions" }).click();
    await page.getByRole("dialog", { name: "All questions" }).getByRole("button", { name: "Check your paper" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Check your paper" })).toBeVisible();
    await expect(page.getByText(`You have answered 3 of ${total} questions.`)).toBeVisible();
    const unanswered = page.locator("[data-review-group=unanswered]");
    await expect(unanswered).toContainText(`Not answered yet (${total - 3})`);
    await expect(unanswered.getByRole("button", { name: "Question 3", exact: true })).toHaveCount(typedQuestion === 3 ? 0 : 1);
    await expect(page.locator("a")).toHaveCount(0);
    await expect(page.locator("nav")).toHaveCount(0);

    // Submit needs a second confirmation.
    await page.getByRole("button", { name: "Submit paper" }).click();
    const confirm = page.getByRole("dialog", { name: "Submit your paper?" });
    await expect(confirm).toContainText("You can't change answers after this.");
    await confirm.getByRole("button", { name: "Keep checking" }).click();
    await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toHaveCount(0);
    await page.getByRole("button", { name: "Submit paper" }).click();
    await page.getByRole("dialog", { name: "Submit your paper?" }).getByRole("button", { name: "Yes, submit" }).click();

    // Submitted: thanks, one button, no score.
    await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/score|\d+\s*\/\s*\d+|marks|points/i);
    await shot(page, "submitted", tag);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toBeVisible();

    // Today moves on. When every answer could be marked by rule the results are already there ("Your ... is marked");
    // when one needs a grown-up's quick check it is "done for today" until that is done. The paper cannot be opened again.
    await page.getByRole("link", { name: "Back to Today" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^(You're done for today\. Nice work\.|Your Mathematics WA2 · Mock 1 is marked)$/ })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await shot(page, "done", tag);
    await page.goto(`/mock/${attemptId}/start`);
    await expect(page.getByRole("heading", { name: "Paper submitted. Well done!" })).toBeVisible();

    // Not found for a paper that is not this child's.
    const missing = await page.goto("/mock/00000000-0000-4000-8000-000000000999");
    expect(missing?.status()).toBe(404);
  });

  test("another family's child cannot open this attempt, and a parent sees a status page rather than the paper", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-child-owner-${tag}@example.test`);
    const { mockUrl } = await parentMakesMock(page, "Test Child A");
    await page.getByRole("button", { name: "Do it on iPad instead" }).click();
    await expect(page.locator("[data-ipad-status]")).toBeVisible();
    await page.goto("/home");
    await page.getByRole("link", { name: "Hand over the iPad" }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
    const attemptUrl = page.url();
    // The parent's page: where the mock is, one way to hand over, and a way home. Never the paper.
    await expect(page.getByRole("heading", { level: 1, name: "Mock 1 is waiting on Test Child A's Today screen." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hand this device to Test Child A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
    await expect(page.locator("[data-progress]")).toHaveCount(0);

    // A second family's child (paired here with a code) gets a 404 for it.
    const otherParent = await browser.newContext({ baseURL: baseURL ?? "" });
    const parentPage = await otherParent.newPage();
    await signInAs(parentPage, `e2e-child-other-${tag}@example.test`);
    await parentPage.getByRole("link", { name: "Add your child" }).click();
    await parentPage.getByLabel("Your child's name or nickname").fill("Test Child B");
    await parentPage.getByText("WA2", { exact: true }).click();
    await parentPage.getByLabel("Date of the assessment").fill(singaporeDateAhead(14));
    await parentPage.getByRole("button", { name: "Choose topics" }).click();
    await parentPage.goto("/account");
    await parentPage.getByRole("button", { name: "Hand this device to Test Child B" }).click();
    await expect(parentPage).toHaveURL(/\/today$/);
    for (const target of [attemptUrl, `${attemptUrl}/start`]) {
      const response = await parentPage.goto(target);
      expect(response?.status(), target).toBe(404);
    }
    await otherParent.close();
    expect(mockUrl).toContain("/mocks/");
  });
});

test.describe("child: setting up a device", () => {
  test("a parent sets up the iPad with a code; a wrong code is refused calmly; removing the device ends its session", async ({ page, browser, baseURL }, testInfo) => {
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-child-pair-${tag}@example.test`);
    await page.getByRole("link", { name: "Add your child" }).click();
    await page.getByLabel("Your child's name or nickname").fill("Test Child A");
    await page.getByText("WA2", { exact: true }).click();
    await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(20));
    await page.getByRole("button", { name: "Choose topics" }).click();
    await page.goto("/account");

    await page.getByText("Set up Test Child A's iPad", { exact: false }).click();
    await page.getByRole("button", { name: "Show a code" }).click();
    const codeBox = page.locator("[data-pairing-code]");
    await expect(codeBox).toBeVisible();
    const code = ((await codeBox.locator("p").first().innerText()).replace(/\s/g, ""));
    expect(code).toMatch(/^\d{6}$/);
    await expect(codeBox).toContainText("/child");
    await expect(page.getByText("The code works once, for 10 minutes.")).toBeVisible();

    // The child's own device.
    const { context: kid, device } = await newDevice(browser, page, baseURL);
    await device.goto("/child");
    await expect(device.getByRole("heading", { level: 1, name: "Let's get you started" })).toBeVisible();
    await expect(device.getByLabel("Enter the code from your parent")).toBeVisible();
    await expect(device.getByRole("link", { name: "Grown-up? Sign in" })).toBeVisible();
    await shot(device, "code", tag);
    await device.goto("/today");
    await expect(device).toHaveURL(/\/child$/);

    const wrong = code === "000000" ? "111111" : "000000";
    await device.getByLabel("Enter the code from your parent").fill(wrong);
    await device.getByRole("button", { name: "Go" }).click();
    await expect(device.locator("#pair-code-error")).toContainText("That code didn't work.");
    await device.getByLabel("Enter the code from your parent").fill(code.replace(/^(\d{3})(\d{3})$/, "$1 $2"));
    await device.getByRole("button", { name: "Go" }).click();
    await expect(device).toHaveURL(/\/today$/);
    await expect(device.getByText("Hi Test Child A")).toBeVisible();
    await expect(device.getByRole("heading", { level: 1, name: "You're done for today. Nice work." })).toBeVisible();
    // The screens are the child's, whatever the address.
    await device.goto("/progress");
    await expect(device.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
    await expect(device.getByText("Hi Test Child A")).toBeVisible();
    await device.goto("/child");
    await expect(device).toHaveURL(/\/today$/);

    // The parent sees the device and can remove it; the child is sent back to the code screen at once.
    await page.reload();
    await expect(page.getByText("Test Child A's iPad", { exact: true })).toBeVisible();
    await page.locator("details", { hasText: "Remove Test Child A's iPad?" }).locator("summary").click();
    await page.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(page.getByText("Test Child A's iPad", { exact: true })).toHaveCount(0);
    await device.goto("/today");
    await expect(device).toHaveURL(/\/child$/);
    await kid.close();
  });
});
