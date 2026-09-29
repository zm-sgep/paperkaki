import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("parent-safe curriculum API", () => {
  test("signed out: 401 and no curriculum", async ({ request }) => {
    const response = await request.get("/api/curriculum/topics?subject=Mathematics&level=P3");
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("Fractions");
  });

  test("signed in: published P3 topics in parent wording, no drafts", async ({ page }) => {
    await signInAs(page, "e2e-parent-api@example.test");
    const response = await page.request.get("/api/curriculum/topics?subject=Mathematics&level=P3");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = (await response.json()) as {
      curriculumVersionId: string;
      topics: { id: string; code: string; label: string; outcomes: { id: string; code: string; label: string }[] }[];
    };
    expect(body.topics.map((topic) => topic.label)).toContain("Fractions");
    expect(body.topics.map((topic) => topic.label)).toContain("Whole numbers to 10 000");
    expect(body.topics.map((topic) => topic.label)).not.toContain("Draft-only topic for parents");
    expect(body.topics).toHaveLength(11);
    const fractions = body.topics.find((topic) => topic.code === "P3-NA-FR");
    expect(fractions?.outcomes.length).toBe(5);
    expect(JSON.stringify(body)).not.toMatch(/verif|unverified|source|status|draft/i);
  });

  test("signed in: a bad query is a 400 and an unsupported subject is a 404", async ({ page }) => {
    await signInAs(page, "e2e-parent-api2@example.test");
    expect((await page.request.get("/api/curriculum/topics?subject=Mathematics&level=Primary3")).status()).toBe(400);
    expect((await page.request.get("/api/curriculum/topics")).status()).toBe(400);
    expect((await page.request.get("/api/curriculum/topics?subject=Science&level=P3")).status()).toBe(404);
  });
});
