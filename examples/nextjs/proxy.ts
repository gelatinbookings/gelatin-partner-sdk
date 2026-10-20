import { NextResponse, type NextRequest } from "next/server";
import { DemoConfigError, readDemoConfig } from "./lib/config";
import { cookieNames, hasValidSession } from "./lib/cookies";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

/** Every page and API route sits behind the shared demo password. */
export function proxy(request: NextRequest) {
  let config;
  try { config = readDemoConfig(); } catch (error) {
    if (error instanceof DemoConfigError) console.error(error.message);
    return new NextResponse("The demo partner is not configured.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (hasValidSession(config, request.cookies.get(cookieNames(config).session)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(new URL("/login", config.publicOrigin), 303);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
