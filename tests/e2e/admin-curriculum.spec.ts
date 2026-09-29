import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

const ADMIN = "admin@example.test";

test.describe("admin curriculum browser", () => {
  test("a normal parent gets 404 at /admin/curriculum", async ({ page }) => {
    await signInAs(page, "e2e-parent-curriculum@example.test");
    const response = await page.goto("/admin/curriculum");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Fractions");
  });

  test("a signed-out visitor is sent to sign in", async ({ page }) => {
    await page.goto("/admin/curriculum");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the admin sees versions with clear Draft and Published labels", async ({ page }) => {
    await signInAs(page, ADMIN);
    const response = await page.goto("/admin/curriculum");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Curriculum" })).toBeVisible();
    await expect(page.locator('[data-status="published"]')).toHaveText("Published");
    await expect(page.locator('[data-status="draft"]')).toHaveText("Draft");
    await expect(page.getByText("Mathematics Syllabus Primary One to Six (2021 cohort), updated October 2025")).toBeVisible();
  });

  test("the published version lists topics, including Fractions, and filters by level and topic", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/curriculum");
    await page.getByRole("link", { name: /Mathematics Syllabus Primary One to Six/ }).click();
    await expect(page.locator('[data-status="published"]')).toHaveText("Published");
    await expect(page.getByRole("link", { name: /^Fractions/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Number and Algebra/ })).toBeVisible();

    await page.getByLabel("Topic").selectOption({ label: "Fractions" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByRole("link", { name: /^Fractions/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Money/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/admin\/curriculum\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Topic")).toHaveValue("");
    await page.getByLabel("Level").selectOption("P3");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByRole("link", { name: /^Money/ })).toBeVisible();
  });

  test("topic -> outcome shows the statement, code, verification state and every source", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/curriculum");
    await page.getByRole("link", { name: /Mathematics Syllabus Primary One to Six/ }).click();
    await page.getByRole("link", { name: /^Fractions/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Fractions" })).toBeVisible();
    await expect(page.getByText("Scope notes (quoted from the source)")).toBeVisible();

    await page.getByRole("link", { name: /P3-NA-FR-01/ }).click();
    await expect(page.getByText("P3-NA-FR-01").first()).toBeVisible();
    await expect(page.getByText("Unverified").first()).toBeVisible();
    const sources = page.getByRole("heading", { level: 2, name: "Sources" });
    await expect(sources).toBeVisible();
    await expect(page.getByText("Ministry of Education, Singapore")).toBeVisible();
    await expect(page.getByText(/p\. 35, Primary 3/)).toBeVisible();
    await expect(page.getByText("Official (MOE)")).toBeVisible();
    // A published version cannot be changed, so there is nothing to verify here.
    await expect(page.getByRole("button", { name: "Mark verified" })).toHaveCount(0);
    await expect(page.getByText(/can no longer be changed/)).toBeVisible();
  });

  test("an outcome without a page reference asks for one before it can be verified", async ({ page }, testInfo) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/curriculum");
    await page.getByRole("link", { name: /Fictional draft curriculum/ }).click();
    await expect(page.locator('[data-status="draft"]')).toHaveText("Draft");
    await page.getByRole("link", { name: /Draft-only topic/ }).click();

    // Each browser project verifies its own outcome, so the two projects never collide.
    const code = testInfo.project.name === "phone" ? "E2E-O-PHONE" : "E2E-O-IPAD";
    await page.getByRole("link", { name: new RegExp(code) }).click();
    await expect(page.getByText("No page reference")).toBeVisible();
    await expect(page.getByText("Unverified").first()).toBeVisible();

    const pageField = page.getByLabel("Page or section in the source");
    await expect(pageField).toBeVisible();
    await page.getByRole("button", { name: "Mark verified" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Add the page or section");

    await pageField.fill("p. 7, section 2");
    await page.getByRole("button", { name: "Mark verified" }).click();
    await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("p. 7, section 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark verified" })).toHaveCount(0);
    await expect(page.getByText(/Verified \d{4}-\d{2}-\d{2} by a named admin/)).toBeVisible();
  });

  test("an outcome that already has a page reference is verified with one click", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin/curriculum");
    await page.getByRole("link", { name: /Fictional draft curriculum/ }).click();
    await page.getByRole("link", { name: /Draft-only topic/ }).click();
    await page.getByRole("link", { name: /E2E-O-PAGED/ }).click();
    await expect(page.getByText("p. 12, section 3")).toBeVisible();
    await expect(page.getByLabel("Page or section in the source")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark verified" })).toBeVisible();
  });

  test("unknown or malformed ids are a 404, not an error page", async ({ page }) => {
    await signInAs(page, ADMIN);
    for (const path of [
      "/admin/curriculum/not-a-uuid",
      "/admin/curriculum/00000000-0000-4000-8000-000000000000",
      "/admin/curriculum/00000000-0000-4000-8000-000000000000/topics/00000000-0000-4000-8000-000000000001",
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });

  test("the admin landing page links to the curriculum browser", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto("/admin");
    await page.getByRole("link", { name: "Browse curriculum versions" }).click();
    await expect(page).toHaveURL(/\/admin\/curriculum$/);
  });
});
