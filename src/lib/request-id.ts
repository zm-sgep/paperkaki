/**
 * Request IDs tie a log line, an audit event and the small reference shown on an error
 * screen to one request. Pure and runtime-neutral, so it can run in the proxy.
 */

export const REQUEST_ID_HEADER = "x-request-id";

// Accept a caller-supplied ID only if it is short and plain: it ends up in logs and headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function generateRequestId(): string {
  return crypto.randomUUID();
}

/** Keeps a valid incoming ID, otherwise generates one. */
export function resolveRequestId(incoming: string | null | undefined): string {
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : generateRequestId();
}
