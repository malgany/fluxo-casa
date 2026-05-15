import { get, list, put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { collectionNames, type AnyEntity, type CollectionName, type SyncChanges, type SyncRequest } from "../src/domain/types.js";

interface SyncLog {
  id: string;
  createdAt: string;
  clientId: string;
  changes: SyncChanges;
}

const defaultToken = "fluxo-casa-local";
const defaultHouseholdId = "casa";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Método não permitido." });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    response.status(500).json({ message: "BLOB_READ_WRITE_TOKEN não configurado na Vercel." });
    return;
  }

  if (!isAuthorized(request)) {
    response.status(401).json({ message: "Token inválido." });
    return;
  }

  const payload = request.body as SyncRequest | undefined;
  if (!payload?.clientId || !payload.changes) {
    response.status(400).json({ message: "Payload de sincronização inválido." });
    return;
  }

  const householdId = safeSegment(process.env.SYNC_HOUSEHOLD_ID || defaultHouseholdId);
  const prefix = `households/${householdId}/sync-log/`;
  const now = new Date().toISOString();

  if (hasChanges(payload.changes)) {
    const log: SyncLog = {
      id: randomId(),
      createdAt: now,
      clientId: payload.clientId,
      changes: stripLocalSyncStatus(payload.changes)
    };

    await put(`${prefix}${now}-${safeSegment(payload.clientId)}-${log.id}.json`, JSON.stringify(log), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60
    });
  }

  const logs = await readLogs(prefix, payload.since);

  response.status(200).json({
    serverTime: new Date().toISOString(),
    changes: mergeLogs(logs)
  });
}

function isAuthorized(request: VercelRequest): boolean {
  const expected = process.env.SYNC_TOKEN || defaultToken;
  const header = request.headers.authorization;
  const actual = Array.isArray(header) ? header[0] : header;
  return actual?.replace(/^Bearer\s+/i, "").trim() === expected;
}

async function readLogs(prefix: string, since?: string): Promise<SyncLog[]> {
  const logs: SyncLog[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    cursor = page.cursor;

    for (const blob of page.blobs) {
      if (since && blob.pathname <= `${prefix}${since}`) continue;

      const result = await get(blob.pathname, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) continue;

      const text = await new Response(result.stream).text();
      const log = JSON.parse(text) as SyncLog;
      if (!since || log.createdAt > since) logs.push(log);
    }
  } while (cursor);

  return logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeLogs(logs: SyncLog[]): SyncChanges {
  const records = new Map<CollectionName, Map<string, AnyEntity>>();

  for (const collection of collectionNames) {
    records.set(collection, new Map());
  }

  for (const log of logs) {
    for (const collection of collectionNames) {
      const map = records.get(collection);
      if (!map) continue;

      for (const record of log.changes[collection] ?? []) {
        const existing = map.get(record.id);
        if (!existing || record.updatedAt > existing.updatedAt) {
          map.set(record.id, record);
        }
      }
    }
  }

  const changes: SyncChanges = {};
  for (const collection of collectionNames) {
    const rows = Array.from(records.get(collection)?.values() ?? []);
    if (rows.length > 0) changes[collection] = rows as never;
  }

  return changes;
}

function stripLocalSyncStatus(changes: SyncChanges): SyncChanges {
  const clean: SyncChanges = {};

  for (const collection of collectionNames) {
    const rows = changes[collection] ?? [];
    if (rows.length === 0) continue;

    clean[collection] = rows.map((row) => {
      const record = { ...row };
      delete record.syncStatus;
      return record;
    }) as never;
  }

  return clean;
}

function hasChanges(changes: SyncChanges): boolean {
  return collectionNames.some((collection) => (changes[collection]?.length ?? 0) > 0);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "default";
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
