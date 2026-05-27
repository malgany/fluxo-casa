import "fake-indexeddb/auto";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { loadHouseholdContext } from "./households";

const { rpcCalls, householdRows, supabaseMock } = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args?: unknown }>,
  householdRows: { current: [] as unknown[] },
  supabaseMock: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => supabaseMock
}));

const session = {
  user: {
    id: "user_1",
    email: "pessoa@fluxocasa.local"
  }
} as Session;

const defaultHouseholdRow = {
  id: "household_default",
  name: "Conta",
  role: "owner",
  owner_id: "user_1",
  created_at: "2026-05-27T10:00:00.000Z",
  updated_at: "2026-05-27T10:00:00.000Z"
};

describe("loadHouseholdContext", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createMemoryStorage());
    rpcCalls.length = 0;
    householdRows.current = [];
    supabaseMock.rpc.mockImplementation(createRpcMock);
    supabaseMock.from.mockImplementation(createTableMock);
  });

  it("creates a default account when a confirmed user has no household", async () => {
    const context = await loadHouseholdContext(session);

    expect(rpcCalls).toContainEqual({ name: "create_household", args: { household_name: "Conta" } });
    expect(context.selectedHouseholdId).toBe("household_default");
    expect(context.households).toMatchObject([{ id: "household_default", name: "Conta", role: "owner" }]);
    expect(await db.households.get("household_default")).toMatchObject({ name: "Conta", ownerId: "user_1", syncStatus: "synced" });
  });

  it("does not create a default account when the user already has a household", async () => {
    householdRows.current = [{ ...defaultHouseholdRow, id: "household_existing", name: "Casa" }];

    const context = await loadHouseholdContext(session);

    expect(rpcCalls.some((call) => call.name === "create_household")).toBe(false);
    expect(context.selectedHouseholdId).toBe("household_existing");
    expect(context.households).toMatchObject([{ id: "household_existing", name: "Casa" }]);
  });
});

function createRpcMock(name: string, args?: unknown) {
  rpcCalls.push({ name, args });

  if (name === "accept_pending_invitations") return Promise.resolve({ data: 0, error: null });
  if (name === "get_my_households") return Promise.resolve({ data: householdRows.current, error: null });
  if (name === "create_household") {
    householdRows.current = [defaultHouseholdRow];
    return Promise.resolve({ data: defaultHouseholdRow.id, error: null });
  }

  return Promise.resolve({ data: null, error: null });
}

function createTableMock(table: string) {
  if (table === "profiles") {
    return {
      upsert: () => Promise.resolve({ data: null, error: null })
    };
  }

  return {
    select: () => ({
      in: () => Promise.resolve({ data: [], error: null })
    })
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
