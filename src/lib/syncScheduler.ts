import type { SyncNotification, SyncResult } from "./sync";

export type SyncIndicatorState = "idle" | "syncing" | "synced" | "error";

export type SyncReason = "startup" | "interval" | "online" | "visible" | "manual" | "mutation" | "household-select" | "household-create";

export interface SyncSnapshot {
  state: SyncIndicatorState;
  hint: string;
  hintVisible: boolean;
}

export interface SyncRequestOptions {
  reason: SyncReason;
  householdId?: string;
  showHint?: boolean;
  delayMs?: number;
}

interface PendingSyncRequest {
  reason: SyncReason;
  householdId: string;
  showHint: boolean;
}

interface SyncSchedulerOptions {
  sync: (householdId: string) => Promise<SyncResult>;
  getHouseholdId: () => string;
  isDemoMode?: () => boolean;
  onChange?: (snapshot: SyncSnapshot) => void;
  onNotifications?: (notifications: SyncNotification[]) => void;
}

export const initialSyncSnapshot: SyncSnapshot = {
  state: "idle",
  hint: "Ainda nao sincronizado",
  hintVisible: false
};

export class HouseholdSyncScheduler {
  private snapshot: SyncSnapshot = initialSyncSnapshot;
  private running = false;
  private disposed = false;
  private pendingRequest: PendingSyncRequest | null = null;
  private debouncedRequest: PendingSyncRequest | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: SyncSchedulerOptions) {}

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  request(options: SyncRequestOptions): void {
    if (this.disposed) return;

    const householdId = options.householdId ?? this.options.getHouseholdId();
    if (!householdId) return;

    const request: PendingSyncRequest = {
      reason: options.reason,
      householdId,
      showHint: Boolean(options.showHint)
    };

    if (options.delayMs && options.delayMs > 0) {
      this.queueDebounced(request, options.delayMs);
      return;
    }

    this.clearDebouncedRequest();
    this.runOrQueue(request);
  }

  revealHint(text?: string): void {
    this.updateSnapshot({
      hint: text ?? this.snapshot.hint,
      hintVisible: true
    });
  }

  hideHint(): void {
    this.updateSnapshot({ hintVisible: false });
  }

  dispose(): void {
    this.disposed = true;
    this.pendingRequest = null;
    this.debouncedRequest = null;
    this.clearDebouncedTimer();
  }

  private queueDebounced(request: PendingSyncRequest, delayMs: number): void {
    this.debouncedRequest = mergeRequests(this.debouncedRequest, request);
    this.clearDebouncedTimer();
    this.debounceTimer = setTimeout(() => {
      const queued = this.debouncedRequest;
      this.debouncedRequest = null;
      this.debounceTimer = undefined;
      if (queued) this.runOrQueue(queued);
    }, delayMs);
  }

  private runOrQueue(request: PendingSyncRequest): void {
    if (this.options.isDemoMode?.()) {
      this.updateSnapshot({
        state: "synced",
        hint: "Modo demo",
        hintVisible: request.showHint || this.snapshot.hintVisible
      });
      return;
    }

    if (this.running) {
      this.pendingRequest = mergeRequests(this.pendingRequest, request);
      if (request.showHint) this.revealHint("Atualizando...");
      return;
    }

    void this.run(request);
  }

  private async run(request: PendingSyncRequest): Promise<void> {
    this.running = true;
    this.updateSnapshot({
      state: "syncing",
      hint: "Atualizando...",
      hintVisible: request.showHint || this.snapshot.hintVisible
    });

    try {
      const result = await this.options.sync(request.householdId);
      if (this.disposed) return;
      if (result.ok && result.notifications?.length) this.options.onNotifications?.(result.notifications);

      this.updateSnapshot({
        state: result.ok ? "synced" : "error",
        hint: result.ok ? "Sincronizado" : result.message,
        hintVisible: request.showHint || !result.ok || this.snapshot.hintVisible
      });
    } finally {
      this.running = false;
      if (this.disposed) return;

      const pending = this.pendingRequest;
      this.pendingRequest = null;
      if (pending) this.runOrQueue(pending);
    }
  }

  private updateSnapshot(next: Partial<SyncSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...next };
    this.options.onChange?.(this.snapshot);
  }

  private clearDebouncedRequest(): void {
    this.debouncedRequest = null;
    this.clearDebouncedTimer();
  }

  private clearDebouncedTimer(): void {
    if (this.debounceTimer === undefined) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }
}

function mergeRequests(current: PendingSyncRequest | null, next: PendingSyncRequest): PendingSyncRequest {
  if (!current) return next;

  return {
    reason: next.reason,
    householdId: next.householdId,
    showHint: current.showHint || next.showHint
  };
}
