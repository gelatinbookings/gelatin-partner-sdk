import type { Metadata } from "next";
import { Lato, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { readDemoConfig } from "../lib/config";
import { cookieNames, hasValidSession } from "../lib/cookies";
import { parseTier, type DemoTier } from "../lib/tier";
import InfoButton, { type DjAccess } from "./info-button";
import "./globals.css";

const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  // A made-up partner product; "Demo" stays in the tab so a capture can't pass for a real company.
  title: "Example Nights (demo)",
  robots: { index: false, follow: false },
};

async function header(): Promise<{ signedIn: boolean; djAccess: DjAccess | null; tier: DemoTier }> {
  try {
    const config = readDemoConfig();
    const jar = await cookies();
    const signedIn = hasValidSession(config, jar.get(cookieNames(config).session)?.value);
    const tier = parseTier(jar.get(cookieNames(config).tier)?.value);
    // DJ logins only ever reach a browser that passed the demo's own password.
    // Gelatin gives you the sandbox DJs' password; it's never in the code.
    const password = process.env.DEMO_DJ_PASSWORD?.trim() || null;
    return {
      signedIn,
      tier,
      djAccess: signedIn
        ? { signInUrl: new URL("/sign-in", config.apiOrigin).toString(), inboxUrl: new URL("/dashboard/inbox", config.apiOrigin).toString(), password }
        : null,
    };
  } catch {
    return { signedIn: false, djAccess: null, tier: "full" };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn, djAccess, tier } = await header();
  return (
    <html lang="en" className={`${lato.variable} ${spaceGrotesk.variable}`}>
      <body>
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">EN</span>
            Example Nights
            <span className="demo-tag" title="A demo partner site with synthetic data, booking in Gelatin's sandbox">Demo</span>
          </Link>
          {signedIn && (
            // GEL-917: show either integration tier. Switching starts a new booking.
            <form className="tier-switch" action="/api/tier" method="post" aria-label="Integration tier">
              <span className="tier-label">Integration</span>
              {(["light", "full"] as const).map((option) => (
                <button key={option} type="submit" name="tier" value={option} aria-pressed={tier === option}
                  title={option === "light" ? "The minimum: pick a DJ, then Gelatin's portal handles payment and everything after" : "Everything: city picker, genre, budget, draw, payment on this site"}>
                  {option === "light" ? "Light" : "Full"}
                </button>
              ))}
            </form>
          )}
          <nav className="nav" aria-label="Main">
            {signedIn && <Link href="/">New booking</Link>}
            {signedIn && <Link href="/bookings">Bookings</Link>}
            <InfoButton djAccess={djAccess} />
            {signedIn && <form action="/api/logout" method="post"><button type="submit">Sign out</button></form>}
          </nav>
        </header>
        {children}
        <footer className="site-foot" role="note">
          Example Nights is a demo partner site with synthetic data. Bookings go to Gelatin&apos;s sandbox in test mode: use Stripe test cards only.
        </footer>
      </body>
    </html>
  );
}
