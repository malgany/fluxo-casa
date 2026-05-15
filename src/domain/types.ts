export const collectionNames = ["entries", "recurrences", "settings"] as const;

export type CollectionName = (typeof collectionNames)[number];
export type FlowKind = "in" | "out";
export type SyncStatus = "synced" | "dirty" | "deleted";

export interface SyncEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus?: SyncStatus;
}

export interface Entry extends SyncEntity {
  kind: FlowKind;
  title: string;
  iconId?: string;
  amount: number;
  date: string;
  recurrenceId?: string;
}

export interface Recurrence extends SyncEntity {
  kind: FlowKind;
  title: string;
  iconId?: string;
  amount: number;
  dayOfMonth: number;
  startsOn: string;
  endsOn?: string;
  active: boolean;
}

export interface AppSettings extends SyncEntity {
  openingBalance: number;
  openingDate: string;
}

export interface CollectionMap {
  entries: Entry;
  recurrences: Recurrence;
  settings: AppSettings;
}

export type AnyEntity = CollectionMap[CollectionName];

export type SyncChanges = {
  [K in CollectionName]?: CollectionMap[K][];
};

export interface SyncRequest {
  clientId: string;
  since?: string;
  changes: SyncChanges;
}

export interface SyncResponse {
  serverTime: string;
  changes: SyncChanges;
}
