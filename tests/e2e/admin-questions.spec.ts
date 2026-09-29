import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

const ADMIN = "admin@example.test";

async function filterByTopic(page: Page, topic: string) {
  await page.getByLabel("Topic").selectOption({ label: topic });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/topic=/);
}

test.describe("admin question bank", () => {
  test("a normal parent gets 404 at /admin/questions and the editor", async ({ page }) => {
    await signInAs(page, "e2e-parent-questions@example.test");
    for (const path of ["/admin/questions", "/admin/questions/new"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeVisible();
    }
    await expect(page.locator("body")).not.toContainText("Question bank");
  });

  test("a signed-out visitor is sent to sign in", async ({ page }) => {
    await page.goto("/admin/questions");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the list is paginated, and filters combine", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/questions");
    await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Showing 1–25 of \d+ questions/ })).toBeVisible();
    await expect(page.locator("main ul li a[href^='/admin/questions/']")).toHaveCount(25);
    const listOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(listOverflow, "the list must not scroll sideways").toBeLessThanOrEqual(1);

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

    await filterByTopic(page, "Fractions");
    await expect(page.getByRole("link", { name: /P3-NA-FR-F01/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /P3-NA-MN-F01/ })).toHaveCount(0);

    await page.getByLabel("Question type").selectOption({ label: "Multiple choice" });
    await page.getByLabel("Status").selectOption({ label: "Approved" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByLabel("Topic")).toHaveValue(/.+/);
    await expect(page.getByLabel("Question type")).toHaveValue("mcq");
    const links = page.locator("main ul li a[href^='/admin/questions/']");
    await expect(links.first()).toContainText("Multiple choice");
    await expect(links.first()).toContainText("Approved");
    await expect(links.filter({ hasText: "Number answer" })).toHaveCount(0);

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/admin\/questions$/);
    await expect(page.getByLabel("Topic")).toHaveValue("");
  });

  test("filtering by topic Fractions and opening a question shows a stacked fraction in the preview", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/questions");
    await filterByTopic(page, "Fractions");
    await page.getByRole("link", { name: /P3-NA-FR-F01/ }).first().click();

    await expect(page.getByRole("heading", { level: 2, name: "How the pupil sees it" })).toBeVisible();
    const pupil = page.locator("[data-question-view]").first();
    await expect(pupil.locator("[data-fraction]").first()).toBeVisible();
    await expect(pupil.locator("[data-options] li")).toHaveCount(4);
    // The pupil's view never shows the answer; the answer has its own, separately labelled section.
    await expect(pupil).not.toContainText("Answer");
    await expect(pupil).not.toContainText("Worked solution");
    await expect(page.getByRole("heading", { level: 2, name: /Answer and worked solution/ })).toBeVisible();
    await expect(page.locator("[data-answer-view]")).toContainText("Answer:");
    await expect(page.locator('[data-verification="good"]')).toContainText("Answer check passed");
    await expect(page.locator("[data-status]").first()).toHaveText("Approved");
    // A trail of who did what.
    await expect(page.getByText("Approved").first()).toBeVisible();
    await expect(page.getByText(/Development fixture: auto-approved, needs human review before production/)).toBeVisible();
  });

  test("diagram questions draw as SVG in the preview", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/questions");
    await filterByTopic(page, "Bar Graphs");
    await page.getByRole("link", { name: /P3-ST-BG-F03/ }).first().click();
    const diagram = page.locator("[data-question-view] [data-diagram='bargraph'] svg");
    await expect(diagram).toBeVisible();
    await expect(diagram).toHaveAttribute("aria-label", /Bar graph:/);
    await expect(diagram.locator("rect")).not.toHaveCount(0);
    const box = await diagram.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(100);
    // No sideways page scroll, even on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("write a question, catch mistakes as you type, save, review and approve it", async ({ page }, testInfo) => {
    const code = `E2E-Q-${testInfo.project.name === "phone" ? "PHONE" : "IPAD"}`;
    await signInAs(page, ADMIN);
    await page.goto("/admin/questions/new");
    await expect(page.getByRole("heading", { level: 1, name: "New question" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the editor must not scroll sideways").toBeLessThanOrEqual(1);

    // Starts from a valid skeleton: only the family and the outcome are missing.
    const save = page.getByRole("button", { name: "Save draft" });
    await expect(save).toBeDisabled();
    await expect(page.getByText("Fix the problems marked above to save.")).toBeVisible();

    await page.getByLabel("Family code").fill(code);
    await page.getByLabel("Family title").fill("Adding money (browser test)");
    await page.getByLabel("Main curriculum outcome").selectOption({ index: 1 });
    await expect(save).toBeEnabled();

    // Malformed content is explained next to the field and cannot be saved.
    const content = page.getByLabel("Question content (JSON)");
    await content.fill('{"stem": [');
    await expect(page.locator('[data-field="content"]')).toContainText("Not valid JSON");
    await expect(save).toBeDisabled();
    await content.fill(JSON.stringify({ stem: [{ t: "p", c: [{ t: "text", v: "Ben has " }, { t: "frac", n: 1, d: 0 }] }] }));
    await expect(page.locator('[data-field="content"]')).toContainText("stem[0].c[1].d");
    await expect(save).toBeDisabled();

    // Fixed content shows in the pupil preview, with the stacked fraction, and no answer.
    await content.fill(
      JSON.stringify({
        stem: [{ t: "p", c: [{ t: "text", v: "Ben ate " }, { t: "frac", n: 3, d: 4 }, { t: "text", v: " of a pizza. How much is that in quarters? " }, { t: "blank" }] }],
      }),
    );
    const pupilPreview = page.locator('[data-preview="pupil"]');
    await expect(pupilPreview.locator("[data-fraction]")).toBeVisible();
    await expect(pupilPreview).not.toContainText("Answer");

    // A wrong answer is caught by the automatic check, in plain words.
    await page.getByLabel("Answer (JSON)").fill(JSON.stringify({ kind: "number", value: "5" }));
    await page.getByLabel("Answer check (JSON)").fill(JSON.stringify({ expression: "3" }));
    await expect(page.locator('[data-preview="answer"]')).toContainText("Answer: 5");
    await expect(page.locator('[data-verification="bad"]')).toContainText("Answer check failed");
    await expect(page.locator('[data-verification="bad"]')).toContainText("Expression gives 3 but the stored answer is 5");

    await page.getByLabel("Answer (JSON)").fill(JSON.stringify({ kind: "number", value: "3" }));
    await expect(page.locator('[data-verification="good"]')).toContainText("Answer check passed");
    await save.click();

    // Saved as a draft.
    await expect(page.getByRole("heading", { level: 1, name: "Adding money (browser test)" })).toBeVisible();
    await expect(page.locator("[data-status]").first()).toHaveText("Draft");
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.locator("[data-status]").first()).toHaveText("In review");

    // Approving without the checklist is refused and says what to tick.
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Tick");
    await expect(page.locator("[data-status]").first()).toHaveText("In review");

    for (const label of [
      "The question fits the curriculum outcome",
      "The answer is correct",
      "The wording is clear",
      "The wording and context suit the age group",
    ]) {
      await page.getByLabel(label).check();
    }
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("[data-status]").first()).toHaveText("Approved");
    await expect(page.locator("[data-audit-trail]")).toContainText("Approved");
    await expect(page.locator("[data-audit-trail]")).toContainText("Sent for review");
    await expect(page.locator("[data-audit-trail]")).toContainText("Draft created");

    // An approved question is never edited: correcting it starts a new version.
    await page.getByRole("link", { name: "Create a corrected version" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Create a corrected version" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save as new version" })).toBeEnabled();
    await page.getByLabel("Marks").fill("2");
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.getByText(new RegExp(`${code}.*version 2`))).toBeVisible();
    await expect(page.locator("[data-status]").first()).toHaveText("Draft");
    await expect(page.getByRole("link", { name: /Version 1/ })).toBeVisible();
  });

  test("a wrong answer cannot be approved even with every box ticked", async ({ page }, testInfo) => {
    const code = `E2E-W-${testInfo.project.name === "phone" ? "PHONE" : "IPAD"}`;
    await signInAs(page, ADMIN);
    await page.goto("/admin/questions/new");
    await page.getByLabel("Family code").fill(code);
    await page.getByLabel("Family title").fill("Wrong answer (browser test)");
    await page.getByLabel("Main curriculum outcome").selectOption({ index: 2 });
    await page.getByLabel("Answer (JSON)").fill(JSON.stringify({ kind: "number", value: "7" }));
    await page.getByLabel("Answer check (JSON)").fill(JSON.stringify({ expression: "3+3" }));
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.locator("[data-status]").first()).toHaveText("In review");
    await expect(page.locator('[data-verification="bad"]')).toContainText("Answer check failed");
    for (const label of [
      "The question fits the curriculum outcome",
      "The answer is correct",
      "The wording is clear",
      "The wording and context suit the age group",
    ]) {
      await page.getByLabel(label).check();
    }
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("automatic answer check failed");
    await expect(page.locator("[data-status]").first()).toHaveText("In review");
  });

  test("unknown or malformed question ids are a 404", async ({ page }) => {
    await signInAs(page, ADMIN);
    for (const path of ["/admin/questions/not-a-uuid", "/admin/questions/00000000-0000-4000-8000-000000000000", "/admin/questions/00000000-0000-4000-8000-000000000000/edit"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("the admin landing page links to the question bank", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin");
    await page.getByRole("link", { name: "Browse and review questions" }).click();
    await expect(page).toHaveURL(/\/admin\/questions$/);
  });
});
