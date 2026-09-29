import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/config/env";

const valid = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "pglite://memory",
  AUTH_SECRET: "test-only-auth-secret-0123456789abcdef",
  STORAGE_SIGNING_SECRET: "test-only-storage-signing-secret-0123456789",
};

describe("parseEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env).toEqual({
      ...valid,
      LOG_LEVEL: "info",
      AUTH_PROVIDER: "dev",
      STORAGE_LOCAL_DIR: "./.data/storage",
    });
  });

  it("defaults NODE_ENV to development when unset", () => {
    expect(parseEnv({ ...valid, NODE_ENV: undefined }).NODE_ENV).toBe("development");
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ ...valid, LOG_LEVEL: "" }).LOG_LEVEL).toBe("info");
  });

  it.each([
    "postgres://user:pw@localhost:5432/db",
    "postgresql://user:pw@localhost:5432/db",
    "pglite://memory",
    "pglite://./.data/dev",
    "pglite:///var/lib/paperkaki",
  ])("accepts DATABASE_URL %s", (DATABASE_URL) => {
    expect(parseEnv({ ...valid, DATABASE_URL }).DATABASE_URL).toBe(DATABASE_URL);
  });

  it("reports every invalid variable by name", () => {
    let error: unknown;
    try {
      parseEnv({ NODE_ENV: "staging", APP_BASE_URL: "not a url", LOG_LEVEL: "loud", AUTH_PROVIDER: "clerk" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const issues = (error as EnvValidationError).issues.map((issue) => issue.variable);
    expect(issues).toEqual(
      expect.arrayContaining(["NODE_ENV", "APP_BASE_URL", "DATABASE_URL", "LOG_LEVEL", "AUTH_PROVIDER", "AUTH_SECRET"]),
    );
    const message = (error as Error).message;
    for (const name of ["NODE_ENV", "APP_BASE_URL", "DATABASE_URL", "LOG_LEVEL", "AUTH_PROVIDER", "AUTH_SECRET"]) {
      expect(message).toContain(name);
    }
  });

  it("rejects non-http APP_BASE_URL and unsupported DATABASE_URL schemes", () => {
    expect(() => parseEnv({ ...valid, APP_BASE_URL: "ftp://example.test" })).toThrow(
      /APP_BASE_URL: must be an absolute http\(s\) URL/,
    );
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL: must start with one of/,
    );
  });

  it("never prints the value of an invalid variable", () => {
    const secret = "hunter2-super-secret";
    const attempts: Record<string, string | undefined>[] = [
      { ...valid, DATABASE_URL: `mysql://admin:${secret}@db.example.test/prod` },
      { ...valid, APP_BASE_URL: `${secret} is not a url` },
      { ...valid, NODE_ENV: secret },
      { ...valid, LOG_LEVEL: secret },
      { ...valid, AUTH_SECRET: "too-short" },
    ];
    for (const attempt of attempts) {
      let message = "";
      try {
        parseEnv(attempt);
      } catch (caught) {
        message = (caught as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(secret);
    }
  });

  describe("file storage", () => {
    it("requires STORAGE_SIGNING_SECRET of at least 32 characters", () => {
      expect(() => parseEnv({ ...valid, STORAGE_SIGNING_SECRET: undefined })).toThrow(
        /STORAGE_SIGNING_SECRET: is required/,
      );
      expect(() => parseEnv({ ...valid, STORAGE_SIGNING_SECRET: "x".repeat(31) })).toThrow(
        /STORAGE_SIGNING_SECRET: must be at least 32 characters/,
      );
    });

    it("defaults STORAGE_LOCAL_DIR and accepts an override", () => {
      expect(parseEnv(valid).STORAGE_LOCAL_DIR).toBe("./.data/storage");
      expect(parseEnv({ ...valid, STORAGE_LOCAL_DIR: "/var/lib/paperkaki" }).STORAGE_LOCAL_DIR).toBe(
        "/var/lib/paperkaki",
      );
    });
  });

  describe("sign-in provider", () => {
    it("requires AUTH_SECRET and rejects one shorter than 32 characters", () => {
      expect(() => parseEnv({ ...valid, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET: is required/);
      expect(() => parseEnv({ ...valid, AUTH_SECRET: "x".repeat(31) })).toThrow(
        /AUTH_SECRET: must be at least 32 characters/,
      );
      expect(parseEnv({ ...valid, AUTH_SECRET: "x".repeat(32) }).AUTH_SECRET).toHaveLength(32);
    });

    it("rejects an unknown AUTH_PROVIDER", () => {
      expect(() => parseEnv({ ...valid, AUTH_PROVIDER: "magic" })).toThrow(/AUTH_PROVIDER: must be one of: dev/);
    });

    it("allows the dev adapter outside production", () => {
      for (const NODE_ENV of ["development", "test"]) {
        expect(parseEnv({ ...valid, NODE_ENV, AUTH_PROVIDER: "dev" }).AUTH_PROVIDER).toBe("dev");
      }
    });

    it("rejects AUTH_PROVIDER=dev when NODE_ENV=production", () => {
      expect(() => parseEnv({ ...valid, NODE_ENV: "production", AUTH_PROVIDER: "dev" })).toThrow(
        /AUTH_PROVIDER: the dev sign-in adapter is not allowed when NODE_ENV=production/,
      );
    });

    it("rejects the default provider in production too, because the default is dev", () => {
      expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(/AUTH_PROVIDER/);
    });

    it("lets automated browser tests opt in explicitly to the dev adapter in a production build", () => {
      const env = parseEnv({ ...valid, NODE_ENV: "production", E2E_ALLOW_DEV_AUTH: "true" });
      expect(env.AUTH_PROVIDER).toBe("dev");
      expect(() =>
        parseEnv({ ...valid, NODE_ENV: "production", E2E_ALLOW_DEV_AUTH: "false" }),
      ).toThrow(/AUTH_PROVIDER/);
    });

    it("keeps DEV_ADMIN_EMAILS optional", () => {
      expect(parseEnv(valid).DEV_ADMIN_EMAILS).toBeUndefined();
      expect(parseEnv({ ...valid, DEV_ADMIN_EMAILS: "a@example.test,b@example.test" }).DEV_ADMIN_EMAILS).toBe(
        "a@example.test,b@example.test",
      );
    });
  });
});
