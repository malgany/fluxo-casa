export const collectionNames = ["entries", "recurrences", "settings"] as const;

export type CollectionName = (typeof collectionNames)[number];
export type FlowKind = "in" | "out";
export type SyncStatus = "synced" | "dirty" | "deleted";
export type HouseholdRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface SyncEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus?: SyncStatus;
}

export interface Entry extends SyncEntity {
  householdId: string;
  kind: FlowKind;
  title: string;
  iconId?: string;
  amount: number;
  date: string;
  recurrenceId?: string;
}

export interface Recurrence extends SyncEntity {
  householdId: string;
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
  householdId: string;
  openingBalance: number;
  openingDate: string;
}

export interface Household extends SyncEntity {
  name: string;
  ownerId: string;
}

export interface HouseholdMember extends SyncEntity {
  householdId: string;
  userId: string;
  email?: string;
  role: HouseholdRole;
}

export interface HouseholdInvitation extends SyncEntity {
  householdId: string;
  email: string;
  role: HouseholdRole;
  status: InvitationStatus;
  invitedBy: string;
  acceptedAt?: string;
}

export interface CollectionMap {
  entries: Entry;
  recurrences: Recurrence;
  settings: AppSettings;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
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
