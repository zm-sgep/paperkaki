import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/** Helpers shared by the browser tests that run a whole mock: parent makes it, child does it, parent marks it. */

/** The server that uses the recorded-answers AI provider (playwright.config.ts). */
export const FIXTURE_SERVER = "http://localhost:3101";

/** Words a family must never see (UX rule 9). */
export const INTERNAL_WORDS = /confidence|\bAI\b|\bmodel\b|blueprint|outcome|P3-/i;

const shotsDir = process.env.RESULTS_SHOTS_DIR;

export async function shot(page: Page, name: string, tag: string, fullPage = false) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `results-${name}-${tag}.png`), fullPage });
}

export function singaporeDateAhead(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Adds the child and an end-of-year exam in 14 days by hand (this server offers notice upload too), and
 * generates Mock 1. The end-of-year paper is the one with word problems in it.
 */
export async function parentMakesMock(page: Page, childName: string): Promise<{ assessmentId: string; mockUrl: string }> {
  await page.getByRole("link", { name: "Add your child" }).click();
  await page.getByRole("link", { name: "Enter details myself" }).click();
  await expect(page).toHaveURL(/manual=1/);
  await page.getByLabel("Your child's name or nickname").fill(childName);
  await page.getByText("End-of-year exam", { exact: true }).click();
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

export async function newDevice(browser: Browser, page: Page, baseURL: string | undefined, state?: Awaited<ReturnType<BrowserContext["storageState"]>>): Promise<{ context: BrowserContext; device: Page }> {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const context = await browser.newContext({ baseURL: baseURL ?? "", viewport, hasTouch: true, ...(state ? { storageState: state } : {}) });
  return { context, device: await context.newPage() };
}

export async function drawStroke(page: Page, area: Locator) {
  await area.scrollIntoViewIfNeeded();
  const box = (await area.boundingBox())!;
  const x = box.x + box.width * 0.15;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) await page.mouse.move(x + i * 8, y + Math.sin(i / 3) * 18);
  await page.mouse.up();
}

export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function expectFamilyWords(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(INTERNAL_WORDS);
}
