import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("signed out", () => {
  test("/home redirects to /sign-in", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("every family area and the admin area redirect to /sign-in", async ({ page }) => {
    for (const path of ["/prepare", "/prepare/new", "/progress", "/rewards", "/account", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  });

  test("/ redirects to /sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a forged session cookie does not sign anyone in", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "pk_session", value: "forged.value", url: baseURL ?? "" }]);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("an email that is not an email explains itself and keeps what was typed", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#email-error")).toContainText("doesn't look like an email address");
    await expect(page.getByLabel("Email address")).toHaveValue("not-an-email");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe("signed in as a parent", () => {
  test("sign in lands on Home with one question and one primary button", async ({ page }) => {
    await signInAs(page, "e2e-parent-home@example.test");
    await expect(page.getByRole("heading", { level: 1, name: "Who are you preparing?" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("link", { name: "Add your child" })).toBeVisible();
  });

  test("the session cookie is HTTP-only and lax", async ({ page, context }) => {
    await signInAs(page, "e2e-parent-cookie@example.test");
    const cookie = (await context.cookies()).find((candidate) => candidate.name === "pk_session");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  });

  test("/ goes to Home and /sign-in goes to Home", async ({ page }) => {
    await signInAs(page, "e2e-parent-root@example.test");
    await page.goto("/");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("navigation has exactly four links, in order, each at least 48px", async ({ page }) => {
    await signInAs(page, "e2e-parent-nav@example.test");
    const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(links).toHaveText(["Home", "Prepare", "Progress", "Rewards"]);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  test("navigation sits at the bottom on a phone and at the side on an iPad", async ({ page }) => {
    await signInAs(page, "e2e-parent-layout@example.test");
    const nav = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    const viewport = page.viewportSize();
    if (!nav || !viewport) throw new Error("no layout");
    if (viewport.width < 768) {
      expect(nav.y + nav.height).toBeGreaterThan(viewport.height - 2);
      expect(nav.width).toBeGreaterThan(viewport.width - 2);
    } else {
      expect(nav.x).toBe(0);
      expect(nav.height).toBeGreaterThan(viewport.height / 2);
      expect(nav.width).toBeLessThan(viewport.width / 2);
    }
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });

  test("the active destination is marked and follows the page", async ({ page }) => {
    await signInAs(page, "e2e-parent-active@example.test");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Home");
    for (const name of ["Prepare", "Progress", "Rewards"]) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
      await expect(nav.locator('[aria-current="page"]')).toHaveText(name);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test("the top bar shows the wordmark and an Account button that is not in the navigation", async ({ page }) => {
    await signInAs(page, "e2e-parent-topbar@example.test");
    await expect(page.getByRole("banner").getByText("PaperKaki")).toBeVisible();
    const account = page.getByRole("link", { name: "Account" });
    await expect(account).toHaveText("E");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Account" })).toHaveCount(0);
    const box = await account.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
    await account.click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("empty states explain what each page will hold", async ({ page }) => {
    await signInAs(page, "e2e-parent-empty@example.test");
    await page.goto("/prepare");
    await expect(page.getByText("Upcoming assessments you add will appear here.")).toBeVisible();
    await page.getByRole("link", { name: "Add upcoming assessment" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "What is your child preparing for?" })).toBeVisible();
    await page.goto("/progress");
    await expect(page.getByText("After your child's first mock, you'll see what is improving and what needs work.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
    await page.goto("/rewards");
    await expect(page.getByText("Learning Points and rewards you set up will appear here.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  });

  test("the pages use no internal terms", async ({ page }) => {
    await signInAs(page, "e2e-parent-words@example.test");
    for (const path of ["/home", "/prepare", "/progress", "/rewards", "/account"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(/blueprint|outcome|confidence|multiplier/i);
    }
  });

  test("Account shows name, email and Sign out; signing out returns to /sign-in", async ({ page }) => {
    await signInAs(page, "e2e-parent-account@example.test");
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByText("e2e-parent-account@example.test")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a non-admin gets 404 at /admin, and the family UI never links to it", async ({ page }) => {
    await signInAs(page, "e2e-parent-admin-probe@example.test");
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeVisible();
  });
});

test.describe("signed in as an admin", () => {
  test("/admin has its own layout with no family navigation", async ({ page }) => {
    await signInAs(page, "Admin@Example.test");
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 2, name: "Curriculum" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Question bank" })).toBeVisible();
    await expect(page.getByText("Not built yet")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Browse curriculum versions" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});
