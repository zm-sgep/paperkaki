import { expect, test } from "@playwright/test";

test("the home page shows the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "PaperKaki" })).toBeVisible();
  await expect(page.getByText("Your child's exam-prep kaki.")).toBeVisible();
});

test("the page fits the screen without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
