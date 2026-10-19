/**
 * Browser-safe status helper. `read` must call the partner's own backend;
 * partner API credentials must never be passed into this entry point.
 */
export type StatusReadResult<T> =
  | { modified: false; etag: string | null }
  | { modified: true; etag: string | null; data: T };

export type Visibility = {
  isVisible(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type StatusWatcherOptions<T> = {
  read(etag: string | null, signal: AbortSignal): Promise<StatusReadResult<T>>;
  onUpdate(data: T): void;
  onError?(error: unknown): void;
  intervalMs?: number;
  visibility?: Visibility;
};

function browserVisibility(): Visibility {
  if (typeof document === "undefined") {
    return { isVisible: () => true, subscribe: () => () => undefined };
  }
  return {
    isVisible: () => document.visibilityState === "visible",
    subscribe(onChange) {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

/** Starts only when explicitly called; never overlaps reads or runs while hidden. */
export function startStatusWatcher<T>(options: StatusWatcherOptions<T>): { stop(): void; refresh(): void } {
  const visibility = options.visibility ?? browserVisibility();
  const interval = Math.max(1_000, options.intervalMs ?? 10_000);
  let etag: string | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    clearTimer();
    if (!stopped && visibility.isVisible()) timer = setTimeout(() => void read(), interval);
  }

  async function read() {
    if (stopped || !visibility.isVisible() || active) return;
    clearTimer();
    const controller = new AbortController();
    active = controller;
    try {
      const result = await options.read(etag, controller.signal);
      if (stopped || controller.signal.aborted) return;
      if (result.etag !== null) etag = result.etag;
      if (result.modified) options.onUpdate(result.data);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) options.onError?.(error);
    } finally {
      if (active === controller) {
        active = undefined;
        schedule();
      }
    }
  }

  const unsubscribe = visibility.subscribe(() => {
    if (!visibility.isVisible()) {
      clearTimer();
      const stale = active;
      active = undefined;
      stale?.abort();
    } else {
      void read();
    }
  });
  if (visibility.isVisible()) void read();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
      active?.abort();
      unsubscribe();
    },
    refresh() { void read(); },
  };
}
