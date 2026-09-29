import { headers } from "next/headers";
import { REQUEST_ID_HEADER } from "./request-id";

/**
 * Server helper: the ID the proxy assigned to the current request.
 * Use in Server Components, Route Handlers and Server Actions.
 */
export async function getRequestId(): Promise<string | undefined> {
  const requestHeaders = await headers();
  return requestHeaders.get(REQUEST_ID_HEADER) ?? undefined;
}
