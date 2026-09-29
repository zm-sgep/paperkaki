import { ESLint } from "eslint";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, "eslint.config.mjs") });
});

async function restrictedImportMessages(filePath: string, importPath: string): Promise<string[]> {
  const code = `import * as dependency from "${importPath}";\nexport const used = dependency;\n`;
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

describe("architecture boundaries (docs/ARCHITECTURE.md sections 3-4)", () => {
  const domainFile = "src/domain/mastery/example.ts";

  it.each([
    "next",
    "next/server",
    "react",
    "react-dom",
    "react-dom/client",
    "@/app/page",
    "@/components/ui/button",
    "@/repositories/postgres/client",
    "@/services/ai/gateway",
  ])("reports domain code importing %s", async (importPath) => {
    expect(await restrictedImportMessages(domainFile, importPath)).not.toHaveLength(0);
  });

  it.each(["zod", "./local-rule", "@/schemas/example", "@/lib/logger", "@/config/env"])(
    "allows domain code importing %s",
    async (importPath) => {
      expect(await restrictedImportMessages(domainFile, importPath)).toHaveLength(0);
    },
  );

  it.each(["src/app/example/page.tsx", "src/components/ui/example.tsx"])(
    "reports %s importing a repository",
    async (filePath) => {
      expect(
        await restrictedImportMessages(filePath, "@/repositories/postgres/client"),
      ).not.toHaveLength(0);
    },
  );

  it.each(["src/app/example/page.tsx", "src/components/ui/example.tsx"])(
    "allows %s importing application code and the framework",
    async (filePath) => {
      expect(await restrictedImportMessages(filePath, "@/application/queries/example")).toHaveLength(0);
      expect(await restrictedImportMessages(filePath, "next/link")).toHaveLength(0);
    },
  );
});
