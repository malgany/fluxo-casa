import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncResult } from "./sync";
import { HouseholdSyncScheduler } from "./syncScheduler";

describe("HouseholdSyncScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounces repeated mutation sync requests", async () => {
    vi.useFakeTimers();
    const sync = vi.fn<() => Promise<SyncResult>>().mockResolvedValue({ ok: true, message: "Sincronizado." });
    const scheduler = new HouseholdSyncScheduler({
      sync,
      getHouseholdId: () => "household_1"
    });

    scheduler.request({ reason: "mutation", delayMs: 1200 });
    scheduler.request({ reason: "mutation", delayMs: 1200 });

    await vi.advanceTimersByTimeAsync(1199);
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith("household_1");

    scheduler.dispose();
  });

  it("runs one queued sync after the current sync finishes", async () => {
    const pendingResults: Array<(result: SyncResult) => void> = [];
    const sync = vi.fn(() => new Promise<SyncResult>((resolve) => pendingResults.push(resolve)));
    const scheduler = new HouseholdSyncScheduler({
      sync,
      getHouseholdId: () => "household_1"
    });

    scheduler.request({ reason: "startup" });
    scheduler.request({ reason: "visible" });
    scheduler.request({ reason: "online" });

    expect(sync).toHaveBeenCalledTimes(1);

    pendingResults[0]({ ok: true, message: "Sincronizado." });
    await Promise.resolve();
    await Promise.resolve();

    expect(sync).toHaveBeenCalledTimes(2);

    pendingResults[1]({ ok: true, message: "Sincronizado." });
    await Promise.resolve();

    expect(sync).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });
});
