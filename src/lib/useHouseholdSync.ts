import { useCallback, useEffect, useRef, useState } from "react";
import { syncNow, type SyncNotification } from "./sync";
import { HouseholdSyncScheduler, initialSyncSnapshot, type SyncRequestOptions, type SyncSnapshot } from "./syncScheduler";

const HINT_HIDE_DELAY_MS = 2200;

export const MUTATION_SYNC_DEBOUNCE_MS = 1200;
export const VISIBLE_SYNC_INTERVAL_MS = 2 * 60 * 1000;

export interface UseHouseholdSyncResult extends SyncSnapshot {
  notifications: SyncNotification[];
  requestSync: (options: SyncRequestOptions) => void;
  revealSyncHint: (text?: string) => void;
  markNotificationRead: (notificationId: string) => void;
}

export function useHouseholdSync({ householdId, demoMode }: { householdId: string; demoMode: boolean }): UseHouseholdSyncResult {
  const householdIdRef = useRef(householdId);
  const demoModeRef = useRef(demoMode);
  const addNotificationsRef = useRef<(notifications: SyncNotification[]) => void>(() => undefined);
  const schedulerRef = useRef<HouseholdSyncScheduler | null>(null);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot);
  const [notifications, setNotifications] = useState<SyncNotification[]>(() => loadNotifications(householdId));

  householdIdRef.current = householdId;
  demoModeRef.current = demoMode;
  addNotificationsRef.current = (incoming) => {
    const targetHouseholdId = incoming[0]?.householdId;
    if (!targetHouseholdId) return;

    const merged = mergeNotifications(loadNotifications(targetHouseholdId), incoming);
    saveNotifications(targetHouseholdId, merged);
    if (targetHouseholdId === householdIdRef.current) setNotifications(merged);
  };

  if (!schedulerRef.current) {
    schedulerRef.current = new HouseholdSyncScheduler({
      sync: syncNow,
      getHouseholdId: () => householdIdRef.current,
      isDemoMode: () => demoModeRef.current,
      onChange: setSnapshot,
      onNotifications: (incoming) => addNotificationsRef.current(incoming)
    });
  }

  const requestSync = useCallback((options: SyncRequestOptions) => {
    schedulerRef.current?.request(options);
  }, []);

  const revealSyncHint = useCallback((text?: string) => {
    schedulerRef.current?.revealHint(text);
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    const currentHouseholdId = householdIdRef.current;
    if (!currentHouseholdId) return;

    setNotifications((current) => {
      const remaining = current.filter((notification) => notification.id !== notificationId);
      if (remaining.length === current.length) return current;

      if (!demoModeRef.current) saveNotifications(currentHouseholdId, remaining);
      return remaining;
    });
  }, []);

  useEffect(() => {
    return () => schedulerRef.current?.dispose();
  }, []);

  useEffect(() => {
    setNotifications(demoMode && householdId ? demoNotifications(householdId) : loadNotifications(householdId));
  }, [demoMode, householdId]);

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
    markNotificationRead,
    notifications,
    requestSync,
    revealSyncHint
  };
}

const notificationsKeyPrefix = "fluxo-casa-notifications";
const maxStoredNotifications = 20;

function notificationsKey(householdId: string): string {
  return `${notificationsKeyPrefix}:${householdId}`;
}

function loadNotifications(householdId: string): SyncNotification[] {
  if (!householdId || typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(notificationsKey(householdId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncNotification[];
    return Array.isArray(parsed) ? parsed.filter(isSyncNotification) : [];
  } catch {
    return [];
  }
}

function saveNotifications(householdId: string, notifications: SyncNotification[]): void {
  if (!householdId || typeof localStorage === "undefined") return;
  localStorage.setItem(notificationsKey(householdId), JSON.stringify(notifications.slice(0, maxStoredNotifications)));
}

function mergeNotifications(current: SyncNotification[], incoming: SyncNotification[]): SyncNotification[] {
  const byId = new Map<string, SyncNotification>();
  for (const notification of [...incoming, ...current]) {
    if (!byId.has(notification.id)) byId.set(notification.id, notification);
  }
  return Array.from(byId.values()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, maxStoredNotifications);
}

function demoNotifications(householdId: string): SyncNotification[] {
  return [
    {
      id: `${householdId}:demo-notification-1`,
      householdId,
      action: "created",
      collection: "entries",
      title: "Mercado",
      amount: 286.4,
      flowKind: "out",
      date: "2026-06-01",
      occurredAt: "2026-06-01T12:00:00.000Z"
    },
    {
      id: `${householdId}:demo-notification-2`,
      householdId,
      action: "created",
      collection: "recurrences",
      title: "Internet",
      amount: 119.9,
      flowKind: "out",
      date: "2026-06-02",
      occurredAt: "2026-06-01T11:45:00.000Z"
    },
    {
      id: `${householdId}:demo-notification-3`,
      householdId,
      action: "deleted",
      collection: "entries",
      title: "Freelance",
      amount: 750,
      flowKind: "in",
      date: "2026-06-03",
      occurredAt: "2026-06-01T11:30:00.000Z"
    }
  ];
}

function isSyncNotification(value: unknown): value is SyncNotification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SyncNotification>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.householdId === "string" &&
    (candidate.action === "created" || candidate.action === "deleted") &&
    (candidate.collection === "entries" || candidate.collection === "recurrences") &&
    typeof candidate.title === "string" &&
    typeof candidate.amount === "number" &&
    (candidate.flowKind === "in" || candidate.flowKind === "out") &&
    typeof candidate.date === "string" &&
    typeof candidate.occurredAt === "string"
  );
}
