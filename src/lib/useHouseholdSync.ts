import { useCallback, useEffect, useRef, useState } from "react";
import { syncNow } from "./sync";
import { HouseholdSyncScheduler, initialSyncSnapshot, type SyncRequestOptions, type SyncSnapshot } from "./syncScheduler";

const HINT_HIDE_DELAY_MS = 2200;

export const MUTATION_SYNC_DEBOUNCE_MS = 1200;
export const VISIBLE_SYNC_INTERVAL_MS = 2 * 60 * 1000;

export interface UseHouseholdSyncResult extends SyncSnapshot {
  requestSync: (options: SyncRequestOptions) => void;
  revealSyncHint: (text?: string) => void;
}

export function useHouseholdSync({ householdId, demoMode }: { householdId: string; demoMode: boolean }): UseHouseholdSyncResult {
  const householdIdRef = useRef(householdId);
  const demoModeRef = useRef(demoMode);
  const schedulerRef = useRef<HouseholdSyncScheduler | null>(null);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot);

  householdIdRef.current = householdId;
  demoModeRef.current = demoMode;

  if (!schedulerRef.current) {
    schedulerRef.current = new HouseholdSyncScheduler({
      sync: syncNow,
      getHouseholdId: () => householdIdRef.current,
      isDemoMode: () => demoModeRef.current,
      onChange: setSnapshot
    });
  }

  const requestSync = useCallback((options: SyncRequestOptions) => {
    schedulerRef.current?.request(options);
  }, []);

  const revealSyncHint = useCallback((text?: string) => {
    schedulerRef.current?.revealHint(text);
  }, []);

  useEffect(() => {
    return () => schedulerRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!snapshot.hintVisible) return undefined;

    const timer = window.setTimeout(() => schedulerRef.current?.hideHint(), HINT_HIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot.hint, snapshot.hintVisible]);

  useEffect(() => {
    if (!householdId) return undefined;

    requestSync({ reason: "startup", householdId });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      requestSync({ reason: "interval", householdId });
    }, VISIBLE_SYNC_INTERVAL_MS);

    function syncWhenOnline() {
      requestSync({ reason: "online", householdId });
    }

    function syncWhenVisible() {
      if (document.visibilityState === "visible") requestSync({ reason: "visible", householdId });
    }

    window.addEventListener("online", syncWhenOnline);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", syncWhenOnline);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [householdId, requestSync]);

  return {
    ...snapshot,
    requestSync,
    revealSyncHint
  };
}
