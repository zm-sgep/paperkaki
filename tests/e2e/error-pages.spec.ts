import { expect, test } from "@playwright/test";

test("an unknown page explains itself, offers one action and shows a reference", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/Reference:/)).toContainText(response?.headers()["x-request-id"] ?? "");
  await expect(page.getByText(/at .*\.(ts|js)/)).toHaveCount(0);
});

test("the not-found action leads back to PaperKaki (sign-in when signed out)", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await page.getByRole("link", { name: "Go to PaperKaki" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("an incoming request ID is kept", async ({ request }) => {
  const response = await request.get("/sign-in", { headers: { "x-request-id": "test-request-0001" } });
  expect(response.headers()["x-request-id"]).toBe("test-request-0001");
});
