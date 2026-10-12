import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Keeps signed-out visitors out of the dashboard and the API. Routes still check ownership themselves. */
export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  if (token?.uid) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

// auth routes must stay open for sign-in; the cron route authenticates with its own bearer secret
export const config = { matcher: ["/dashboard/:path*", "/api/((?!auth|cron).*)"] };
