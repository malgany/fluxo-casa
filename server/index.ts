import cors from "@fastify/cors";
import Fastify from "fastify";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collectionNames, type AnyEntity, type CollectionName, type SyncChanges, type SyncRequest } from "../src/domain/types.js";

const port = Number(process.env.FLUXO_API_PORT ?? 3333);
const host = process.env.FLUXO_API_HOST ?? "::";
const dbPath = process.env.FLUXO_DB_PATH ?? join(process.cwd(), "data", "fluxo-casa.sqlite");

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS records (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (collection, id)
  );

  CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);
`);

const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  configured: Boolean(getSetting("tokenHash")),
  dbPath,
  serverTime: new Date().toISOString()
}));

app.get("/api/status", async () => ({
  configured: Boolean(getSetting("tokenHash")),
  serverTime: new Date().toISOString()
}));

app.post<{ Body: { token?: string } }>("/api/setup", async (request, reply) => {
  if (getSetting("tokenHash")) {
    return reply.code(409).send({ message: "Servidor já configurado." });
  }

  const token = request.body?.token?.trim();
  if (!token || token.length < 4) {
    return reply.code(400).send({ message: "Use um token/PIN com pelo menos 4 caracteres." });
  }

  setSetting("tokenHash", hashToken(token));
  return { configured: true, serverTime: new Date().toISOString() };
});

app.post<{ Body: SyncRequest }>("/api/sync", async (request, reply) => {
  const authError = checkAuth(request.headers.authorization);
  if (authError) return reply.code(authError.status).send({ message: authError.message });

  const body = request.body;
  if (!body?.clientId || !body.changes) {
    return reply.code(400).send({ message: "Payload inválido." });
  }

  runInTransaction(() => {
    for (const collection of collectionNames) {
      for (const item of body.changes[collection] ?? []) {
        upsertRecord(collection, item);
      }
    }
  });

  return {
    serverTime: new Date().toISOString(),
    changes: readChanges(body.since)
  };
});

app.get("/api/export", async (request, reply) => {
  const authError = checkAuth(request.headers.authorization);
  if (authError) return reply.code(authError.status).send({ message: authError.message });

  return {
    exportedAt: new Date().toISOString(),
    changes: readChanges()
  };
});

await app.listen({ host, port });

function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function checkAuth(header: string | undefined): { status: number; message: string } | undefined {
  const tokenHash = getSetting("tokenHash");
  if (!tokenHash) return { status: 428, message: "Servidor ainda não configurado." };

  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token || hashToken(token) !== tokenHash) return { status: 401, message: "Token inválido." };

  return undefined;
}

function stripLocalStatus<T extends AnyEntity>(record: T): T {
  const clean = { ...record };
  delete clean.syncStatus;
  return clean;
}

function upsertRecord(collection: CollectionName, record: AnyEntity): void {
  const clean = stripLocalStatus(record);
  const existing = db
    .prepare("SELECT updated_at FROM records WHERE collection = ? AND id = ?")
    .get(collection, clean.id) as { updated_at: string } | undefined;

  if (existing && existing.updated_at > clean.updatedAt) return;

  db.prepare(
    `INSERT INTO records (collection, id, payload, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(collection, id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`
  ).run(collection, clean.id, JSON.stringify(clean), clean.updatedAt, clean.deletedAt ?? null);
}

function readChanges(since?: string): SyncChanges {
  const changes: SyncChanges = {};

  for (const collection of collectionNames) {
    const rows = (since
      ? db
          .prepare(
            `SELECT payload FROM records
             WHERE collection = ? AND (updated_at > ? OR deleted_at > ?)
             ORDER BY updated_at ASC`
          )
          .all(collection, since, since)
      : db.prepare("SELECT payload FROM records WHERE collection = ? ORDER BY updated_at ASC").all(collection)) as {
      payload: string;
    }[];

    if (rows.length > 0) changes[collection] = rows.map((row) => JSON.parse(row.payload));
  }

  return changes;
}

function runInTransaction(task: () => void): void {
  db.exec("BEGIN");
  try {
    task();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
