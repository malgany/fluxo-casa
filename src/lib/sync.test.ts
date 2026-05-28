import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getDirtyChanges, saveRecord } from "./db";
import { syncNow } from "./sync";
import type { Entry } from "../domain/types";

const { remoteRowsByTable, supabaseMock, upserts, upsertError } = vi.hoisted(() => ({
  remoteRowsByTable: {
    entries: [] as unknown[],
    recurrences: [] as unknown[],
    household_settings: [] as unknown[]
  } as Record<string, unknown[]>,
  upserts: [] as Array<{ table: string; rows: unknown[] }>,
  upsertError: { current: null as null | { message: string } },
  supabaseMock: {
    auth: {
      getSession: vi.fn()
    },
    from: vi.fn()
  }
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => supabaseMock
}));

const localEntry: Entry = {
  id: "entry_local",
  householdId: "household_1",
  kind: "out",
  title: "Agua",
  amount: 120,
  date: "2026-05-15",
  createdAt: "2026-05-15T10:00:00.000Z",
  updatedAt: "2026-05-15T10:00:00.000Z"
};

const remoteEntryRow = {
  id: "entry_remote",
  household_id: "household_1",
  kind: "out",
  title: "Mercado",
  icon_id: null,
  amount: 200,
  date: "2026-05-15",
  recurrence_id: null,
  created_at: "2026-05-15T10:01:00.000Z",
  updated_at: "2026-05-15T10:01:00.000Z",
  deleted_at: null
};

describe("syncNow", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createMemoryStorage());
    upserts.length = 0;
    upsertError.current = null;
    remoteRowsByTable.entries = [remoteEntryRow];
    remoteRowsByTable.recurrences = [];
    remoteRowsByTable.household_settings = [];
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    supabaseMock.from.mockImplementation((table: string) => createTableMock(table));
  });

  it("pulls remote changes and pushes only the selected household", async () => {
    await saveRecord("entries", localEntry);
    await saveRecord("entries", { ...localEntry, id: "entry_other", householdId: "household_2" });

    const result = await syncNow("household_1");

    expect(result).toMatchObject({ ok: true, message: "Sincronizado." });
    expect(result.notifications).toEqual([]);
    expect(await db.entries.get(remoteEntryRow.id)).toMatchObject({ title: "Mercado", householdId: "household_1", syncStatus: "synced" });
    expect(await db.entries.get(localEntry.id)).toMatchObject({ title: "Agua", syncStatus: "synced" });
    expect((await getDirtyChanges("household_1")).entries ?? []).toHaveLength(0);
    expect((await getDirtyChanges("household_2")).entries ?? []).toHaveLength(1);
    expect(upserts.find((item) => item.table === "entries")?.rows).toHaveLength(1);
  });

  it("does not expose technical Supabase errors to the user", async () => {
    await saveRecord("entries", localEntry);
    upsertError.current = { message: 'new row violates row-level security policy for table "entries"' };

    const result = await syncNow("household_1");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Não foi possível sincronizar agora. Seus dados ficam salvos neste aparelho e serão enviados quando o serviço estiver disponível.");
    expect(result.message).not.toContain("row-level security");
    expect(result.message).not.toContain("entries");
  });

  it("notifies remote entries created after the previous sync", async () => {
    localStorage.setItem("fluxo-casa-supabase-sync-at:household_1", "2026-05-15T09:00:00.000Z");

    const result = await syncNow("household_1");

    expect(result.notifications).toEqual([
      expect.objectContaining({
        action: "created",
        amount: 200,
        collection: "entries",
        date: "2026-05-15",
        title: "Mercado"
      })
    ]);
  });

  it("does not notify remote entry edits", async () => {
    localStorage.setItem("fluxo-casa-supabase-sync-at:household_1", "2026-05-15T09:00:00.000Z");
    await db.entries.put({
      ...localEntry,
      id: remoteEntryRow.id,
      title: "Mercado antigo",
      syncStatus: "synced"
    });

    const result = await syncNow("household_1");

    expect(result.notifications).toEqual([]);
  });

  it("notifies remote entries deleted after the previous sync", async () => {
    localStorage.setItem("fluxo-casa-supabase-sync-at:household_1", "2026-05-15T09:00:00.000Z");
    await db.entries.put({
      ...localEntry,
      id: remoteEntryRow.id,
      title: "Mercado",
      syncStatus: "synced"
    });
    remoteRowsByTable.entries = [
      {
        ...remoteEntryRow,
        deleted_at: "2026-05-15T11:00:00.000Z",
        updated_at: "2026-05-15T11:00:00.000Z"
      }
    ];

    const result = await syncNow("household_1");

    expect(result.notifications).toEqual([
      expect.objectContaining({
        action: "deleted",
        amount: 200,
        collection: "entries",
        title: "Mercado"
      })
    ]);
  });
});

function createTableMock(table: string) {
  return {
    select: () => createSelectQuery(table),
    upsert: (rows: unknown[]) => {
      upserts.push({ table, rows });
      if (upsertError.current) return Promise.resolve({ data: null, error: upsertError.current });
      return Promise.resolve({ data: rows, error: null });
    }
  };
}

function createSelectQuery(table: string) {
  const data = remoteRowsByTable[table] ?? [];
  const result = Promise.resolve({ data, error: null });
  return {
    eq: () => createSelectQuery(table),
    gt: () => createSelectQuery(table),
    then: result.then.bind(result)
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}
