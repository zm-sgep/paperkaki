import { signSessionToken, verifySessionToken } from "./session-token";
import type { AuthIdentity, AuthService, SessionClaims } from "./types";

export const DEV_AUTH_PROVIDER = "dev";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAdminEmails(list: string | undefined): ReadonlySet<string> {
  return new Set(
    (list ?? "")
      .split(",")
      .map(normaliseEmail)
      .filter((email) => email !== ""),
  );
}

/**
 * Local development adapter: any well-formed email signs in, no password. Refused in
 * production by environment validation (ADR-0010). Emails listed in DEV_ADMIN_EMAILS get
 * the admin role.
 */
export function createDevAuthService(options: {
  secret: string;
  adminEmails?: string | undefined;
}): AuthService {
  const admins = parseAdminEmails(options.adminEmails);

  return {
    provider: DEV_AUTH_PROVIDER,

    async authenticate({ email }): Promise<AuthIdentity | null> {
      const normalised = normaliseEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised) || normalised.length > 254) {
        return null;
      }
      return {
        provider: DEV_AUTH_PROVIDER,
        subject: normalised,
        email: normalised,
        role: admins.has(normalised) ? "admin" : "parent",
      };
    },

    issueSession(parentProfileId, now) {
      return signSessionToken(options.secret, parentProfileId, now);
    },

    async readSession(token, now): Promise<SessionClaims | null> {
      return verifySessionToken(options.secret, token, now);
    },
  };
}
