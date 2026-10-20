import type { Metadata } from "next";
import { Lato, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { readDemoConfig } from "../lib/config";
import { cookieNames, hasValidSession } from "../lib/cookies";
import InfoButton, { type DjAccess } from "./info-button";
import "./globals.css";

const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "Gelatin Demo Partner",
  robots: { index: false, follow: false },
};

async function header(): Promise<{ signedIn: boolean; djAccess: DjAccess | null }> {
  try {
    const config = readDemoConfig();
    const signedIn = hasValidSession(config, (await cookies()).get(cookieNames(config).session)?.value);
    // DJ logins only ever reach a browser that passed the demo's own password.
    // Gelatin gives you the sandbox DJs' password; it's never in the code.
    const password = process.env.DEMO_DJ_PASSWORD?.trim() || null;
    return {
      signedIn,
      djAccess: signedIn
        ? { signInUrl: new URL("/sign-in", config.apiOrigin).toString(), inboxUrl: new URL("/dashboard/inbox", config.apiOrigin).toString(), password }
        : null,
    };
  } catch {
    return { signedIn: false, djAccess: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn, djAccess } = await header();
  return (
    <html lang="en" className={`${lato.variable} ${spaceGrotesk.variable}`}>
      <body>
        <div className="banner" role="note">
          <span className="dot" /> DEMO PARTNER · GELATIN SANDBOX · TEST MODE · USE STRIPE TEST CARDS ONLY
        </div>
        <header className="topbar">
          <Link className="brand" href="/">Demo Partner<small>for testing Gelatin</small></Link>
          <nav className="nav" aria-label="Main">
            {signedIn && <Link href="/">New booking</Link>}
            {signedIn && <Link href="/bookings">Bookings</Link>}
            <InfoButton djAccess={djAccess} />
            {signedIn && <form action="/api/logout" method="post"><button type="submit">Sign out</button></form>}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
