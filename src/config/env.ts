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

export const AUTH_PROVIDERS = ["dev"] as const;

const MIN_SECRET_LENGTH = 32;

const secret = () =>
  z
    .string({ error: "is required" })
    .min(MIN_SECRET_LENGTH, { error: `must be at least ${MIN_SECRET_LENGTH} characters` });

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
  AUTH_PROVIDER: z
    .enum(AUTH_PROVIDERS, { error: `must be one of: ${AUTH_PROVIDERS.join(", ")}` })
    .default("dev"),
  AUTH_SECRET: secret(),
  /** Comma-separated emails that receive the admin role at sign-in. Dev adapter only. */
  DEV_ADMIN_EMAILS: z.string().optional(),
  /**
   * Escape hatch for automated browser tests and CI, which run the production build
   * (`next build`, `next start`) with the dev sign-in adapter. Never set it in a deployed
   * environment.
   */
  E2E_ALLOW_DEV_AUTH: z.enum(["true", "false"]).optional(),
  /** Where the local storage adapter keeps private files. Git-ignored. */
  STORAGE_LOCAL_DIR: z.string().min(1).default("./.data/storage"),
  /** Signs file URLs (HMAC-SHA256). Separate from AUTH_SECRET so either can be rotated alone. */
  STORAGE_SIGNING_SECRET: secret(),
});

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const envRules = envSchema.superRefine((value, context) => {
  // The escape hatch only counts when the app is served from this machine, so a
  // stray E2E_ALLOW_DEV_AUTH in a deployed environment cannot enable password-free sign-in.
  const e2eOnLocalHost =
    value.E2E_ALLOW_DEV_AUTH === "true" && LOCAL_HOSTS.has(new URL(value.APP_BASE_URL).hostname);
  if (value.NODE_ENV === "production" && value.AUTH_PROVIDER === "dev" && !e2eOnLocalHost) {
    context.addIssue({
      code: "custom",
      path: ["AUTH_PROVIDER"],
      message:
        "the dev sign-in adapter is not allowed when NODE_ENV=production; a managed provider is needed before deployment (ADR-0010)",
    });
  }
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

  const result = envRules.safeParse(cleaned);
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
