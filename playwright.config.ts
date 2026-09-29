import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

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
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      APP_BASE_URL: baseURL,
      DATABASE_URL: "pglite://memory",
      LOG_LEVEL: "warn",
    },
  },
});
