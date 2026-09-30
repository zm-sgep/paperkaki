import { expect, test, type Page } from "@playwright/test";

const BANNED = /blueprint|outcome|P3-|%/i;

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A date `days` ahead of today in Singapore, "YYYY-MM-DD". */
function singaporeDateAhead(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** What the parent can see on screen (scripts and styles excluded). */
async function visibleText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

async function expectNoInternalWords(page: Page) {
  expect(await visibleText(page)).not.toMatch(BANNED);
}

test.describe("parent assessment setup", () => {
  test("a new parent goes from Home to a mock summary, and another parent cannot open it", async ({ page, browser, baseURL }, testInfo) => {
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-setup-${tag}@example.test`);

    // Home: one question, one primary button, a sentence of help.
    await expect(page.getByRole("heading", { level: 1, name: "Who are you preparing?" })).toBeVisible();
    await expect(page.getByText("PaperKaki makes practice papers for your child's next school assessment.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectNoInternalWords(page);
    await page.getByRole("link", { name: "Add your child" }).click();

    // A: what is your child preparing for?
    await expect(page).toHaveURL(/\/prepare\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "What is your child preparing for?" })).toBeVisible();
    await expect(page.getByText("PaperKaki covers Primary 3 Mathematics for now.")).toBeVisible();
    await expect(page.getByText("Primary 3 · Mathematics")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByText(/upload/i)).toHaveCount(0);

    // Errors are inline, in plain words, and keep what was typed.
    await page.getByLabel("Your child's name or nickname").fill("Test Child A");
    await page.getByRole("button", { name: "Choose topics" }).click();
    await expect(page.getByText("Choose the assessment.")).toBeVisible();
    await expect(page.getByText("Choose the date of the assessment.")).toBeVisible();
    await expect(page.getByLabel("Your child's name or nickname")).toHaveValue("Test Child A");

    await page.getByText("Other", { exact: true }).click();
    await expect(page.getByLabel("What is it called?")).toBeVisible();
    await page.getByText("WA2", { exact: true }).click();
    await expect(page.getByLabel("What is it called?")).toHaveCount(0);
    await page.getByLabel("Date of the assessment").fill("2020-01-01");
    await page.getByRole("button", { name: "Choose topics" }).click();
    await expect(page.getByText("Choose today or a later date.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "WA2" })).toBeChecked();
    await expectNoInternalWords(page);

    await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(14));
    await page.getByRole("button", { name: "Choose topics" }).click();

    // B: which topics are in WA2?
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/scope$/);
    const assessmentId = /\/prepare\/([0-9a-f-]{36})\/scope$/.exec(page.url())?.[1] ?? "";
    await expect(page.getByRole("heading", { level: 1, name: "Which topics are in WA2?" })).toBeVisible();
    await expect(page.getByText(/^Test Child A · Mathematics WA2 · /)).toBeVisible();
    await expect(page.getByText("Check the school's notice and tick the topics it lists.")).toBeVisible();
    const confirm = page.getByRole("button", { name: "Confirm topics" });
    await expect(confirm).toBeDisabled();
    await expect(page.getByText("Tick at least one topic to continue.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);

    const fractions = page.getByRole("checkbox", { name: "Fractions" });
    const time = page.getByRole("checkbox", { name: /^Time and how long things take/ });
    await page.getByText("Fractions", { exact: true }).click();
    await page.getByText("Time and how long things take").click();
    await expect(fractions).toBeChecked();
    await expect(time).toBeChecked();
    // Selected state is more than colour: a visible tick is drawn.
    const tick = page.locator("label", { has: fractions }).locator("svg");
    await expect(tick).toHaveCSS("opacity", "1");
    // Touch targets are at least 48px tall.
    for (const box of await page.locator("label", { has: page.getByRole("checkbox") }).all()) {
      expect((await box.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await expectNoInternalWords(page);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // C: your mock is ready to create.
    await expect(page).toHaveURL(new RegExp(`/prepare/${assessmentId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
    await expect(page.getByText("Each mock uses a new set of questions from the topics you chose.")).toBeVisible();
    const summary = page.getByText(/^\d+ marks · \d+ min · Sections A, B$/);
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("marks");
    await expect(summary).toContainText("min");
    await expect(page.getByText(/^Fractions/)).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Generate first mock");
    await expectNoInternalWords(page);

    // Customise paper is collapsed until asked for, and saving recomputes the summary.
    await expect(page.getByLabel("Total marks")).toBeHidden();
    await page.getByText("Customise paper").click();
    await page.getByLabel("Total marks").selectOption("20");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved. The summary above is up to date.")).toBeVisible();
    await expect(page.getByText(/^20 marks · /)).toBeVisible();
    await page.getByRole("button", { name: "Use recommended settings" }).click();
    await expect(page.getByText(/^30 marks · 35 min · /)).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectNoInternalWords(page);

    // Home and Prepare now reflect the state (creating the mock is covered by the printable-mock spec).
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "WA2: topics confirmed" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Generate first mock" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    // The hero's chips say which child, which assessment and how many days; the same facts are not repeated as a line below.
    await expect(page.getByText(/^in 14 days$/)).toHaveCount(1);
    await expect(page.getByText(/^Next: WA2 · /)).toHaveCount(0);
    await expectNoInternalWords(page);

    await nav.getByRole("link", { name: "Prepare" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "WA2" });
    await expect(card).toContainText("Topics confirmed");
    await expect(card).toContainText("in 14 days");
    await expect(card.getByRole("link", { name: "Generate first mock" })).toBeVisible();
    await expectNoInternalWords(page);

    // Editing topics returns the assessment to "Choose topics" until confirmed again.
    await card.getByRole("link", { name: "Generate first mock" }).click();
    await page.getByRole("link", { name: "Change topics" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Which topics are in WA2?" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Time and how long/ })).toBeChecked();
    await page.getByText("Time and how long things take", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /^Time and how long/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Confirm topics" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();

    // The top bar shows the one child's name, plainly.
    await expect(page.getByRole("banner").getByText("Test Child A")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("combobox")).toHaveCount(0);

    // A second parent gets a 404 for the first parent's assessment.
    const other = await browser.newContext({ baseURL: baseURL ?? "" });
    const otherPage = await other.newPage();
    await signInAs(otherPage, `e2e-setup-other-${tag}@example.test`);
    for (const path of [`/prepare/${assessmentId}`, `/prepare/${assessmentId}/scope`]) {
      const response = await otherPage.goto(path);
      expect(response?.status()).toBe(404);
      await expect(otherPage.getByRole("heading", { level: 1, name: "We can't find that page" })).toBeVisible();
    }
    const missing = await otherPage.goto("/prepare/not-a-real-id");
    expect(missing?.status()).toBe(404);
    await other.close();
  });

  test("Account lists children; a second child adds a selector; archive asks first", async ({ page }, testInfo) => {
    await signInAs(page, `e2e-children-${testInfo.project.name}@example.test`);
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 2, name: "Children" })).toBeVisible();
    await expect(page.getByText("No children yet.")).toBeVisible();

    await page.getByLabel("Add a child").fill("Test Child A");
    await page.getByRole("button", { name: "Add child" }).click();
    await expect(page.getByText("Test Child A").first()).toBeVisible();
    await expect(page.getByRole("banner").getByText("Test Child A")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("combobox")).toHaveCount(0);

    await page.getByLabel("Add a child").fill("   ");
    await page.getByRole("button", { name: "Add child" }).click();
    await expect(page.getByText("Enter your child's name or nickname.")).toBeVisible();

    await page.getByLabel("Add a child").fill("Test Child B");
    await page.getByRole("button", { name: "Add child" }).click();
    const selector = page.getByRole("banner").getByRole("combobox", { name: "Child" });
    await expect(selector).toBeVisible();
    expect((await selector.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(4);

    // Rename.
    await page.getByRole("listitem").filter({ hasText: "Test Child B" }).getByText("Rename", { exact: true }).click();
    await page.getByLabel("New name for Test Child B").fill("Test Child C");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Test Child C" })).toBeVisible();

    // Selecting another child in the top bar sticks after a reload.
    expect(await selector.locator("option").allTextContents()).toEqual(["Test Child A", "Test Child C"]);
    await selector.selectOption({ label: "Test Child C" });
    await page.reload();
    const reloaded = page.getByRole("banner").getByRole("combobox", { name: "Child" });
    await expect(reloaded.locator("option:checked")).toHaveText("Test Child C");

    // Archive asks for confirmation first, with destructive styling.
    const row = page.getByRole("listitem").filter({ hasText: "Test Child C" });
    await row.getByText("Archive", { exact: true }).click();
    await expect(row.getByText("Archive Test Child C?")).toBeVisible();
    await expect(row.locator('[data-variant="danger"]')).toBeVisible();
    await row.getByRole("button", { name: "Yes, archive Test Child C" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Test Child C" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByText("Test Child A")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("combobox")).toHaveCount(0);
    expect(await visibleText(page)).not.toMatch(BANNED);
  });
});
