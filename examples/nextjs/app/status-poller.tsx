"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 5000;
const FOR_MS = 30 * 60_000;

/**
 * While a DJ still has to answer, re-read Gelatin's status every few seconds
 * (the page reads it on the server), so "Confirmed" appears without a reload.
 * Pauses while the tab is hidden and stops after half an hour.
 */
export default function StatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > FOR_MS) { window.clearInterval(timer); return; }
      if (document.visibilityState === "visible") router.refresh();
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}
