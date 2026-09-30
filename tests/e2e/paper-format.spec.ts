import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { extractPdfText } from "../helpers/pdf-text";

/** Words a parent must never see (UX rule 9), and no percentages. */
const BANNED = /blueprint|outcome|inventory|preset|P3-|%/i;

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

function singaporeDateAhead(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function expectNoInternalWords(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(BANNED);
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Ticks every topic on the topic screen and confirms. */
async function chooseEveryTopicAndConfirm(page: Page) {
  await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/scope$/);
  for (const card of await page.locator("label", { has: page.getByRole("checkbox") }).all()) await card.click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(11);
  await page.getByRole("button", { name: "Confirm topics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
}

async function addAssessment(page: Page, type: string, days: number) {
  await page.getByText(type, { exact: true }).click();
  await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(days));
  await page.getByRole("button", { name: "Choose topics" }).click();
}

async function downloadStudentText(page: Page, name: string): Promise<string> {
  const href = (await page.getByRole("link", { name: "Download mock paper" }).getAttribute("href")) ?? "";
  const redirect = await page.request.get(href, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  const file = await page.request.get(redirect.headers()["location"] ?? "");
  expect(file.status()).toBe(200);
  const bytes = await file.body();
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const dir = path.resolve(process.cwd(), "tests/output");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), bytes);
  return (await extractPdfText(bytes)).text;
}

test.describe("paper format", () => {
  test("an end-of-year exam gets the common three-section paper, from screen C to the printed PDF", async ({ page }, testInfo) => {
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-format-eoy-${tag}@example.test`);
    await page.getByRole("link", { name: "Add your child" }).click();
    await page.getByLabel("Your child's name or nickname").fill("Test Child F");
    await addAssessment(page, "End-of-year exam", 30);
    await chooseEveryTopicAndConfirm(page);

    // Screen C: the format in one line, the topics below it, one primary action.
    await expect(page.getByText("50 marks · 1 h 30 min · Sections A, B, C")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Generate first mock");
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    await page.getByRole("button", { name: "Generate first mock" }).click();
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/mocks\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Mock 1 is ready" })).toBeVisible();
    await expect(page.getByText("50 marks · 1 h 30 min · Sections A, B, C")).toBeVisible();
    await expect(page.getByText("Print on A4. Give Test Child F 90 minutes.")).toBeVisible();
    await expectNoInternalWords(page);

    const text = await downloadStudentText(page, `e2e-format-eoy-student-${tag}.pdf`);
    expect(text).toContain("Section A (12 marks)");
    expect(text).toContain("Section B (26 marks)");
    expect(text).toContain("Section C (12 marks)");
    expect(text).toContain("Total: 50 marks");
    expect(text).toContain("Duration: 90 minutes");
    expect(text).toContain("For each question, four options are given.");
    expect(text).toContain("Write your answers in the spaces provided. Give your answers in the units stated.");
    expect(text).toContain("Show your working clearly in the space below each question.");
    expect(text).not.toContain("Answer pack");
  });

  test("a parent matches their school's paper, and the next end-of-year assessment starts from it", async ({ page }, testInfo) => {
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-format-custom-${tag}@example.test`);
    await page.getByRole("link", { name: "Add your child" }).click();
    await page.getByLabel("Your child's name or nickname").fill("Test Child G");
    await addAssessment(page, "End-of-year exam", 30);
    await chooseEveryTopicAndConfirm(page);
    await expect(page.getByText("50 marks · 1 h 30 min · Sections A, B, C")).toBeVisible();

    // The choices are tucked away until asked for; the recommended one comes first.
    await expect(page.getByRole("radio", { name: /Common Primary 3 end-of-year format/ })).toBeHidden();
    await page.getByText("Customise paper").click();
    const radios = page.getByRole("radio", { name: /end-of-year format|Standard mock|Short weighted|Match my school's paper/ });
    await expect(radios.first()).toHaveAccessibleName(/^Common Primary 3 end-of-year format \(Sections A, B, C · 50 marks · 1 h 30 min\) Recommended/);
    await expect(page.getByText("Recommended", { exact: true })).toHaveCount(1);
    await expect(radios.first()).toBeChecked();
    await expect(page.getByRole("radio", { name: /Short weighted assessment \(20 marks · 30 min\)/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Standard mock/ })).toBeVisible();
    // Marks and time come from the format, so the standard fields are not offered.
    await expect(page.getByLabel("Total marks", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Marks and time come from the paper format above.")).toBeVisible();

    // "Match my school's paper": the parts are prefilled from the current format.
    await page.getByText("Match my school's paper", { exact: true }).click();
    await expect(page.getByLabel("Name of this part", { exact: true })).toHaveCount(3);
    await expect(page.getByLabel("Name of this part", { exact: true }).first()).toHaveValue("Section A");
    await expect(page.getByLabel("Number of questions", { exact: true }).nth(1)).toHaveValue("16");
    await expect(page.getByLabel("Total marks", { exact: true }).nth(1)).toHaveValue("26");
    await expect(page.getByLabel("Question type", { exact: true }).nth(2)).toHaveValue("word_problem");
    await expect(page.getByText("Total: 50 marks")).toBeVisible();
    // The booklet name is hidden until asked for.
    await expect(page.getByLabel("Booklet name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add booklet name" })).toHaveCount(3);
    // The checkbox is on by default, in the child's words.
    const future = page.getByLabel("Use this format for Test Child G's future end-of-year exam papers");
    await expect(future).toBeChecked();

    // Touch targets and labels.
    for (const control of [
      page.getByLabel("Name of this part", { exact: true }).first(),
      page.getByLabel("Number of questions", { exact: true }).first(),
      page.getByLabel("Total marks", { exact: true }).first(),
      page.getByLabel("Time in minutes", { exact: true }).last(),
      page.getByRole("button", { name: "Add part" }),
      page.getByRole("button", { name: "Remove part 1" }),
      page.getByRole("button", { name: "Add booklet name" }).first(),
      page.getByRole("button", { name: "Save paper format" }),
    ]) {
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    // A part that cannot add up shows a plain message next to it, and the save button waits.
    const partTwoMarks = page.getByLabel("Total marks", { exact: true }).nth(1);
    await partTwoMarks.fill("40");
    await page.getByLabel("Name of this part", { exact: true }).nth(1).fill("Booklet B");
    await expect(page.getByText("Booklet B: 16 questions can't add up to 40 marks. Short questions are worth 1 or 2 marks, so use 16 to 32 marks.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save paper format" })).toBeDisabled();
    await expect(page.getByText("Total: 64 marks")).toBeVisible();
    await expect(page.getByText("The whole paper must be between 10 and 60 marks. This one is 64 marks.")).toBeVisible();
    await partTwoMarks.fill("26");

    // Rename the parts like the school's paper, drop the last one, set the time.
    await page.getByLabel("Name of this part", { exact: true }).first().fill("Booklet A");
    await page.getByRole("button", { name: "Remove part 3" }).click();
    await expect(page.getByLabel("Name of this part", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Total: 38 marks")).toBeVisible();
    await page.getByLabel("Time in minutes", { exact: true }).last().fill("75");
    await expect(page.getByRole("button", { name: "Save paper format" })).toBeEnabled();
    await page.getByRole("button", { name: "Save paper format" }).click();
    await expect(page.getByText("Saved. The summary above is up to date.")).toBeVisible();
    await expect(page.getByText("38 marks · 1 h 15 min · Booklet A, Booklet B")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectNoInternalWords(page);

    // Generate: the PDF uses the parent's own names and marks.
    await page.getByRole("button", { name: "Generate first mock" }).click();
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/mocks\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const text = await downloadStudentText(page, `e2e-format-custom-student-${tag}.pdf`);
    expect(text).toContain("Booklet A (12 marks)");
    expect(text).toContain("Booklet B (26 marks)");
    // Parts named like booklets print as booklets, each with its own header (commit 5f79de6).
    expect(text).toContain("Total: 12 marks (this booklet)");
    expect(text).toContain("Total: 26 marks (this booklet)");
    expect(text).toContain("Duration: 75 minutes (whole paper)");
    expect(text).not.toContain("Section C");

    // The next end-of-year assessment for the same child starts from the saved format.
    await page.goto("/prepare/new");
    await expect(page.getByRole("radio", { name: "Test Child G" })).toBeChecked();
    await addAssessment(page, "End-of-year exam", 60);
    await chooseEveryTopicAndConfirm(page);
    await expect(page.getByText("38 marks · 1 h 15 min · Booklet A, Booklet B")).toBeVisible();
    await page.getByText("Customise paper").click();
    const nextRadios = page.getByRole("radio", { name: /saved school format|end-of-year format|Standard mock|Short weighted|Match my school's paper/ });
    await expect(nextRadios.first()).toHaveAccessibleName(/^Your saved school format \(Booklet A, Booklet B · 38 marks · 1 h 15 min\) Recommended/);
    await expect(nextRadios.first()).toBeChecked();
    await expect(page.getByText("Recommended", { exact: true })).toHaveCount(1);
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    // The other kinds of assessment for this child are not affected.
    await page.goto("/prepare/new");
    await addAssessment(page, "WA2", 20);
    await chooseEveryTopicAndConfirm(page);
    await expect(page.getByText(/^\d+ marks · \d+ min · Sections A, B$/)).toBeVisible();
  });
});
