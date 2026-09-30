import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * School-notice upload (Milestone 5). These tests run against a second server that uses the
 * recorded-answers provider (no model is ever called); the main server keeps uploads switched off,
 * and one test checks that.
 */
const NOTICE_SERVER = "http://localhost:3101";
const SAMPLE_DIR = path.resolve(process.cwd(), "tests/fixtures/notices");
const PDF = path.join(SAMPLE_DIR, "p3-eoy-sample.pdf");
const PHOTOS = ["p3-eoy-sample-photo-1.png", "p3-eoy-sample-photo-2.png"].map((name) => path.join(SAMPLE_DIR, name));

/** Words a parent must never see (UX rules 9 and 12 of the usability criteria). */
const BANNED = /confidence|\bAI\b|extraction|blueprint|outcome|P3-/i;

/** The sample letter's Mathematics paper is on this day. Once it has passed the date must be moved. */
const SAMPLE_DATE = "2026-10-27";

/** A 1x1 PNG with no recorded reading: the provider cannot read it. */
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function singaporeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
}

function singaporeDateAhead(days: number): string {
  const [y, m, d] = singaporeToday().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function expectCalmPage(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(BANNED);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function startAddingFor(page: Page, nickname: string) {
  await page.getByRole("link", { name: "Add your child" }).click();
  await expect(page).toHaveURL(/\/prepare\/new$/);
  await page.getByLabel("Your child's name or nickname").fill(nickname);
}

async function chooseFiles(page: Page, files: string[] | { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.locator('input[type="file"]').setInputFiles(files);
}

async function expectFound(page: Page) {
  await expect(page).toHaveURL(/\/prepare\/new\/notice\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "We found this" })).toBeVisible({ timeout: 30_000 });
}

/** If the sample date has passed, move the date on the way through Edit, so the flow keeps working. */
async function keepDateInTheFuture(page: Page) {
  if (singaporeToday() <= SAMPLE_DATE) return;
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(30));
  await page.getByRole("button", { name: "Done" }).click();
}

