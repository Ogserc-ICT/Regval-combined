import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: send visitors without a session cookie to sign in.
 * The real check (valid session, active account, roles) runs on the server
 * in every page, action and route handler.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!sign-in|api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
