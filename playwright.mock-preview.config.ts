import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Runs the Mock Mode preview spec against `next dev` on port 3300.
 *
 * The main config builds and starts the production app, where /dev/mock-preview is a 404 by
 * design, so the preview spec cannot run there (it is excluded from that config). Same browser
 * projects and the same fictional env values as the main config.
 *
 *   npx playwright test -c playwright.mock-preview.config.ts
 */

const PORT = 3300;
const baseURL = `http://localhost:${PORT}`;
const mainEnv = (Array.isArray(base.webServer) ? base.webServer[0] : base.webServer)?.env ?? {};

export default defineConfig({
  ...base,
  testMatch: /mock-mode\.spec\.ts/,
  testIgnore: [],
  use: { ...base.use, baseURL },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/dev/mock-preview`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ...mainEnv, APP_BASE_URL: baseURL },
  },
});
