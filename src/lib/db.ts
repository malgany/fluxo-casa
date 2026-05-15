import Dexie, { type Table } from "dexie";
import { createId, nowIso } from "../domain/dates";
import { defaultSettings } from "../domain/finance";
import {
  collectionNames,
  type AnyEntity,
  type AppSettings,
  type CollectionMap,
  type CollectionName,
  type Entry,
  type Recurrence,
  type SyncChanges,
  type SyncEntity
} from "../domain/types";

class FlowDatabase extends Dexie {
  entries!: Table<Entry, string>;
  recurrences!: Table<Recurrence, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("fluxo-casa");
    this.version(1).stores({
      entries: "id, date, updatedAt, deletedAt, syncStatus, kind, recurrenceId",
      recurrences: "id, startsOn, updatedAt, deletedAt, syncStatus, kind, active",
      settings: "id, updatedAt, deletedAt, syncStatus"
    });
  }
}

export const db = new FlowDatabase();

export function tableFor<K extends CollectionName>(collection: K): Table<CollectionMap[K], string> {
  return db[collection] as Table<CollectionMap[K], string>;
}

export function getClientId(): string {
  const key = "fluxo-casa-client-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const clientId = createId("client");
  localStorage.setItem(key, clientId);
  return clientId;
}

export function createBase(prefix: string): SyncEntity {
  const now = nowIso();
  return {
    id: createId(prefix),
    createdAt: now,
    updatedAt: now,
    syncStatus: "dirty"
  };
}

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get("settings_app");
  if (existing) return existing;

  const settings = defaultSettings();
  await db.settings.put(settings);
  return settings;
}

export async function saveRecord<K extends CollectionName>(collection: K, record: CollectionMap[K]): Promise<void> {
  const table = tableFor(collection);
  const now = nowIso();
  const existing = await table.get(record.id);
  await table.put({
    ...record,
    createdAt: record.createdAt || existing?.createdAt || now,
    updatedAt: now,
    syncStatus: "dirty"
  } as CollectionMap[K]);
}

export async function softDelete<K extends CollectionName>(collection: K, id: string): Promise<void> {
  const table = tableFor(collection);
  const current = await table.get(id);
  if (!current) return;

  const now = nowIso();
  await table.put({
    ...current,
    updatedAt: now,
    deletedAt: now,
    syncStatus: "deleted"
  } as CollectionMap[K]);
}

export async function getDirtyChanges(): Promise<SyncChanges> {
  const changes: SyncChanges = {};
  for (const collection of collectionNames) {
    const rows = await tableFor(collection).where("syncStatus").anyOf(["dirty", "deleted"]).toArray();
    if (rows.length > 0) changes[collection] = rows as never;
  }
  return changes;
}

export async function markChangesSynced(changes: SyncChanges): Promise<void> {
  await db.transaction(
    "rw",
    collectionNames.map((collection) => tableFor(collection)),
    async () => {
      for (const collection of collectionNames) {
        const table = tableFor(collection);
        for (const pushed of changes[collection] ?? []) {
          const current = await table.get(pushed.id);
          if (!current || current.updatedAt !== pushed.updatedAt) continue;
          await table.put({ ...current, syncStatus: "synced" } as never);
        }
      }
    }
  );
}

export async function applyRemoteChanges(changes: SyncChanges): Promise<void> {
  await db.transaction(
    "rw",
    collectionNames.map((collection) => tableFor(collection)),
    async () => {
      for (const collection of collectionNames) {
        const table = tableFor(collection);
        for (const remote of changes[collection] ?? []) {
          const current = await table.get(remote.id);
          if (current?.syncStatus && current.syncStatus !== "synced" && current.updatedAt > remote.updatedAt) continue;
          await table.put({ ...remote, syncStatus: "synced" } as never);
        }
      }
    }
  );
}

export async function exportBackup(): Promise<{ exportedAt: string; changes: SyncChanges }> {
  const changes: SyncChanges = {};
  for (const collection of collectionNames) {
    changes[collection] = (await tableFor(collection).toArray()).map(stripLocalStatus) as never;
  }
  return { exportedAt: nowIso(), changes };
}

export async function importBackup(payload: { changes?: SyncChanges }): Promise<void> {
  if (!payload.changes) throw new Error("Backup inválido.");

  await db.transaction(
    "rw",
    collectionNames.map((collection) => tableFor(collection)),
    async () => {
      for (const collection of collectionNames) {
        const table = tableFor(collection);
        for (const item of payload.changes?.[collection] ?? []) {
          await table.put({ ...item, syncStatus: "dirty" } as never);
        }
      }
    }
  );
}

function stripLocalStatus<T extends AnyEntity>(item: T): T {
  const clean = { ...item };
  delete clean.syncStatus;
  return clean;
}
