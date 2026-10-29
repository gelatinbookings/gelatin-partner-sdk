"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "../../lib/draft";
import { replaceDraft } from "../use-draft";

/** Saves the pre-filled booking with a fresh nonce, then continues the usual flow at the event step. */
export default function AlternateStart({ draft }: { draft: Omit<Draft, "nonce"> }) {
  const router = useRouter();
  useEffect(() => {
    replaceDraft({ ...draft, nonce: crypto.randomUUID() });
    router.replace("/event");
  }, [draft, router]);
  return <p className="notice notice-info" role="status">Starting a new offer to {draft.selected[0]?.name}…</p>;
}
