import { applyRemoteChanges, getClientId, getDirtyChanges, markChangesSynced } from "./db";
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

const configKey = "fluxo-casa-sync-config";
const defaultToken = import.meta.env.VITE_SYNC_TOKEN || "fluxo-casa-local";

export function getSyncConfig(): SyncConfig {
  const fallback = { apiUrl: defaultApiUrl(), token: defaultToken };
  const raw = localStorage.getItem(configKey);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      apiUrl: parsed.apiUrl?.trim() || fallback.apiUrl,
      token: parsed.token?.trim() || fallback.token,
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
  const config = getSyncConfig();
  if (!config.apiUrl || !config.token) {
    return { ok: false, message: "Configure o servidor local e o token." };
  }

  const setupResult = await ensureServerReady(config);
  if (!setupResult.ok) return setupResult;

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
    if (conflict.serverTime) saveSyncConfig({ ...config, lastSyncAt: conflict.serverTime });

    return {
      ok: false,
      message: conflict.message || "Sincronização adiada. Tente novamente em instantes."
    };
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Sincronização falhou." }));
    return { ok: false, message: error.message };
  }

  const payload = (await response.json()) as SyncResponse;
  await applyRemoteChanges(payload.changes);
  await markChangesSynced(changes);
  saveSyncConfig({ ...config, lastSyncAt: payload.serverTime });
  return { ok: true, message: "Sincronizado." };
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
