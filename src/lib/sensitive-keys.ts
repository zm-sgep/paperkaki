/**
 * Field names that must never appear in logs or audit metadata: contact details, child
 * nicknames, child answers, credentials and session material (CLAUDE.md, Privacy).
 * Matching is case-insensitive.
 */
export const SENSITIVE_KEYS = [
  "email",
  "nickname",
  "answer",
  "answers",
  "childAnswer",
  "childAnswers",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "password",
  "secret",
  "cookie",
  "cookies",
  "set-cookie",
  "authorization",
] as const;

const lowered = new Set(SENSITIVE_KEYS.map((key) => key.toLowerCase()));

export function isSensitiveKey(key: string): boolean {
  return lowered.has(key.toLowerCase());
}

/** Returns the paths (dot separated) of every sensitive key found anywhere in `value`. */
export function findSensitiveKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSensitiveKeys(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [...(isSensitiveKey(key) ? [path] : []), ...findSensitiveKeys(child, path)];
    });
  }
  return [];
}
