import { env } from "@/config/env";
import { createDevAuthService } from "./dev-adapter";
import type { AuthService } from "./types";

export type { AuthIdentity, AuthRole, AuthService, SessionClaims } from "./types";
export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "./session-token";

let cached: AuthService | undefined;

/** The adapter chosen by AUTH_PROVIDER. Add managed adapters here (ADR-0010). */
export function getAuthService(): AuthService {
  if (!cached) {
    switch (env.AUTH_PROVIDER) {
      case "dev":
        cached = createDevAuthService({ secret: env.AUTH_SECRET, adminEmails: env.DEV_ADMIN_EMAILS });
        break;
    }
  }
  if (!cached) {
    throw new Error("No auth adapter is configured.");
  }
  return cached;
}
