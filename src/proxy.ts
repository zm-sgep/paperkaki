import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { CHILD_SESSION_COOKIE_NAME, verifyChildSessionToken } from "@/services/auth/child-session-token";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/services/auth/session-token";

/** Areas that need a signed-in parent. Admin is checked for role by its layout and page. */
const PROTECTED_PREFIXES = ["/home", "/prepare", "/progress", "/rewards", "/account", "/admin"] as const;
/** Child screens that have no parent version. */
const CHILD_ONLY_PREFIXES = ["/today", "/practice", "/kid"] as const;
/**
 * Destinations both experiences have (ADR-0009). A signed-in parent gets the parent screen; a child
 * device gets the child screen, served from /kid/... behind the same address.
 */
const SHARED_PREFIXES = ["/progress", "/rewards"] as const;

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Gives every request an ID: keeps a valid incoming x-request-id, otherwise creates one.
 * The ID is passed on to the app (see getRequestId) and echoed on the response.
 *
 * Also sends visitors without a valid session cookie away from protected areas: parents to
 * /sign-in, child devices to the code screen. That is a fast redirect (and, for /progress and
 * /rewards, a rewrite to the child version) only: layouts, pages and actions verify the session
 * again (requireParent, requireChild).
 */
export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  };

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  let rewriteTo: string | null = null;

  const needsParent = matches(pathname, PROTECTED_PREFIXES);
  const needsChild = matches(pathname, CHILD_ONLY_PREFIXES);
  if (needsParent || needsChild) {
    const parent = needsParent
      ? await verifySessionToken(env.AUTH_SECRET, request.cookies.get(SESSION_COOKIE_NAME)?.value)
      : null;
    const child = !parent
      ? await verifyChildSessionToken(env.AUTH_SECRET, request.cookies.get(CHILD_SESSION_COOKIE_NAME)?.value)
      : null;

    if (needsChild) {
      if (!child) return redirectTo("/child");
    } else if (!parent) {
      if (child && matches(pathname, SHARED_PREFIXES)) {
        rewriteTo = `/kid${pathname}`;
      } else {
        return redirectTo("/sign-in");
      }
    }
  }

  const response = rewriteTo
    ? NextResponse.rewrite(new URL(`${rewriteTo}${request.nextUrl.search}`, request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
