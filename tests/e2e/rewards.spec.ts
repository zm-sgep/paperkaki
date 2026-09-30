import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findBankQuestion } from "./bank";
import { FIXTURE_SERVER, answerPracticeSetRight, expectNoSideScroll, newDevice, parentMakesMock, signInAs } from "./support";

/**
 * Learning Points and parent rewards on a phone and on an iPad in landscape: a child practises and sees
 * "+N Learning Points" with a reason; a parent adds a reward the child can afford; the child asks in two taps;
 * the parent approves and the balance drops once; the parent marks it given. While a mock is the mission Today
 * shows no points, and Mock Mode itself never mentions points or rewards.
 *
 * Set REWARDS_SHOTS_DIR to save screenshots.
 */

test.use({ baseURL: FIXTURE_SERVER, actionTimeout: 15_000 });

const shotsDir = process.env.REWARDS_SHOTS_DIR;
async function shot(page: Page, name: string, tag: string, fullPage = true) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `rewards-${name}-${tag}.png`), fullPage });
}

const pointsIn = (text: string): number => Number(/^\+(\d+) Learning Points?/.exec(text.trim())?.[1]);
const balanceOf = async (page: Page): Promise<number> => Number(/^\s*(\d+)/.exec(await page.locator("[data-balance]").innerText())?.[1]);

