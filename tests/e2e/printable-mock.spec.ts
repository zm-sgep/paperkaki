import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { extractPdfText } from "../helpers/pdf-text";

/** Words a parent must never see, and no percentages (UX rule 9). */
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

async function expectNoInternalWords(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(BANNED);
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Follows the download link like a browser would: a redirect to a five-minute signed URL, then the PDF. */
async function downloadPdf(page: Page, href: string): Promise<{ bytes: Buffer; signedUrl: string; text: string; redirect: APIResponse }> {
  const redirect = await page.request.get(href, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  const signedUrl = redirect.headers()["location"] ?? "";
  expect(signedUrl).toMatch(/^\/api\/files\/paper-pdfs\/parents\/[0-9a-f-]{36}\/assessments\/[0-9a-f-]{36}\/mock-\d+-(student|answers)\.pdf\?exp=\d+&sig=/);
  const expires = Number(new URL(signedUrl, "http://x.test").searchParams.get("exp"));
  const secondsLeft = expires - Date.now() / 1000;
  expect(secondsLeft).toBeGreaterThan(200);
  expect(secondsLeft).toBeLessThanOrEqual(305);

  const file = await page.request.get(signedUrl);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  const bytes = await file.body();
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  return { bytes, signedUrl, text: (await extractPdfText(bytes)).text, redirect };
}

/** Saves the PDFs of one run for a person to look at. tests/output is git-ignored. */
function keepCopy(name: string, bytes: Buffer) {
  const dir = path.resolve(process.cwd(), "tests/output");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), bytes);
}

