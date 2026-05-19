import { getSupabaseAdminClient } from "./supabaseAdmin.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import type { HouseholdRole } from "../src/domain/types.js";

const roles: HouseholdRole[] = ["admin", "member"];

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Método não permitido." });
    return;
  }

  const token = getBearerToken(request.headers.authorization);
  if (!token) {
    response.status(401).json({ message: "Sessão expirada. Entre novamente." });
    return;
  }

  const payload = request.body as { householdId?: string; email?: string; role?: HouseholdRole } | undefined;
  const householdId = payload?.householdId?.trim();
  const email = payload?.email?.trim().toLowerCase();
  const role = payload?.role ?? "member";

  if (!householdId || !email || !roles.includes(role)) {
    response.status(400).json({ message: "Convite inválido." });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);
  if (userError || !user?.email) {
    response.status(401).json({ message: "Sessão expirada. Entre novamente." });
    return;
  }

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError || !member || !["owner", "admin"].includes(member.role)) {
    response.status(403).json({ message: "Você não pode convidar membros para esta casa." });
    return;
  }

  const now = new Date().toISOString();
  const { data: existingMember, error: existingMemberError } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingMemberError) {
    response.status(500).json({ message: existingMemberError.message });
    return;
  }

  if (existingMember) {
    const { error: existingInvitationError } = await supabase
      .from("household_invitations")
      .update({ status: "accepted", accepted_at: now, updated_at: now })
      .eq("household_id", householdId)
      .eq("email", email)
      .eq("status", "pending")
      .is("deleted_at", null);

    if (existingInvitationError) {
      response.status(500).json({ message: existingInvitationError.message });
      return;
    }

    response.status(200).json({ ok: true, emailSent: false, alreadyRegistered: true, alreadyMember: true });
    return;
  }

  const { error: removedMemberError } = await supabase
    .from("household_members")
    .update({ role, updated_at: now })
    .eq("household_id", householdId)
    .eq("email", email)
    .neq("role", "owner")
    .not("deleted_at", "is", null);

  if (removedMemberError) {
    response.status(500).json({ message: removedMemberError.message });
    return;
  }

  const { error: inviteError } = await supabase.from("household_invitations").upsert(
    {
      household_id: householdId,
      email,
      role,
      status: "pending",
      invited_by: user.id,
      accepted_at: null,
      updated_at: now
    },
    { onConflict: "household_id,email" }
  );
  if (inviteError) {
    response.status(500).json({ message: inviteError.message });
    return;
  }

  const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  const appUrl = process.env.VITE_APP_URL || origin || "";
  const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: appUrl || undefined
  });
  const alreadyRegistered = emailError ? isAlreadyRegisteredError(emailError.message) : false;

  if (emailError && !alreadyRegistered) {
    response.status(500).json({ message: emailError.message });
    return;
  }

  response.status(200).json({ ok: true, emailSent: !alreadyRegistered, alreadyRegistered, alreadyMember: false });
}

function getBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function isAlreadyRegisteredError(message: string): boolean {
  return /already|registered|exists/i.test(message);
}
