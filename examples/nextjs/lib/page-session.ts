import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDemoConfig, type DemoConfig } from "./config";
import { cookieNames, hasValidSession, readBookings, type DemoBooking } from "./cookies";

/** Pages re-check the session themselves; the proxy is a convenience, not the only gate. */
export async function requirePageSession(): Promise<{ config: DemoConfig; bookings: DemoBooking[] }> {
  const config = readDemoConfig();
  const jar = await cookies();
  const names = cookieNames(config);
  if (!hasValidSession(config, jar.get(names.session)?.value)) redirect("/login");
  return { config, bookings: readBookings(config, jar.get(names.bookings)?.value) };
}
