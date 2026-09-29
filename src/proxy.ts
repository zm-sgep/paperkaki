import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/services/auth/session-token";

/** Areas that need a signed-in parent. Admin is checked for role by its layout and page. */
const PROTECTED_PREFIXES = ["/home", "/prepare", "/progress", "/rewards", "/account", "/admin"] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Gives every request an ID: keeps a valid incoming x-request-id, otherwise creates one.
 * The ID is passed on to the app (see getRequestId) and echoed on the response.
 *
 * Also sends visitors without a valid session cookie away from protected areas. That is a fast
 * redirect only: layouts, pages and actions verify the session again (requireParent).
 */
export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  if (isProtected(request.nextUrl.pathname)) {
    const session = await verifySessionToken(env.AUTH_SECRET, request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!session) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = "/sign-in";
      signInUrl.search = "";
      const redirect = NextResponse.redirect(signInUrl);
      redirect.headers.set(REQUEST_ID_HEADER, requestId);
      return redirect;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
