import { applyRemoteChanges, getDirtyChanges, markChangesSynced } from "./db";
import { getSupabaseClient } from "./supabase";
import type { AppSettings, Entry, Recurrence, SyncChanges } from "../domain/types";

export interface SyncResult {
  ok: boolean;
  message: string;
}

interface EntryRow {
  id: string;
  household_id: string;
  kind: Entry["kind"];
  title: string;
  icon_id: string | null;
  amount: number;
  date: string;
  recurrence_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RecurrenceRow {
  id: string;
  household_id: string;
  kind: Recurrence["kind"];
  title: string;
  icon_id: string | null;
  amount: number;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SettingsRow {
  id: string;
  household_id: string;
  opening_balance: number;
  opening_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const syncKeyPrefix = "fluxo-casa-supabase-sync-at";

export async function syncNow(householdId: string): Promise<SyncResult> {
  if (!householdId) return { ok: false, message: "Conta não selecionada." };

  try {
    const supabase = getSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session) return { ok: false, message: "Sessão expirada. Entre novamente." };

    const pulled = await pullRemoteChanges(householdId);
    await applyRemoteChanges(pulled);

    const dirty = await getDirtyChanges(householdId);
    await pushLocalChanges(dirty);
    await markChangesSynced(dirty);

    setLastSyncAt(householdId, new Date().toISOString());
    return { ok: true, message: "Sincronizado." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Sincronização falhou." };
  }
}

async function pullRemoteChanges(householdId: string): Promise<SyncChanges> {
  const supabase = getSupabaseClient();

  const entriesQuery = supabase.from("entries").select("*").eq("household_id", householdId);
  const recurrencesQuery = supabase.from("recurrences").select("*").eq("household_id", householdId);
  const settingsQuery = supabase.from("household_settings").select("*").eq("household_id", householdId);

  const [entries, recurrences, settings] = await Promise.all([entriesQuery, recurrencesQuery, settingsQuery]);
  if (entries.error) throw entries.error;
  if (recurrences.error) throw recurrences.error;
  if (settings.error) throw settings.error;

  return {
    entries: ((entries.data ?? []) as EntryRow[]).map(entryFromRow),
    recurrences: ((recurrences.data ?? []) as RecurrenceRow[]).map(recurrenceFromRow),
    settings: ((settings.data ?? []) as SettingsRow[]).map(settingsFromRow)
  };
}

async function pushLocalChanges(changes: SyncChanges): Promise<void> {
  const supabase = getSupabaseClient();
  const tasks: Promise<unknown>[] = [];

  if (changes.entries?.length) {
    tasks.push(check(supabase.from("entries").upsert(changes.entries.map(entryToRow), { onConflict: "id" })));
  }
  if (changes.recurrences?.length) {
    tasks.push(check(supabase.from("recurrences").upsert(changes.recurrences.map(recurrenceToRow), { onConflict: "id" })));
  }
  if (changes.settings?.length) {
    tasks.push(check(supabase.from("household_settings").upsert(changes.settings.map(settingsToRow), { onConflict: "id" })));
  }

  await Promise.all(tasks);
}

async function check<T>(request: PromiseLike<{ error: Error | null; data: T }>): Promise<T> {
  const result = await request;
  if (result.error) throw result.error;
  return result.data;
}

function getLastSyncAt(householdId: string): string | undefined {
  return localStorage.getItem(`${syncKeyPrefix}:${householdId}`) ?? undefined;
}

function setLastSyncAt(householdId: string, value: string): void {
  localStorage.setItem(`${syncKeyPrefix}:${householdId}`, value);
}

function entryFromRow(row: EntryRow): Entry {
  return {
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    title: row.title,
    iconId: row.icon_id ?? undefined,
    amount: Number(row.amount),
    date: row.date,
    recurrenceId: row.recurrence_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: "synced"
  };
}

function recurrenceFromRow(row: RecurrenceRow): Recurrence {
  return {
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    title: row.title,
    iconId: row.icon_id ?? undefined,
    amount: Number(row.amount),
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: "synced"
  };
}

function settingsFromRow(row: SettingsRow): AppSettings {
  return {
    id: row.id,
    householdId: row.household_id,
    openingBalance: Number(row.opening_balance),
    openingDate: row.opening_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: "synced"
  };
}

function entryToRow(entry: Entry): EntryRow {
  return {
    id: entry.id,
    household_id: entry.householdId,
    kind: entry.kind,
    title: entry.title,
    icon_id: entry.iconId ?? null,
    amount: entry.amount,
    date: entry.date,
    recurrence_id: entry.recurrenceId ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt ?? null
  };
}

function recurrenceToRow(recurrence: Recurrence): RecurrenceRow {
  return {
    id: recurrence.id,
    household_id: recurrence.householdId,
    kind: recurrence.kind,
    title: recurrence.title,
    icon_id: recurrence.iconId ?? null,
    amount: recurrence.amount,
    day_of_month: recurrence.dayOfMonth,
    starts_on: recurrence.startsOn,
    ends_on: recurrence.endsOn ?? null,
    active: recurrence.active,
    created_at: recurrence.createdAt,
    updated_at: recurrence.updatedAt,
    deleted_at: recurrence.deletedAt ?? null
  };
}

function settingsToRow(settings: AppSettings): SettingsRow {
  return {
    id: settings.id,
    household_id: settings.householdId,
    opening_balance: settings.openingBalance,
    opening_date: settings.openingDate,
    created_at: settings.createdAt,
    updated_at: settings.updatedAt,
    deleted_at: settings.deletedAt ?? null
  };
}
