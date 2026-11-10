import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: send visitors without a session cookie to sign in,
 * remembering the page they wanted. The real check (valid session, not idle,
 * active account, roles) runs on the server in every page, action and route
 * handler.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname + request.nextUrl.search;
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // Pages read this to send a signed-out (or idle) person back here after signing in.
  const headers = new Headers(request.headers);
  headers.set("x-ogserc-path", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The browser's own JSON endpoints answer 401 themselves rather than redirect.
  matcher: ["/((?!sign-in|api/auth|api/cron|api/pulse|api/notifications|api/activity|api/drafts|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
