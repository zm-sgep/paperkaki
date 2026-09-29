import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/config/env";

const valid = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "pglite://memory",
};

describe("parseEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env).toEqual({ ...valid, LOG_LEVEL: "info" });
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
      parseEnv({ NODE_ENV: "staging", APP_BASE_URL: "not a url", LOG_LEVEL: "loud" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const issues = (error as EnvValidationError).issues.map((issue) => issue.variable);
    expect(issues).toEqual(
      expect.arrayContaining(["NODE_ENV", "APP_BASE_URL", "DATABASE_URL", "LOG_LEVEL"]),
    );
    const message = (error as Error).message;
    for (const name of ["NODE_ENV", "APP_BASE_URL", "DATABASE_URL", "LOG_LEVEL"]) {
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
});
