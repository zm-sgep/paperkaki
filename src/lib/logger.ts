import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import type { Env } from "@/config/env";
import { SENSITIVE_KEYS } from "./sensitive-keys";

/**
 * Structured JSON logging, one object per line on stdout. Server-side only.
 *
 * Sensitive fields are redacted wherever they appear up to three levels deep, so a
 * request or context object that carries a cookie or an email cannot leak it. Log
 * identifiers (request ID, entity IDs), not personal content.
 */

export const REDACTED = "[Redacted]";

// pino wildcards match a single level, so list each key at depth 0, 1 and 2 (and headers).
const redactPaths = SENSITIVE_KEYS.flatMap((key) => {
  const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
  const at = (prefix: string) => (name.startsWith("[") ? `${prefix}${name}` : `${prefix}.${name}`);
  return [name, at("*"), at("*.*"), at("*.*.*")];
});

type LogLevel = Env["LOG_LEVEL"];

export function createLogger(options: { level?: LogLevel; destination?: DestinationStream } = {}): Logger {
  const config: LoggerOptions = {
    level: options.level ?? (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info",
    base: { service: "paperkaki" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: redactPaths, censor: REDACTED },
  };
  return options.destination ? pino(config, options.destination) : pino(config);
}

/** The app-wide logger. Level comes from the validated LOG_LEVEL (default: info). */
export const logger: Logger = createLogger();

/** A logger that stamps every line with the request ID. */
export function requestLogger(requestId: string | undefined): Logger {
  return requestId ? logger.child({ requestId }) : logger;
}
