import { expect, test } from "@playwright/test";

test("the sign-in page shows the product name and one primary button", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("PaperKaki", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.getByText("Development sign-in. No password needed.")).toBeVisible();
});

test("the page fits the screen without sideways scrolling", async ({ page }) => {
  await page.goto("/sign-in");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
