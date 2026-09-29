import path from "node:path";
import { defineConfig } from "vitest/config";

// Safe, fictional values so modules that import `@/config/env` can load under test.
// Real .env files are never read by Vitest.
const testEnv = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "pglite://memory",
  LOG_LEVEL: "silent",
  AUTH_PROVIDER: "dev",
  AUTH_SECRET: "test-only-auth-secret-0123456789abcdef",
  DEV_ADMIN_EMAILS: "admin@example.test",
  STORAGE_LOCAL_DIR: "./.data/test-storage",
  STORAGE_SIGNING_SECRET: "test-only-storage-signing-secret-0123456789",
};

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: testEnv,
          // Loading the ESLint flat config (architecture boundary test) takes a moment.
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: testEnv,
          // Each file boots its own in-memory PGlite and applies the migrations.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
