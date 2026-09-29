/**
 * Provider-independent sign-in (ADR-0010). Application code depends on this interface and on
 * the resolved parent identity only; it never sees a provider-specific object.
 */

export type AuthRole = "parent" | "admin";

/** Who the provider says the person is. Stored as (provider, subject) on the parent profile. */
export type AuthIdentity = {
  provider: string;
  /** Stable identifier from the provider. For the dev adapter: the lower-cased email. */
  subject: string;
  email: string;
  role: AuthRole;
};

export type SessionClaims = {
  parentProfileId: string;
  issuedAt: Date;
  expiresAt: Date;
};

export interface AuthService {
  readonly provider: string;

  /**
   * Turns what the person typed into a verified identity, or null when it is not acceptable.
   * The dev adapter accepts any well-formed email; a managed provider would verify a
   * credential here.
   */
  authenticate(input: { email: string }): Promise<AuthIdentity | null>;

  /** Creates the signed value stored in the session cookie. */
  issueSession(parentProfileId: string, now?: Date): Promise<string>;

  /** Returns the session claims for a valid, unexpired token; otherwise null. Never throws. */
  readSession(token: string | undefined | null, now?: Date): Promise<SessionClaims | null>;
}
