import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { readDemoConfig } from "../lib/config";
import { cookieNames, hasValidSession } from "../lib/cookies";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gelatin Partner Example",
  robots: { index: false, follow: false },
};

async function header() {
  try {
    const config = readDemoConfig();
    const signedIn = hasValidSession(config, (await cookies()).get(cookieNames(config).session)?.value);
    return { signedIn };
  } catch {
    return { signedIn: false };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await header();
  return (
    <html lang="en">
      <body>
        <div className="banner" role="note">
          <span className="dot" /> EXAMPLE PARTNER · GELATIN SANDBOX · TEST MODE · USE STRIPE TEST CARDS ONLY
        </div>
        <header className="topbar">
          <Link className="brand" href="/">Demo Partner<small>for testing Gelatin</small></Link>
          {signedIn && (
            <nav className="nav" aria-label="Main">
              <Link href="/">Find DJs</Link>
              <Link href="/bookings">Bookings</Link>
              <form action="/api/logout" method="post"><button type="submit">Sign out</button></form>
            </nav>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
