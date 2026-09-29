import { z } from "zod";

/**
 * Environment validation.
 *
 * Imported from `next.config.ts`, so it runs for `next dev`, `next build` and
 * `next start`. Server-side only: never import this from a Client Component.
 *
 * Error messages name the variable and the rule it broke. They never contain
 * the value: connection strings and URLs may hold credentials.
 */

const DATABASE_URL_SCHEMES = ["postgres://", "postgresql://", "pglite://"] as const;

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      error: "must be one of: development, test, production",
    })
    .default("development"),
  APP_BASE_URL: z
    .string({ error: "is required" })
    .refine(isHttpUrl, { error: "must be an absolute http(s) URL" }),
  DATABASE_URL: z
    .string({ error: "is required" })
    .refine((value) => DATABASE_URL_SCHEMES.some((scheme) => value.startsWith(scheme)), {
      error: `must start with one of: ${DATABASE_URL_SCHEMES.join(", ")}`,
    }),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of: ${LOG_LEVELS.join(", ")}` })
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

export type EnvIssue = {
  variable: string;
  message: string;
};

export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(
      [
        "Invalid environment configuration:",
        ...issues.map((issue) => `  - ${issue.variable}: ${issue.message}`),
        "See .env.example for the expected variables.",
      ].join("\n"),
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pure: validates a source of variables and returns typed config.
 * Empty strings are treated as unset so `FOO=` in an .env file falls back to the default.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string | undefined> = {};
  for (const key of Object.keys(envSchema.shape)) {
    const value = source[key];
    cleaned[key] = value === "" ? undefined : value;
  }

  const result = envSchema.safeParse(cleaned);
  if (result.success) {
    return result.data;
  }

  throw new EnvValidationError(
    result.error.issues.map((issue) => ({
      variable: issue.path.length > 0 ? issue.path.join(".") : "(environment)",
      message: issue.message,
    })),
  );
}

export const env: Env = parseEnv(process.env);
