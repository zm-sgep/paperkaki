import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture boundaries (docs/ARCHITECTURE.md sections 3-4, ADR-0001).
 * See src/README.md for the module table.
 */
const domainForbidden = {
  paths: [
    { name: "next", message: "Domain code must not depend on the web framework." },
    { name: "react", message: "Domain code must not depend on React." },
    { name: "react-dom", message: "Domain code must not depend on React." },
  ],
  patterns: [
    { group: ["next/*"], message: "Domain code must not depend on the web framework." },
    { group: ["react/*", "react-dom/*"], message: "Domain code must not depend on React." },
    {
      group: ["@/app/*", "**/app/**"],
      message: "Domain code must not import route code.",
    },
    {
      group: ["@/components/*", "**/components/**"],
      message: "Domain code must not import UI components.",
    },
    {
      group: ["@/repositories/*", "**/repositories/**"],
      message: "Domain code must not import repositories. Repositories depend on the domain, not the reverse.",
    },
    {
      group: ["@/services/*", "**/services/**"],
      message: "Domain code must not import service adapters. Define a port in the domain instead.",
    },
  ],
};

const uiForbidden = {
  patterns: [
    {
      group: ["@/repositories/*", "**/repositories/**"],
      message: "UI must not import repositories. Go through src/application (commands and queries).",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", domainForbidden] },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", uiForbidden] },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".data/**",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
