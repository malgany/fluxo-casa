import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { applyRemoteChanges, db, getDirtyChanges, markChangesSynced, saveRecord } from "./db";
import type { Entry } from "../domain/types";

const entry: Entry = {
  id: "entry_test",
  kind: "out",
  title: "Farmácia",
  amount: 80,
  date: "2026-05-10",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

describe("IndexedDB sync state", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("saves dirty entries and clears dirty state after push", async () => {
    await saveRecord("entries", entry);
    const dirty = await getDirtyChanges();

    expect(dirty.entries).toHaveLength(1);
    expect(dirty.entries?.[0].syncStatus).toBe("dirty");

    await markChangesSynced(dirty);
    expect((await getDirtyChanges()).entries ?? []).toHaveLength(0);
  });

  it("keeps newer local dirty data over older remote data", async () => {
    await db.entries.put({
      ...entry,
      title: "Local",
      updatedAt: "2026-05-11T00:00:00.000Z",
      syncStatus: "dirty"
    });

    await applyRemoteChanges({
      entries: [{ ...entry, title: "Remoto", updatedAt: "2026-05-10T00:00:00.000Z" }]
    });

    expect((await db.entries.get(entry.id))?.title).toBe("Local");
  });
});
