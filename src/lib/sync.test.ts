import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getDirtyChanges, saveRecord } from "./db";
import { saveSyncConfig, syncNow } from "./sync";
import type { Entry } from "../domain/types";

const localEntry: Entry = {
  id: "entry_local",
  kind: "out",
  title: "Água",
  amount: 120,
  date: "2026-05-15",
  createdAt: "2026-05-15T10:00:00.000Z",
  updatedAt: "2026-05-15T10:00:00.000Z"
};

const remoteEntry: Entry = {
  id: "entry_remote",
  kind: "out",
  title: "Mercado",
  amount: 200,
  date: "2026-05-15",
  createdAt: "2026-05-15T10:01:00.000Z",
  updatedAt: "2026-05-15T10:01:00.000Z"
};

describe("syncNow", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("applies remote changes and retries local push after conflict", async () => {
    saveSyncConfig({
      apiUrl: "",
      token: "test-token",
      lastSyncAt: "2026-05-15T10:00:00.000Z"
    });
    await saveRecord("entries", localEntry);

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init) {
        return jsonResponse({ configured: true });
      }

      if (fetchMock.mock.calls.length === 2) {
        return jsonResponse(
          {
            serverTime: "2026-05-15T10:02:00.000Z",
            changes: { entries: [remoteEntry] }
          },
          409
        );
      }

      return jsonResponse({
        serverTime: "2026-05-15T10:03:00.000Z",
        changes: {}
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncNow();

    expect(result).toEqual({ ok: true, message: "Sincronizado." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await db.entries.get(remoteEntry.id)).toMatchObject({ title: "Mercado", syncStatus: "synced" });
    expect(await db.entries.get(localEntry.id)).toMatchObject({ title: "Água", syncStatus: "synced" });
    expect((await getDirtyChanges()).entries ?? []).toHaveLength(0);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
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
