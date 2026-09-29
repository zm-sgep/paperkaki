import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, REDACTED } from "@/lib/logger";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { destination, entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe("logger", () => {
  it("writes one structured JSON object per line with a level label", () => {
    const { destination, entries } = capture();
    createLogger({ level: "info", destination }).info({ requestId: "req-12345678" }, "hello");
    const [entry] = entries();
    expect(entry).toMatchObject({
      level: "info",
      msg: "hello",
      requestId: "req-12345678",
      service: "paperkaki",
    });
    expect(typeof entry?.time).toBe("string");
  });

  it("honours the level", () => {
    const { destination, entries } = capture();
    const log = createLogger({ level: "warn", destination });
    log.info("hidden");
    log.warn("shown");
    expect(entries().map((entry) => entry.msg)).toEqual(["shown"]);
  });

  it("redacts sensitive fields at the top level and when nested", () => {
    const { destination, entries } = capture();
    const log = createLogger({ level: "info", destination });
    log.info(
      {
        email: "parent-a@example.test",
        nickname: "Test Child",
        answers: ["42"],
        token: "abc",
        child: { nickname: "Test Child", answer: "42" },
        req: { headers: { cookie: "session=abc", authorization: "Bearer abc", "set-cookie": "x=y" } },
        safe: "kept",
      },
      "event",
    );
    const [entry] = entries();
    const serialised = JSON.stringify(entry);
    for (const secret of ["parent-a@example.test", "Test Child", "session=abc", "Bearer abc", "x=y", '"42"']) {
      expect(serialised).not.toContain(secret);
    }
    expect(entry).toMatchObject({
      email: REDACTED,
      nickname: REDACTED,
      answers: REDACTED,
      token: REDACTED,
      child: { nickname: REDACTED, answer: REDACTED },
      req: { headers: { cookie: REDACTED, authorization: REDACTED, "set-cookie": REDACTED } },
      safe: "kept",
    });
  });
});
