import { NextResponse, type NextRequest } from "next/server";

// Lightweight page gate: sends visitors without a session cookie to /login.
// Real authentication and role checks happen in every API route (requireUser).
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("icms_session")?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
