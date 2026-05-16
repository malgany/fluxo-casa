import { applyRemoteChanges, getClientId, getDirtyChanges, markChangesSynced } from "./db";
import { getStoredAccessPin } from "./access";
import type { SyncChanges, SyncRequest, SyncResponse } from "../domain/types";

export interface SyncConfig {
  apiUrl: string;
  token: string;
  lastSyncAt?: string;
}

export interface SyncResult {
  ok: boolean;
  message: string;
}

interface SyncConflictResponse {
  serverTime?: string;
  message?: string;
  changes?: SyncChanges;
}

type SyncAttemptResult =
  | { kind: "success"; message: string }
  | { kind: "conflict"; config: SyncConfig }
  | { kind: "error"; message: string };

const configKey = "fluxo-casa-sync-config";
const legacyDefaultToken = "fluxo-casa-local";

export function getSyncConfig(): SyncConfig {
  const fallback = { apiUrl: defaultApiUrl(), token: getStoredAccessPin() };
  const raw = localStorage.getItem(configKey);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    const parsedToken = parsed.token?.trim();
    return {
      apiUrl: parsed.apiUrl?.trim() || fallback.apiUrl,
      token: fallback.token || (!parsedToken || parsedToken === legacyDefaultToken ? "" : parsedToken),
      lastSyncAt: parsed.lastSyncAt
    };
  } catch {
    return fallback;
  }
}

function defaultApiUrl(): string {
  return "";
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(configKey, JSON.stringify(config));
}

export async function setupServer(config: SyncConfig): Promise<SyncResult> {
  const response = await fetch(`${config.apiUrl}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: config.token })
  });

  if (!response.ok && response.status !== 409) {
    const error = await response.json().catch(() => ({ message: "Não foi possível configurar o servidor." }));
    return { ok: false, message: error.message };
  }

  saveSyncConfig(config);
  return { ok: true, message: response.status === 409 ? "Servidor já configurado." : "Servidor configurado." };
}

export async function syncNow(): Promise<SyncResult> {
  let config = getSyncConfig();
  if (!config.token) {
    return { ok: false, message: "Token de sincronização não configurado." };
  }

  const setupResult = await ensureServerReady(config);
  if (!setupResult.ok) return setupResult;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await syncOnce(config);
    if (result.kind === "success") return { ok: true, message: result.message };
    if (result.kind === "error") return { ok: false, message: result.message };

    config = result.config;
  }

  return { ok: false, message: "Sincronização ocupada. Tente novamente em instantes." };
}

async function syncOnce(config: SyncConfig): Promise<SyncAttemptResult> {
  const changes = await getDirtyChanges();
  const request: SyncRequest = {
    clientId: getClientId(),
    since: config.lastSyncAt,
    changes
  };

  const response = await fetch(`${config.apiUrl}/api/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify(request)
  });

  if (response.status === 409) {
    const conflict = (await response.json().catch(() => ({}))) as SyncConflictResponse;
    if (conflict.changes) await applyRemoteChanges(conflict.changes);
    const nextConfig = conflict.serverTime ? { ...config, lastSyncAt: conflict.serverTime } : config;
    saveSyncConfig(nextConfig);

    return { kind: "conflict", config: nextConfig };
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Sincronização falhou." }));
    return { kind: "error", message: error.message };
  }

  const payload = (await response.json()) as SyncResponse;
  await applyRemoteChanges(payload.changes);
  await markChangesSynced(changes);
  saveSyncConfig({ ...config, lastSyncAt: payload.serverTime });
  return { kind: "success", message: "Sincronizado." };
}

async function ensureServerReady(config: SyncConfig): Promise<SyncResult> {
  try {
    const statusResponse = await fetch(`${config.apiUrl}/api/status`);
    if (!statusResponse.ok) return { ok: false, message: "Servidor local indisponível." };

    const status = (await statusResponse.json()) as { configured?: boolean };
    if (status.configured) return { ok: true, message: "Servidor pronto." };

    return setupServer(config);
  } catch {
    return { ok: false, message: "Servidor local indisponível." };
  }
}