test.describe("school notice upload", () => {
  test.use({ baseURL: NOTICE_SERVER });

  test("the PDF goes from Screen A to a confirmed scope and a mock in three screens", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-pdf-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N1");

    // Screen A: one big action, and a quiet way to type the details instead.
    await expect(page.getByText("Upload school notice", { exact: true })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Enter details myself" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose topics" })).toHaveCount(0);
    await expectCalmPage(page);

    await chooseFiles(page, [PDF]);

    // Screen B: what was found, in a parent's words.
    await expectFound(page);
    await expect(page.getByText("We used the Mathematics part of the letter.")).toBeVisible();
    await expect(page.getByText("End-of-year exam", { exact: true })).toBeVisible();
    await expect(page.getByText("Tue 27 Oct")).toBeVisible();
    await expect(page.getByText("1 h 30 min")).toBeVisible();
    await expect(page.getByText("Section A: 6 multiple-choice, 12 marks")).toBeVisible();
    await expect(page.getByText("Section B: 16 short-answer, 26 marks")).toBeVisible();
    await expect(page.getByText("Section C: 4 word problems, 12 marks")).toBeVisible();
    await expect(page.getByText("50 marks", { exact: true })).toBeVisible();
    await expect(page.getByText("Fractions", { exact: true })).toBeVisible();
    await expect(page.getByText("Word problems are included across topics.")).toBeVisible();
    await expect(page.getByText("Protractors are not allowed")).toBeVisible();
    await expect(page.getByText("Please check")).toHaveCount(0);
    await expect(page.getByText("Use this format for Test Child N1's future end-of-year exam papers")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Looks right");
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expectCalmPage(page);

    await keepDateInTheFuture(page);
    await page.getByRole("button", { name: "Looks right" }).click();

    // Screen C: the format in one line, then the first mock.
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
    await expect(page.getByText("50 marks · 1 h 30 min · Sections A, B, C")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Generate first mock");
    await expectCalmPage(page);

    await page.getByRole("button", { name: "Generate first mock" }).click();
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/mocks\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Mock 1 is ready" })).toBeVisible();
  });

  test("two photos of the letter read the same, and a topic can be changed on the spot", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-photos-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N2");
    await chooseFiles(page, PHOTOS);
    await expectFound(page);
    await expect(page.getByText("Section C: 4 word problems, 12 marks")).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Which assessment?")).toHaveValue("end_of_year");
    await page.getByText("Time and how long things take", { exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Time and how long things take")).toHaveCount(0);
    await expect(page.getByText("Fractions", { exact: true })).toBeVisible();

    await keepDateInTheFuture(page);
    await page.getByRole("button", { name: "Looks right" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
    await expect(page.getByText("50 marks · 1 h 30 min · Sections A, B, C")).toBeVisible();
    await expect(page.getByText(/Time and how long things take/)).toHaveCount(0);
  });

  test("a date that has passed is asked about next to the date, and nothing is lost", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-date-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N3");
    await chooseFiles(page, [PDF]);
    await expectFound(page);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Date of the assessment").evaluate((input: HTMLInputElement) => {
      input.min = "";
    });
    await page.getByLabel("Date of the assessment").fill("2020-01-06");
    await page.getByRole("button", { name: "Looks right" }).click();
    await expect(page.getByText("Choose today or a later date.")).toBeVisible();
    await expect(page.getByLabel("Date of the assessment")).toBeVisible();
    await expect(page.getByLabel("Name of this part").nth(2)).toHaveValue("Section C");
    await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(20));
    await page.getByRole("button", { name: "Looks right" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
  });

  test("a file that cannot be read says so calmly and offers the way forward", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-unreadable-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N4");
    await chooseFiles(page, [{ name: "photo.png", mimeType: "image/png", buffer: BLANK_PNG }]);

    await expect(page).toHaveURL(/\/prepare\/new\/notice\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "We couldn't read this file clearly." })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Your child's details are saved.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Try another file");
    await expect(page.getByRole("link", { name: "Enter details myself" })).toBeVisible();
    await expectCalmPage(page);

    // Another file, straight from here.
    await chooseFiles(page, [PDF]);
    await expectFound(page);

    // And the manual form is still there.
    await page.goto("/prepare/new?manual=1");
    await expect(page.getByRole("button", { name: "Choose topics" })).toBeVisible();
  });

  test("a file that is not a notice is refused with a plain message on the same screen", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-refused-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N5");
    await chooseFiles(page, [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some words") }]);
    await expect(page.getByText("We can only read a PDF, or photos and screenshots saved as JPEG or PNG.")).toBeVisible();
    await expect(page).toHaveURL(/\/prepare\/new$/);
    await expect(page.getByLabel("Your child's name or nickname")).toHaveValue("Test Child N5");
    await expectCalmPage(page);
  });

  test("Delete this file removes it, and the notice is gone", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-delete-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N6");
    await chooseFiles(page, [PDF]);
    await expectFound(page);
    const noticeUrl = page.url();
    await page.getByRole("button", { name: "Delete this file" }).click();
    await expect(page).toHaveURL(/\/prepare\/new$/);
    const gone = await page.request.get(noticeUrl);
    expect(gone.status()).toBe(404);
  });

  test("someone else cannot see the notice, its status or a way to delete it", async ({ page, browser }, testInfo) => {
    await signInAs(page, `e2e-notice-owner-${testInfo.project.name}@example.test`);
    await startAddingFor(page, "Test Child N7");
    await chooseFiles(page, [PDF]);
    await expectFound(page);
    const noticeUrl = page.url();
    const sourceId = noticeUrl.split("/").pop() ?? "";

    const status = await page.request.get(`/api/notice-sources/${sourceId}/status`);
    expect(status.status()).toBe(200);
    expect(await status.json()).toEqual({ status: "succeeded", failureCode: null });

    const stranger = await signedInContext(browser, `e2e-notice-stranger-${testInfo.project.name}@example.test`);
    try {
      const notice = await stranger.request.get(noticeUrl);
      expect(notice.status()).toBe(404);
      const theirStatus = await stranger.request.get(`/api/notice-sources/${sourceId}/status`);
      expect(theirStatus.status()).toBe(404);
    } finally {
      await stranger.context.close();
    }

    const signedOut = await page.context().browser()?.newContext({ baseURL: NOTICE_SERVER });
    try {
      const anonymous = await signedOut?.request.get(`/api/notice-sources/${sourceId}/status`);
      expect(anonymous?.status()).toBe(401);
    } finally {
      await signedOut?.close();
    }
  });
});

async function signedInContext(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: NOTICE_SERVER });
  const page = await context.newPage();
  await signInAs(page, email);
  return { context, request: context.request };
}

test.describe("uploads switched off", () => {
  test("the default server offers no upload, only the details form", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-notice-off-${testInfo.project.name}@example.test`);
    await page.getByRole("link", { name: "Add your child" }).click();
    await expect(page).toHaveURL(/\/prepare\/new$/);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByText(/upload/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choose topics" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Choose topics");
    await expectCalmPage(page);
  });
});