test.describe("printable mock", () => {
  test("a parent goes from Home to two printable mocks, and another parent cannot reach them", async ({ page, browser, baseURL }, testInfo) => {
    const tag = testInfo.project.name;
    await signInAs(page, `e2e-mock-${tag}@example.test`);

    // Home: one question, one primary action.
    await expect(page.getByRole("heading", { level: 1, name: "Who are you preparing?" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectNoInternalWords(page);
    await page.getByRole("link", { name: "Add your child" }).click();

    // Add the child and WA2 in 14 days.
    await expect(page.getByRole("heading", { level: 1, name: "What is your child preparing for?" })).toBeVisible();
    await page.getByLabel("Your child's name or nickname").fill("Test Child A");
    await page.getByText("WA2", { exact: true }).click();
    await page.getByLabel("Date of the assessment").fill(singaporeDateAhead(14));
    await page.getByRole("button", { name: "Choose topics" }).click();

    // Choose three topics and confirm.
    await expect(page).toHaveURL(/\/prepare\/[0-9a-f-]{36}\/scope$/);
    const assessmentId = /\/prepare\/([0-9a-f-]{36})\/scope$/.exec(page.url())?.[1] ?? "";
    for (const label of ["Fractions", "Whole numbers to 10 000", "Adding and subtracting bigger numbers"]) {
      await page.getByText(label, { exact: true }).click();
    }
    await page.getByRole("button", { name: "Confirm topics" }).click();

    // Screen C: one primary action.
    await expect(page.getByRole("heading", { level: 1, name: "Your mock is ready to create" })).toBeVisible();
    await expect(page.getByText(/^40 marks · 45 minutes · /)).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    // Generate: a calm progress state, then the mock page.
    const generate = page.getByRole("button", { name: "Generate first mock" });
    await generate.click();
    await expect(page.getByRole("button", { name: /Creating your mock/ })).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(`/prepare/${assessmentId}/mocks/[0-9a-f-]{36}$`), { timeout: 60_000 });
    const mock1Url = page.url();

    // The mock page: summary, one primary download, the answer pack quietly, one tip.
    await expect(page.getByRole("heading", { level: 1, name: "Mock 1 is ready" })).toBeVisible();
    await expect(page.getByText(/^Test Child A · Mathematics WA2 · /)).toBeVisible();
    await expect(page.getByText(/^40 marks · 45 minutes · .*Fractions/)).toBeVisible();
    await expect(page.getByText("Print on A4. Give Test Child A 45 minutes.")).toBeVisible();
    await expect(page.getByText("Keep this for yourself. It has the answers.")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    const studentLink = page.getByRole("link", { name: "Download mock paper" });
    const answersLink = page.getByRole("link", { name: "Download answer pack" });
    await expect(studentLink).toHaveAttribute("data-variant", "primary");
    await expect(studentLink).toHaveAttribute("target", "_blank");
    expect((await studentLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect((await answersLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    // Downloads are real PDFs behind a short-lived signed link.
    const student1 = await downloadPdf(page, (await studentLink.getAttribute("href")) ?? "");
    expect(student1.text).toContain("Mock 1");
    expect(student1.text).toContain("Total: 40 marks");
    expect(student1.text).not.toContain("Answer pack");
    const answers1 = await downloadPdf(page, (await answersLink.getAttribute("href")) ?? "");
    expect(answers1.text).toContain("Answer pack");
    expect(answers1.text).toContain("Mock 1");
    keepCopy(`e2e-mock-1-student-${tag}.pdf`, student1.bytes);
    keepCopy(`e2e-mock-1-answers-${tag}.pdf`, answers1.bytes);

    // Home now says the mock is ready, with one primary action.
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mathematics WA2 · Mock 1 is ready" })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("link", { name: "Print mock" })).toBeVisible();
    await expectNoInternalWords(page);

    // Prepare card says the same, and history lives inside the assessment.
    await nav.getByRole("link", { name: "Prepare" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "WA2" });
    await expect(card).toContainText("Mock 1 is ready");
    await expect(card.getByRole("link", { name: "Print mock" })).toBeVisible();
    await expectNoInternalWords(page);

    // The assessment now lists its mocks. Print is primary; Create another is quieter.
    await page.goto(`/prepare/${assessmentId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Your mocks" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Mocks" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Mock 1/ })).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveText("Print Mock 1");
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Create another mock" })).toHaveAttribute("data-variant", "secondary");
    await expectNoInternalWords(page);
    await expectNoSideScroll(page);

    // Another mock uses a new set of questions.
    await page.getByRole("button", { name: "Create another mock" }).click();
    await expect(page).toHaveURL(new RegExp(`/prepare/${assessmentId}/mocks/[0-9a-f-]{36}$`), { timeout: 60_000 });
    expect(page.url()).not.toBe(mock1Url);
    await expect(page.getByRole("heading", { level: 1, name: "Mock 2 is ready" })).toBeVisible();
    const student2 = await downloadPdf(page, (await page.getByRole("link", { name: "Download mock paper" }).getAttribute("href")) ?? "");
    expect(student2.text).toContain("Mock 2");
    expect(student2.text).toContain("Total: 40 marks");
    expect(student2.text).not.toContain("Answer pack");
    // Different questions: the printed text differs once the mock number is taken out.
    expect(student2.text.replaceAll("Mock 2", "Mock N")).not.toBe(student1.text.replaceAll("Mock 1", "Mock N"));
    keepCopy(`e2e-mock-2-student-${tag}.pdf`, student2.bytes);
    await expectNoInternalWords(page);

    // Home now points at the latest mock.
    await nav.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mathematics WA2 · Mock 2 is ready" })).toBeVisible();

    // A second parent gets a 404 for the first parent's mock page and files.
    const paper2Url = new URL(student2.signedUrl, baseURL ?? "http://localhost").pathname;
    const mock2PageUrl = await page.goto(`/prepare/${assessmentId}`).then(() => page.getByRole("link", { name: /^Mock 2/ }).getAttribute("href"));
    expect(mock2PageUrl).toMatch(new RegExp(`^/prepare/${assessmentId}/mocks/[0-9a-f-]{36}$`));

    const other = await browser.newContext({ baseURL: baseURL ?? "" });
    const otherPage = await other.newPage();
    await signInAs(otherPage, `e2e-mock-other-${tag}@example.test`);
    for (const target of [mock1Url, mock2PageUrl ?? "", `${mock1Url}/download/student`, `${mock1Url}/download/answers`]) {
      const response = await otherPage.goto(target);
      expect(response?.status(), target).toBe(404);
    }
    const notFoundHeading = otherPage.getByRole("heading", { level: 1, name: "We can't find that page" });
    await otherPage.goto(mock1Url);
    await expect(notFoundHeading).toBeVisible();

    // A signed link with a changed signature, or a changed time, is refused for everyone.
    const link = new URL(student1.signedUrl, "http://x.test");
    const sig = link.searchParams.get("sig") ?? "";
    // Change the FIRST character: the last one of a base64url signature carries spare bits that decode the same.
    const tamperedSig = `${link.pathname}?exp=${link.searchParams.get("exp")}&sig=${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
    const tamperedExp = `${link.pathname}?exp=${Number(link.searchParams.get("exp")) + 3600}&sig=${sig}`;
    const otherFile = student1.signedUrl.replace("mock-1-student", "mock-2-student");
    for (const url of [tamperedSig, tamperedExp, otherFile]) {
      for (const client of [page, otherPage]) {
        const response = await client.request.get(url);
        expect(response.status(), url).toBe(404);
      }
    }
    expect(paper2Url).toContain("mock-2-student.pdf");
    await other.close();
  });
});
