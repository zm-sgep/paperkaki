# ADR-0010: Provider-Independent Auth With a Local Development Adapter

## Status
Accepted (2026-09-29). Choice of production provider is open.

## Context
The architecture asks for managed auth. No provider account or secret is available to the build environment, and choosing a provider is a business decision (cost, data residency, login methods).

## Decision
- All authentication goes through `AuthService` in `src/services/auth`.
- The first adapter is `dev`: sign-in with an email address only, for local development, tests and demos.
- Environment validation refuses `AUTH_PROVIDER=dev` when `NODE_ENV=production`.
- Application code reads only the resolved parent identity (`parentProfileId`) and role. It never reads provider-specific objects.
- A managed adapter (for example Clerk, Auth0 or Supabase Auth) is added when the owner chooses a provider.

## Consequences
The product can be built and tested end to end now. It cannot be deployed to real families until a managed provider is chosen and its adapter is added.
