import { afterEach, describe, expect, it, vi } from "vitest";
import { startStatusWatcher } from "../src/browser.js";

afterEach(() => vi.useRealTimers());

describe("opt-in status watcher", () => {
  it("uses ETags, pauses while hidden, and stops without another read", async () => {
    vi.useFakeTimers();
    let visible = true;
    let visibilityChanged: (() => void) | undefined;
    const visibility = {
      isVisible: () => visible,
      subscribe: (callback: () => void) => {
        visibilityChanged = callback;
        return () => { visibilityChanged = undefined; };
      },
    };
    const read = vi.fn()
      .mockResolvedValueOnce({ modified: true, etag: '"rev-1"', data: { revision: 1 } })
      .mockResolvedValueOnce({ modified: false, etag: '"rev-1"' })
      .mockResolvedValueOnce({ modified: true, etag: '"rev-2"', data: { revision: 2 } });
    const onUpdate = vi.fn();
    const watcher = startStatusWatcher({ read, onUpdate, intervalMs: 2_000, visibility });

    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read.mock.calls[0]?.[0]).toBeNull();
    expect(onUpdate).toHaveBeenCalledWith({ revision: 1 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(read.mock.calls[1]?.[0]).toBe('"rev-1"');
    expect(onUpdate).toHaveBeenCalledTimes(1);

    visible = false;
    visibilityChanged?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(2);

    visible = true;
    visibilityChanged?.();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(onUpdate).toHaveBeenLastCalledWith({ revision: 2 });
    watcher.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(visibilityChanged).toBeUndefined();
  });

  it("reports a failure and retries only at the configured interval", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ modified: true, etag: '"rev-1"', data: { revision: 1 } });
    const onError = vi.fn();
    const onUpdate = vi.fn();
    const watcher = startStatusWatcher({ read, onError, onUpdate, intervalMs: 2_000 });

    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith({ revision: 1 });
    watcher.stop();
  });

  it("does not start a read when already hidden", async () => {
    vi.useFakeTimers();
    const read = vi.fn();
    const watcher = startStatusWatcher({
      read,
      onUpdate: vi.fn(),
      visibility: { isVisible: () => false, subscribe: () => () => undefined },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("restarts immediately if the page returns while an old read is aborting", async () => {
    vi.useFakeTimers();
    let visible = true;
    let visibilityChanged: (() => void) | undefined;
    const visibility = {
      isVisible: () => visible,
      subscribe: (callback: () => void) => {
        visibilityChanged = callback;
        return () => undefined;
      },
    };
    let calls = 0;
    const read = vi.fn((_etag: string | null, signal: AbortSignal) => {
      calls += 1;
      if (calls === 2) return Promise.resolve({ modified: true as const, etag: '"rev-1"', data: { revision: 1 } });
      return new Promise<{ modified: true; etag: string; data: { revision: number } }>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const onUpdate = vi.fn();
    const watcher = startStatusWatcher({ read, onUpdate, visibility, intervalMs: 2_000 });

    visible = false;
    visibilityChanged?.();
    visible = true;
    visibilityChanged?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(read).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith({ revision: 1 });
    watcher.stop();
  });
});
