import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
/** File-backed so the seed step and the server share one database. Recreated on every run. */
const E2E_DB_DIR = "./.data/e2e-db";

/**
 * Chromium location. In CI, `playwright install chromium` provides the matching browser and
 * nothing is set here. In the pre-provisioned sandbox the installed revision can differ from
 * the one this Playwright version expects, so PLAYWRIGHT_CHROMIUM_PATH (or the chromium under
 * /opt/pw-browsers) is used as the executable.
 */
function chromiumExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (fromEnv) {
    return fromEnv;
  }
  const sandboxDefault = "/opt/pw-browsers/chromium";
  return existsSync(sandboxDefault) ? sandboxDefault : undefined;
}

const executablePath = chromiumExecutable();
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        launchOptions,
      },
    },
    {
      name: "ipad-landscape",
      use: {
        ...devices["iPad (gen 7) landscape"],
        // Chromium runs both projects; only the screen size and touch input matter here.
        defaultBrowserType: "chromium",
        viewport: { width: 1180, height: 820 },
        launchOptions,
      },
    },
  ],
  webServer: {
    // Prepares the browser-test database first: a fresh file-backed PGlite database, migrated
    // and seeded with the published P3 curriculum (development seed, ADR-0012), plus one
    // fictional DRAFT curriculum version that the admin tests use to mark outcomes verified.
    command: [
      `node -e "require('node:fs').rmSync('${E2E_DB_DIR}', { recursive: true, force: true })"`,
      "npm run db:seed",
      "npm run curriculum:import -- tests/fixtures/curriculum/e2e-draft.json",
      "npm run build",
      `npm run start -- --port ${PORT}`,
    ].join(" && "),
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      APP_BASE_URL: baseURL,
      DATABASE_URL: `pglite://${E2E_DB_DIR}`,
      LOG_LEVEL: "warn",
      // Fictional, test-only values. The production build normally refuses the dev sign-in
      // adapter; E2E_ALLOW_DEV_AUTH lets these browser tests use it.
      AUTH_PROVIDER: "dev",
      AUTH_SECRET: "e2e-only-auth-secret-not-used-anywhere-else-0123456789",
      DEV_ADMIN_EMAILS: "admin@example.test",
      E2E_ALLOW_DEV_AUTH: "true",
      STORAGE_LOCAL_DIR: "./.data/e2e-storage",
      STORAGE_SIGNING_SECRET: "e2e-only-storage-signing-secret-0123456789abcdef",
    },
  },
});
