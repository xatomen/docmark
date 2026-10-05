import { afterEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_UPDATE_DEBOUNCE_MS, PreviewUpdateScheduler } from "@/lib/document/preview-update-scheduler";

describe("PreviewUpdateScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("runs only the latest snapshot after the quiet period", () => {
    vi.useFakeTimers();
    const scheduler = new PreviewUpdateScheduler<string>();
    const run = vi.fn();
    scheduler.schedule("A", run);
    vi.advanceTimersByTime(120);
    scheduler.schedule("Ar", run);
    scheduler.schedule("Arquitectura", run);
    vi.advanceTimersByTime(PREVIEW_UPDATE_DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledExactlyOnceWith("Arquitectura");
  });

  it("flushes the latest snapshot immediately and cancels its timer", () => {
    vi.useFakeTimers();
    const scheduler = new PreviewUpdateScheduler<string>();
    const run = vi.fn();
    scheduler.schedule("stale", run);
    scheduler.flush("current", run);
    vi.runAllTimers();
    expect(run).toHaveBeenCalledExactlyOnceWith("current");
  });

  it("cancels pending work when its owning Preview unmounts or changes document", () => {
    vi.useFakeTimers();
    const scheduler = new PreviewUpdateScheduler<string>();
    const run = vi.fn();
    scheduler.schedule("document A", run);
    scheduler.cancel();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });
});
