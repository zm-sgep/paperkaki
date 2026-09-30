import { expect, test } from "@playwright/test";
import { encodeFixturePage, readFixturePage } from "../../src/services/ai/fixture-pages";
import { FIXTURE_SERVER, expectFamilyWords, expectNoSideScroll, newDevice, parentMakesMock, shot, signInAs } from "./support";

/**
 * Uploading a finished printed paper, on a phone and on an iPad: pages are added out of order and put in
 * order by their footer numbers, a blurry page is flagged and retaken, the paper is submitted, one unclear
 * answer comes back as a quick check, and the results follow. Runs with the recorded-answers provider: the
 * "photos" are synthetic pages that carry what the child wrote.
 */
test.use({ baseURL: FIXTURE_SERVER });

const png = (fixture: Parameters<typeof encodeFixturePage>[0], options?: Parameters<typeof encodeFixturePage>[1]) => ({
  name: "page.png",
  mimeType: "image/png",
  buffer: Buffer.from(encodeFixturePage(fixture, options)),
});

test("a photographed paper is put in order, submitted, checked and marked", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const tag = testInfo.project.name;
  const email = `e2e-upload-${tag}@example.test`;
  const name = "Test Child A";

  await signInAs(page, email);
  const { mockUrl, assessmentId } = await parentMakesMock(page, name);

  // Printing stays the one primary action; uploading the finished paper is a quiet second step.
  await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Download mock paper" })).toHaveAttribute("data-variant", "primary");
  const upload = page.getByRole("link", { name: "Upload the finished paper" });
  await expect(upload).toHaveAttribute("data-variant", "secondary");
  await upload.click();
  await expect(page).toHaveURL(new RegExp(`${mockUrl}/upload$`.replace(/[/.]/g, "\\$&")));
  await expect(page.getByRole("heading", { level: 1, name: "Upload the finished paper" })).toBeVisible();
  await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Submit for marking" })).toBeDisabled();
  await shot(page, "upload-empty", tag);

  // Page 2 first, then page 1: the footers put them in order. Page 2 holds an answer that cannot be read.
  await page.locator("[data-choose-pages]").setInputFiles([
    png({ page: 2, defaults: { mcq: "B", number: "12", fraction: "1/2", text: "x" }, answers: { "1": { answerText: "B or C", confident: false } } }),
    png({ page: 1 }),
  ]);
  const grid = page.locator("[data-page-grid] > li");
  await expect(grid).toHaveCount(2);
  const footerOrder = async () => {
    const footers: (number | undefined)[] = [];
    for (const item of await grid.all()) {
      const src = await item.locator("img").getAttribute("src");
      const bytes = await (await page.request.get(src ?? "")).body();
      footers.push(readFixturePage(new Uint8Array(bytes))?.page);
    }
    return footers;
  };
  expect(await footerOrder()).toEqual([1, 2]);
  await expect(grid.first()).toContainText("Page 1");
  await expect(page.locator("[data-problem]")).toHaveCount(0);
  await expect(page.locator("[data-count-note]")).toContainText(/^The paper has \d+ pages and you have added 2\./);

  // A blurry photo is flagged with exactly what to fix; nothing else is.
  await page.locator("[data-choose-pages]").setInputFiles([png({}, { blurry: true })]);
  await expect(grid).toHaveCount(3);
  await expect(page.locator("[data-problem=blurry]")).toHaveCount(1);
  await expect(page.getByText("Page 3 looks blurry. Retake it, holding the camera still.")).toBeVisible();
  await expect(page.locator("[data-problem]")).toHaveCount(1);
  await shot(page, "upload-grid", tag);
  await expectFamilyWords(page);
  await expectNoSideScroll(page);
  for (const button of await page.locator("[data-page-grid] button").all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }

  // The pages can be moved too (also without dragging), and the blurry one is retaken by removing it.
  await expect(page.getByRole("button", { name: "Move Page 1 earlier" })).toBeDisabled();
  await page.getByRole("button", { name: "Move Page 1 later" }).click();
  await expect(async () => expect(await footerOrder()).toEqual([2, 1, undefined])).toPass();
  await page.getByRole("button", { name: "Move Page 1 later" }).click();
  await expect(async () => expect(await footerOrder()).toEqual([1, 2, undefined])).toPass();
  await page.getByRole("button", { name: "Remove Page 3" }).click();
  await expect(grid).toHaveCount(2);
  await expect(page.locator("[data-problem]")).toHaveCount(0);
  expect(await footerOrder()).toEqual([1, 2]);

  // Submit for marking: one primary button; then marking starts and shows where it is.
  await expect(page.getByRole("button", { name: "Submit for marking" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit for marking" }).click();
  await expect(page).toHaveURL(/\/progress\/results\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const attemptId = /results\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? "";

  // Marking progress, or already "quick check": never a fake countdown.
  await expect(async () => {
    await page.goto(`/progress/results/${attemptId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("We need a quick check");
  }).toPass({ timeout: 45_000 });
  await expectFamilyWords(page);
  await shot(page, "upload-needs-check", tag);
  await page.getByRole("link", { name: "Check answers" }).click();

  // The quick check for the answer that could not be read: the page it is on is shown.
  await expect(page.getByRole("heading", { level: 1, name: /^We need a quick check on Question 1\.$/ })).toBeVisible();
  await expect(page.locator("[data-child-answer]")).toHaveText("B or C");
  await expect(page.getByAltText(`${name}'s working for Question 1`)).toBeVisible();
  await expectFamilyWords(page);
  expect(await page.getByRole("radio").count()).toBeGreaterThanOrEqual(2);
  // Every answer that needs a check comes one at a time (a written word that is not on the list needs one too).
  for (let guard = 0; guard < 20 && page.url().includes("/progress/review/"); guard += 1) {
    const before = await page.getByRole("heading", { level: 1 }).innerText();
    await page.getByRole("radio").last().check();
    await page.getByRole("button", { name: "Save and next" }).click();
    await expect(async () => {
      const onResults = page.url().includes("/progress/results/");
      expect(onResults || (await page.getByRole("heading", { level: 1 }).innerText()) !== before).toBe(true);
    }).toPass({ timeout: 20_000 });
  }

  // The results are ready.
  await expect(page).toHaveURL(new RegExp(`/progress/results/${attemptId}$`));
  await expect(page.locator("[data-score]")).toHaveText(/^Score: \d+\/\d+$/);
  await expect(page.locator("[data-change]")).toHaveText("First mock — this is your starting point");
  await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
  await expectFamilyWords(page);
  await shot(page, "upload-results", tag);

  // The mock page says it was uploaded and points at the results.
  await page.goto(mockUrl);
  await expect(page.locator("[data-upload-status]")).toContainText("was uploaded");

  // Nobody else can see the pages, the upload screen or the results.
  const other = await newDevice(browser, page, baseURL);
  await signInAs(other.device, `e2e-upload-other-${tag}@example.test`);
  expect((await other.device.goto(`${mockUrl}/upload`))?.status()).toBe(404);
  expect((await other.device.goto(`/progress/results/${attemptId}`))?.status()).toBe(404);
  expect(assessmentId).toMatch(/^[0-9a-f-]{36}$/);
  await other.context.close();
});
