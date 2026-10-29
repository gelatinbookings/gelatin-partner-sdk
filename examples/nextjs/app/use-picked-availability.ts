"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { picksToCheck, type Draft } from "../lib/draft";

/**
 * Asks the demo server (`/api/availability`, which calls `listDjs`) whether
 * the picked DJs are still free on the booking's night. It runs once when a
 * step opens, and again on demand before sending.
 *
 * It only warns early. A failed check shows nothing and never blocks: Gelatin
 * checks again when the request is sent.
 */
export function usePickedAvailability(draft: Draft | null) {
  const [taken, setTaken] = useState<string[]>([]);
  const checkedOnOpen = useRef(false);

  const recheck = useCallback(async (current: Draft): Promise<string[]> => {
    if (!picksToCheck(current)) return [];
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: current.date, dj_ids: current.selected.map((item) => item.id) }),
      });
      if (!response.ok) return [];
      const body = await response.json() as { unavailable?: unknown };
      const ids = Array.isArray(body.unavailable) ? body.unavailable.filter((id): id is string => typeof id === "string") : [];
      setTaken(ids);
      return ids;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!draft || !picksToCheck(draft) || checkedOnOpen.current) return;
    checkedOnOpen.current = true;
    void recheck(draft);
  }, [draft, recheck]);

  /** Add DJs Gelatin named, such as the one a `409 dj_unavailable` was about. */
  const flag = useCallback((ids: readonly string[]) => {
    setTaken((current) => [...new Set([...current, ...ids])]);
  }, []);

  return { taken, recheck, flag };
}
