import type { Session } from "@supabase/supabase-js";
import { nowIso } from "../domain/dates";
import type { Household, HouseholdMember, HouseholdRole, HouseholdSummary } from "../domain/types";
import { db } from "./db";
import { getSupabaseClient } from "./supabase";

const selectedHouseholdKey = "fluxo-casa-selected-household";

interface HouseholdRow {
  id: string;
  name: string;
  role: HouseholdRole;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface HouseholdMemberRow {
  id: string;
  household_id: string;
  user_id: string;
  email: string | null;
  role: HouseholdRole;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HouseholdContext {
  households: HouseholdSummary[];
  selectedHouseholdId: string;
}

export function getSelectedHouseholdId(): string {
  return localStorage.getItem(selectedHouseholdKey) ?? "";
}

export function setSelectedHouseholdId(householdId: string): void {
  if (householdId) localStorage.setItem(selectedHouseholdKey, householdId);
  else localStorage.removeItem(selectedHouseholdKey);
}

export async function loadHouseholdContext(session: Session): Promise<HouseholdContext> {
  const supabase = getSupabaseClient();

  const { error: invitationError } = await supabase.rpc("accept_pending_invitations");
  if (invitationError) throw invitationError;

  const households = await fetchHouseholds();
  await saveHouseholdsLocally(households);
  if (households.length > 0) await refreshMembers(households.map((household) => household.id));

  const stored = getSelectedHouseholdId();
  const selectedHouseholdId = households.some((household) => household.id === stored) ? stored : households[0]?.id ?? "";
  setSelectedHouseholdId(selectedHouseholdId);

  await upsertProfile(session);
  return { households, selectedHouseholdId };
}

export async function loadCachedHouseholds(): Promise<HouseholdSummary[]> {
  const households = await db.households.toArray();
  const members = await db.householdMembers.toArray();
  return households
    .filter((household) => !household.deletedAt)
    .map((household) => {
      const member = members.find((item) => item.householdId === household.id && !item.deletedAt);
      return member
        ? {
            id: household.id,
            name: household.name,
            role: member.role,
            ownerId: household.ownerId,
            createdAt: household.createdAt,
            updatedAt: household.updatedAt
          }
        : undefined;
    })
    .filter(Boolean) as HouseholdSummary[];
}

export async function createHousehold(name: string): Promise<HouseholdContext> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("create_household", { household_name: name.trim() || "Minha casa" });
  if (error) throw new Error(error.message);

  const households = await fetchHouseholds();
  await saveHouseholdsLocally(households);
  await refreshMembers(households.map((household) => household.id));

  const created = households.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selectedHouseholdId = created?.id ?? households[0]?.id ?? "";
  if (selectedHouseholdId) setSelectedHouseholdId(selectedHouseholdId);
  return { households, selectedHouseholdId };
}

export async function updateHouseholdName(householdId: string, name: string): Promise<HouseholdContext> {
  const cleanName = name.trim();
  if (!householdId || !cleanName) throw new Error("Informe o nome da casa.");

  const { error } = await getSupabaseClient().rpc("update_household_name", {
    target_household_id: householdId,
    household_name: cleanName
  });
  if (error) throw new Error(error.message);

  const households = await fetchHouseholds();
  await saveHouseholdsLocally(households);
  await refreshMembers(households.map((household) => household.id));

  const selectedHouseholdId = households.some((household) => household.id === householdId) ? householdId : households[0]?.id ?? "";
  setSelectedHouseholdId(selectedHouseholdId);
  return { households, selectedHouseholdId };
}

export async function removeHouseholdMember(householdId: string, memberId: string): Promise<HouseholdMember[]> {
  if (!householdId || !memberId) throw new Error("Membro inválido.");

  const { error } = await getSupabaseClient().rpc("remove_household_member", {
    target_member_id: memberId
  });
  if (error) throw new Error(error.message);

  await refreshMembers([householdId]);
  return db.householdMembers.where("householdId").equals(householdId).toArray();
}

export async function inviteHouseholdMember(householdId: string, email: string, role: HouseholdRole): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  const response = await fetch("/api/invite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ householdId, email, role })
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Não foi possível enviar o convite." }))) as { message?: string };
    throw new Error(error.message || "Não foi possível enviar o convite.");
  }
}

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  await refreshMembers([householdId]);
  return db.householdMembers.where("householdId").equals(householdId).toArray();
}

async function fetchHouseholds(): Promise<HouseholdSummary[]> {
  const { data, error } = await getSupabaseClient().rpc("get_my_households");
  if (error) throw new Error(error.message);

  return ((data ?? []) as HouseholdRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function refreshMembers(householdIds: string[]): Promise<void> {
  if (householdIds.length === 0) return;

  const { data, error } = await getSupabaseClient().from("household_members").select("*").in("household_id", householdIds);
  if (error) throw new Error(error.message);

  await db.householdMembers.bulkPut(((data ?? []) as HouseholdMemberRow[]).map(memberFromRow));
}

async function saveHouseholdsLocally(households: HouseholdSummary[]): Promise<void> {
  await db.households.bulkPut(
    households.map((household) => ({
      id: household.id,
      name: household.name,
      ownerId: household.ownerId,
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
      syncStatus: "synced"
    }))
  );
}

async function upsertProfile(session: Session): Promise<void> {
  const email = session.user.email;
  if (!email) return;

  await getSupabaseClient().from("profiles").upsert({
    id: session.user.id,
    email,
    updated_at: nowIso()
  });
}

function memberFromRow(row: HouseholdMemberRow): HouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    email: row.email ?? undefined,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: "synced"
  };
}
