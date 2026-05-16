const ACCESS_PIN_STORAGE_KEY = "fluxo-casa-access-pin";
const ACCESS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PIN_PATTERN = /^[a-zA-Z0-9]+$/;

interface StoredAccessPin {
  pin: string;
  expiresAt: number;
}

export interface AccessResult {
  ok: boolean;
  message: string;
}

export function getStoredAccessPin(): string {
  const raw = localStorage.getItem(ACCESS_PIN_STORAGE_KEY);
  if (!raw) return "";

  try {
    const stored = JSON.parse(raw) as Partial<StoredAccessPin>;
    if (!stored.pin || !stored.expiresAt || stored.expiresAt <= Date.now()) {
      clearAccessPin();
      return "";
    }

    return stored.pin;
  } catch {
    clearAccessPin();
    return "";
  }
}

export function saveAccessPin(pin: string): void {
  localStorage.setItem(
    ACCESS_PIN_STORAGE_KEY,
    JSON.stringify({
      pin,
      expiresAt: Date.now() + ACCESS_SESSION_TTL_MS
    } satisfies StoredAccessPin)
  );
}

export function clearAccessPin(): void {
  localStorage.removeItem(ACCESS_PIN_STORAGE_KEY);
}

export async function verifyAccessPin(pin: string, save = true): Promise<AccessResult> {
  const cleanPin = pin.trim();
  if (!cleanPin) return { ok: false, message: "Informe o PIN." };
  if (!PIN_PATTERN.test(cleanPin)) return { ok: false, message: "Use apenas letras e numeros." };

  const response = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: cleanPin })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "PIN invalido." }));
    return { ok: false, message: error.message || "PIN invalido." };
  }

  if (save) saveAccessPin(cleanPin);
  return { ok: true, message: "Acesso liberado." };
}
