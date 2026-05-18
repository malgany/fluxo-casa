import cors from "@fastify/cors";
import Fastify from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSupabaseAdminClient } from "../api/supabaseAdmin.js";
import type { HouseholdRole } from "../src/domain/types.js";

loadLocalEnvFile();

const port = Number(process.env.FLUXO_API_PORT ?? 3333);
const host = process.env.FLUXO_API_HOST ?? "::";
const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  configured: isSupabaseAdminConfigured(),
  serverTime: new Date().toISOString()
}));

app.get("/api/status", async () => ({
  configured: isSupabaseAdminConfigured(),
  serverTime: new Date().toISOString()
}));

app.post<{ Body: { householdId?: string; email?: string; role?: HouseholdRole } }>("/api/invite", async (request, reply) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply.code(401).send({ message: "Sessão expirada. Entre novamente." });

  const householdId = request.body?.householdId?.trim();
  const email = request.body?.email?.trim().toLowerCase();
  const role = request.body?.role ?? "member";
  if (!householdId || !email || !["admin", "member"].includes(role)) {
    return reply.code(400).send({ message: "Convite inválido." });
  }

  const supabase = getSupabaseAdminClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);
  if (userError || !user?.email) return reply.code(401).send({ message: "Sessão expirada. Entre novamente." });

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError || !member || !["owner", "admin"].includes(member.role)) {
    return reply.code(403).send({ message: "Você não pode convidar membros para esta casa." });
  }

  const { error: inviteError } = await supabase.from("household_invitations").upsert(
    {
      household_id: householdId,
      email,
      role,
      status: "pending",
      invited_by: user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "household_id,email" }
  );
  if (inviteError) return reply.code(500).send({ message: inviteError.message });

  const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: process.env.VITE_APP_URL || request.headers.origin
  });
  if (emailError && !/already|registered|exists/i.test(emailError.message)) {
    return reply.code(500).send({ message: emailError.message });
  }

  return { ok: true };
});

await app.listen({ host, port });

function loadLocalEnvFile(): void {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;

      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function isSupabaseAdminConfigured(): boolean {
  return Boolean((process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
