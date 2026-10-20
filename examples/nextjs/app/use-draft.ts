"use client";

import { useCallback, useEffect, useState } from "react";
import { freshDraft, type Draft } from "../lib/draft";

const STORAGE_KEY = "partner-demo-draft-v2";

function load(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Draft | null;
    if (value && typeof value.nonce === "string" && Array.isArray(value.selected)) return { ...freshDraft(value.nonce), ...value };
  } catch { /* storage unavailable: start fresh */ }
  return freshDraft(crypto.randomUUID());
}

function save(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable: this page still works */ }
}

/**
 * The booking being put together, shared by the step pages in this tab only.
 * `null` until it has loaded, so server and browser render the same first frame.
 */
export function useDraft() {
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraft(load()));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (draft) save(draft); }, [draft]);
  const clear = useCallback(() => save(null), []);
  return { draft, setDraft, clear };
}