test.describe("Learning Points and rewards", () => {
  test("a child earns points, asks for a reward, and the parent approves and gives it", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    const tag = testInfo.project.name;
    const email = `e2e-rewards-${tag}@example.test`;
    const name = "Test Child R";

    // The parent makes a mock and gives it to the iPad, then hands the device to the child.
    await signInAs(page, email);
    await parentMakesMock(page, name);
    await page.getByRole("button", { name: "Do it on iPad instead" }).click();
    await expect(page.locator("[data-ipad-status]")).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: `Hand this device to ${name}` }).click();
    await expect(page).toHaveURL(/\/today$/);

    // Today: the mock is the mission, and nothing about points or rewards sits on it.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mock 1");
    expect(await page.locator("main").innerText()).not.toMatch(/point|reward/i);
    await expect(page.locator("[data-points-glance]")).toHaveCount(0);

    // Before a first mock the child can still practise a topic from "Browse topics".
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Practice" }).click();
    await page.locator("[data-browse] summary").click();
    await page.getByRole("button", { name: /^Practise Money/ }).click();
    await expect(page).toHaveURL(/\/practice\/session\/[0-9a-f-]{36}$/);
    expect(await page.locator("main").innerText()).not.toMatch(/point|reward/i);
    await answerPracticeSetRight(page, findBankQuestion);

    // The end screen: the points, why, and one next step. No streaks, no badges.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Good work\. You practised .+ for \d+ minutes?\.$/);
    const earnedLine = page.locator("[data-points-earned]");
    await expect(earnedLine).toHaveText(/^\+\d+ Learning Points? · You .+\.$/);
    const earned = pointsIn(await earnedLine.innerText());
    expect(earned).toBeGreaterThan(0);
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    expect((await page.locator("main").innerText()).toLowerCase()).not.toMatch(/badge|streak|%|multiplier/);
    await expectNoSideScroll(page);
    await shot(page, "child-earned", tag, false);
    // Coming back to the end screen shows the same points, and never awards them again.
    await page.reload();
    await expect(page.locator("[data-points-earned]")).toContainText(`+${earned} Learning Point`);

    // Rewards, before the parent has set any up: honest, with the balance.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rewards" }).click();
    await expect(page).toHaveURL(/\/rewards$/);
    await expect(page.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    expect(await balanceOf(page)).toBe(earned);
    await expect(page.getByText("Your grown-up hasn't set up any rewards yet.")).toBeVisible();
    await shot(page, "child-empty", tag);

    // Today keeps the mock as the mission: even with points, none sit on a mock's card.
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mock 1");
    await expect(page.locator("[data-points-glance]")).toHaveCount(0);

    // The parent, on their own device, adds a reward the child can afford.
    const { context: parentContext, device: parent } = await newDevice(browser, page, baseURL);
    await signInAs(parent, email);
    await parent.getByRole("link", { name: "Rewards" }).first().click();
    await expect(parent).toHaveURL(/\/rewards$/);
    await expect(parent.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    await expect(parent.locator("[data-week-learning]")).toHaveText(String(earned));
    await expect(parent.locator("[data-week-bonus]")).toHaveText("0");
    await expect(parent.locator("[data-top-reasons] li").first()).toBeVisible();
    const cost = Math.max(1, earned - 1);
    await expect(parent.locator("[data-add-reward]")).toHaveAttribute("open", "");
    const addReward = parent.locator("[data-add-reward]");
    await addReward.getByLabel("What is the reward?").fill("Ice cream");
    await addReward.getByLabel("How many points?").fill(String(cost));
    await addReward.getByRole("button", { name: "Add reward" }).click();
    await expect(parent.locator("[data-rewards] [data-reward-row]")).toContainText("Ice cream");
    await expectNoSideScroll(parent);

    // A cost that is not a whole number above zero is refused in plain words.
    if (!(await addReward.evaluate((element) => (element as HTMLDetailsElement).open))) await addReward.locator(":scope > summary").click();
    await addReward.getByLabel("What is the reward?").fill("Free lunch");
    await addReward.getByLabel("How many points?").fill("0");
    await addReward.getByRole("button", { name: "Add reward" }).click();
    await expect(parent.getByText("It has to cost at least 1 point.")).toBeVisible();

    // The child sees it with progress, and asks in two taps.
    await page.goto("/rewards");
    const card = page.locator("[data-reward-card]", { hasText: "Ice cream" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuemax", String(cost));
    await shot(page, "child-rewards", tag);
    await card.getByRole("button", { name: /^Ask for this/ }).click();
    await expect(page.locator("[data-first-ask-tip]")).toHaveText("Your parent will check and say yes or no.");
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Yes, ask" }).click();
    await expect(card.locator('[data-reward-state="waiting"]')).toBeVisible();
    await expect(page.locator('[data-request-status="requested"]')).toContainText("Waiting for your grown-up");
    expect(await balanceOf(page)).toBe(earned);

    // The parent's Home keeps the learning step first, with the request as a quiet line.
    await parent.goto("/home");
    await expect(parent.locator("[data-reward-request]")).toContainText(`${name} asked for Ice cream.`);
    await expect(parent.getByRole("heading", { level: 1 })).toContainText("is waiting on");
    await expect(parent.locator('[data-variant="primary"]')).toHaveCount(1);

    // Rewards: the request comes first, and approving asks once more before it takes any points.
    await parent.goto("/rewards");
    const request = parent.locator("[data-pending] [data-request]");
    await expect(request).toContainText(`${name} would like`);
    await expect(request).toContainText("Ice cream");
    await shot(parent, "parent-rewards", tag);
    await request.getByRole("button", { name: /^Approve/ }).click();
    await expect(parent.locator("[data-approve-confirm]")).toContainText(`This takes ${cost} ${cost === 1 ? "point" : "points"}.`);
    await parent.getByRole("button", { name: "Yes, approve" }).click();
    await expect(parent.locator("[data-pending]")).toHaveCount(0);
    await expect(parent.locator("[data-awaiting]")).toContainText("Ice cream");
    await expect(parent.getByText(`${name} has ${earned - cost} ${earned - cost === 1 ? "point" : "points"}`)).toBeVisible();

    // The balance dropped once, and the child can see the answer.
    await page.reload();
    expect(await balanceOf(page)).toBe(earned - cost);
    await expect(page.locator('[data-request-status="approved"]')).toContainText("Your grown-up said yes");

    // The parent gives it and marks it given; the history keeps learning points, the reward and a bonus apart.
    await parent.getByRole("button", { name: /^Mark as given/ }).click();
    await expect(parent.locator("[data-awaiting]")).toHaveCount(0);
    await parent.locator("[data-bonus] summary").click();
    await parent.getByLabel(`How many points for ${name}?`).fill("3");
    await parent.getByLabel("What is it for?").fill("Helped at home");
    await parent.getByRole("button", { name: "Give the points" }).click();
    await expect(parent.getByText("Gave 3 bonus points.")).toBeVisible();
    await expect(parent.locator("[data-week-bonus]")).toHaveText("3");
    await expect(parent.locator("[data-week-learning]")).toHaveText(String(earned));
    await expect(parent.locator('[data-history-kind="learning"]')).toHaveCount(1);
    await expect(parent.locator('[data-history-kind="reward"]')).toContainText("Used for Ice cream");
    await expect(parent.locator('[data-history-kind="bonus"]')).toContainText("Bonus: Helped at home");
    await shot(parent, "parent-history", tag);

    await page.reload();
    expect(await balanceOf(page)).toBe(earned - cost + 3);
    await expect(page.locator('[data-request-status="fulfilled"]')).toContainText("Given. Enjoy!");
    await expectNoSideScroll(page);

    // Mock Mode: the calm start screen and the paper itself never mention points or rewards.
    await page.goto("/today");
    await page.getByRole("link", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}\/start$/);
    expect(await page.locator("body").innerText()).not.toMatch(/point|reward/i);
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.locator("[data-progress]")).toHaveText(/^Question 1 of \d+$/);
    expect(await page.locator("body").innerText()).not.toMatch(/point|reward/i);
    await parentContext.close();

    // Another family cannot see any of it.
    const other = await newDevice(browser, page, baseURL);
    await signInAs(other.device, `e2e-rewards-other-${tag}@example.test`);
    await other.device.goto("/rewards");
    await expect(other.device.getByText("Learning Points and rewards you set up will appear here.")).toBeVisible();
    await expect(other.device.getByText("Ice cream")).toHaveCount(0);
    await other.context.close();
  });
});
