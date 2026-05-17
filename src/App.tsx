import { useLiveQuery } from "dexie-react-hooks";
import { type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { db, createBase, ensureSettings, exportBackup, importBackup, saveRecord, softDelete } from "./lib/db";
import { syncNow } from "./lib/sync";
import { clearAccessPin, getStoredAccessPin, verifyAccessPin } from "./lib/access";
import {
  addMonths,
  dayLabel,
  firstDayOfMonth,
  formatMoney,
  lastDayOfMonth,
  monthKey,
  monthLabel,
  monthName,
  previousDay,
  signedAmount,
  todayIso,
  yearLabel
} from "./domain/dates";
import { active, calculateMonth, defaultSettings, type MonthSnapshot, type TimelineItem } from "./domain/finance";
import { findIconById, searchIconOptions, type ServiceIcon } from "./domain/iconRegistry";
import { buildInstallmentPlan, buildInstallmentPreview, parseInstallmentCount } from "./domain/installments";
import type { AppSettings, Entry, FlowKind, Recurrence } from "./domain/types";

type View = "home" | "timeline";
type Sheet = "entry" | "balance" | null;
type SyncIndicatorState = "idle" | "syncing" | "synced" | "error";
type ThemeMode = "light" | "dark";
type MaterialIconName = "wallet" | "sync" | "update" | "export" | "import" | "add";
type UiIconName = "home" | "list" | "more" | "close" | "delete" | "edit" | "moon" | "sun" | "lock";
type AccessState = "checking" | "locked" | "unlocked";
type MovementTarget = Pick<TimelineItem, "source" | "recordId" | "date" | "title">;
type EntrySheetRecord =
  | { source: "entry"; record: Entry }
  | { source: "recurrence"; record: Recurrence; occurrenceDate: string };
type RecurrenceEditScope = "this" | "future" | "all";
type EntryMode = "single" | "recurring" | "installment";
type AppData = {
  entries: Entry[];
  recurrences: Recurrence[];
  settings: AppSettings;
};
const APP_UPDATE_RELOAD_DELAY_MS = 700;
const THEME_STORAGE_KEY = "fluxo-casa-theme";
const SWIPE_ACTION_WIDTH = 108;
const SWIPE_TRIGGER_DISTANCE = 72;
const MATERIAL_ICON_SRC: Record<MaterialIconName, string> = {
  wallet: "/material-symbols/account_balance_wallet.svg",
  sync: "/material-symbols/sync.svg",
  update: "/material-symbols/update.svg",
  export: "/material-symbols/file_download.svg",
  import: "/material-symbols/file_upload.svg",
  add: "/material-symbols/add.svg"
};
const UI_ICON_PATHS: Record<UiIconName, string[]> = {
  home: ["M3.5 10.5 12 3l8.5 7.5", "M5.5 10v10h13V10", "M9.5 20v-6h5v6"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  more: ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  delete: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V5h6v2"],
  edit: ["M4 20h4L18.5 9.5l-4-4L4 16v4", "M13.5 6.5l4 4"],
  lock: ["M7 10V7a5 5 0 0 1 10 0v3", "M6 10h12v10H6z", "M12 14v2"],
  moon: ["M21 14.8A8.5 8.5 0 0 1 9.2 3 7 7 0 1 0 21 14.8Z"],
  sun: ["M12 4V2", "M12 22v-2", "m4.93 4.93-1.42-1.42", "m20.49 20.49-1.42-1.42", "M4 12H2", "M22 12h-2", "m4.93 19.07-1.42 1.42", "m20.49 3.51-1.42 1.42", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"]
};

function App() {
  const [accessState, setAccessState] = useState<AccessState>(() => (getStoredAccessPin() ? "unlocked" : "locked"));

  function handleLock() {
    clearAccessPin();
    setAccessState("locked");
  }

  if (accessState === "checking") return <AccessGate checking onUnlocked={() => setAccessState("unlocked")} />;
  if (accessState === "locked") return <AccessGate onUnlocked={() => setAccessState("unlocked")} />;

  return <FinanceApp onLock={handleLock} />;
}

function FinanceApp({ onLock }: { onLock: () => void }) {
  const [view, setView] = useState<View>("home");
  const currentMonth = monthKey();
  const [timelineMonth, setTimelineMonth] = useState(currentMonth);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingMovement, setEditingMovement] = useState<MovementTarget | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<MovementTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readInitialTheme());
  const [message, setMessage] = useState("");
  const [syncState, setSyncState] = useState<SyncIndicatorState>("idle");
  const [syncHint, setSyncHint] = useState("Ainda não sincronizado");
  const [syncHintVisible, setSyncHintVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    void ensureSettings();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!import.meta.env.DEV || !("serviceWorker" in navigator)) return undefined;

    async function clearDevelopmentCaches() {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    }

    void clearDevelopmentCaches();
  }, []);

  useEffect(() => {
    void runSync(false);

    const interval = window.setInterval(() => void runSync(false), 15 * 60 * 1000);

    function syncWhenOnline() {
      void runSync(false);
    }

    function syncWhenVisible() {
      if (document.visibilityState === "visible") void runSync(false);
    }

    window.addEventListener("online", syncWhenOnline);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", syncWhenOnline);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  const entries = useLiveQuery(() => db.entries.toArray(), [], []);
  const recurrences = useLiveQuery(() => db.recurrences.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get("settings_app"), [], undefined);

  const data = useMemo(
    () => ({
      entries: entries.filter(active),
      recurrences: recurrences.filter(active),
      settings: settings ?? defaultSettings()
    }),
    [entries, recurrences, settings]
  );

  const homeSnapshot = useMemo(() => calculateMonth(data, currentMonth), [data, currentMonth]);
  const editingSheetRecord = useMemo<EntrySheetRecord | undefined>(() => {
    if (!editingMovement) return undefined;

    if (editingMovement.source === "entry") {
      const record = data.entries.find((entry) => entry.id === editingMovement.recordId);
      return record ? { source: "entry", record } : undefined;
    }

    const record = data.recurrences.find((recurrence) => recurrence.id === editingMovement.recordId);
    return record ? { source: "recurrence", record, occurrenceDate: editingMovement.date } : undefined;
  }, [data.entries, data.recurrences, editingMovement]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(""), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!syncHintVisible) return undefined;

    const timer = window.setTimeout(() => setSyncHintVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [syncHintVisible, syncHint]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();

    function closeMenu(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuOpen]);

  async function handleSync() {
    await runSync(true);
    setMenuOpen(false);
  }

  async function handleCheckUpdates() {
    setMenuOpen(false);
    setMessage("Verificando atualizações...");

    const hasUpdate = await checkForAppUpdate();

    if (!hasUpdate) {
      setMessage("Aplicativo atualizado.");
      return;
    }

    setMessage("Atualizando...");
    window.setTimeout(() => window.location.reload(), APP_UPDATE_RELOAD_DELAY_MS);
  }

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
    setMenuOpen(false);
  }

  function revealSyncHint(text?: string) {
    if (text) setSyncHint(text);
    setSyncHintVisible(true);
  }

  async function runSync(showHint: boolean) {
    if (syncingRef.current) {
      if (showHint) revealSyncHint("Atualizando...");
      return;
    }
    syncingRef.current = true;
    setSyncState("syncing");
    setSyncHint("Atualizando...");
    if (showHint) setSyncHintVisible(true);

    try {
      const result = await syncNow();
      setSyncState(result.ok ? "synced" : "error");
      setSyncHint(result.ok ? "Sincronizado" : result.message);
      if (showHint || !result.ok) setSyncHintVisible(true);
    } finally {
      syncingRef.current = false;
    }
  }

  async function handleExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fluxo-casa-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  async function handleImport(file?: File) {
    if (!file) return;
    await importBackup(JSON.parse(await file.text()));
    setMessage("Backup importado.");
    setMenuOpen(false);
  }

  function handleNewEntry() {
    setEditingMovement(null);
    setSheet("entry");
  }

  function handleEditMovement(item: TimelineItem) {
    const exists =
      item.source === "entry"
        ? data.entries.some((entry) => entry.id === item.recordId)
        : data.recurrences.some((recurrence) => recurrence.id === item.recordId);

    if (!exists) {
      setMessage("Movimento não encontrado.");
      return;
    }

    setEditingMovement({
      source: item.source,
      recordId: item.recordId,
      date: item.date,
      title: item.title
    });
    setSheet("entry");
  }

  function handleDeleteMovement(item: TimelineItem) {
    setDeletingMovement({
      source: item.source,
      recordId: item.recordId,
      date: item.date,
      title: item.title
    });
  }

  async function confirmDeleteMovement() {
    if (!deletingMovement) return;

    await softDelete(deletingMovement.source === "entry" ? "entries" : "recurrences", deletingMovement.recordId);
    setMessage(deletingMovement.source === "recurrence" ? "Recorrência excluída." : "Lançamento excluído.");
    setDeletingMovement(null);
    void runSync(false);
  }

  function handleCloseEntrySheet() {
    setSheet(null);
    setEditingMovement(null);
  }

  function handleEntrySaved() {
    if (!editingMovement) {
      setTimelineMonth(monthKey());
      setView("timeline");
    }
    setEditingMovement(null);
    void runSync(false);
  }

  function handleOverflowMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const lastIndex = items.length - 1;
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown") nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
    else if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else return;

    event.preventDefault();
    items[nextIndex]?.focus();
  }

  return (
    <div className="phone-shell">
      <div className="orientation-guard" aria-hidden="true">
        <div>
          <strong>Use na vertical</strong>
          <span>Gire o celular para continuar.</span>
        </div>
      </div>

      <header className="top-app-bar">
        <div className="top-title">
          <h1>{view === "home" ? "Dashboard" : "Lançamentos"}</h1>
          <span>{view === "timeline" ? yearLabel(timelineMonth) : monthLabel(currentMonth)}</span>
        </div>
        <div className="app-actions">
          <SyncIndicator state={syncState} hint={syncHint} visible={syncHintVisible} onPress={() => revealSyncHint()} />
          <button
            ref={menuButtonRef}
            className="icon-button"
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? "main-overflow-menu" : undefined}
          >
            <UiIcon name="more" />
          </button>
        </div>

        {menuOpen && (
          <div id="main-overflow-menu" ref={menuRef} className="overflow-menu" role="menu" aria-label="Menu de ações" onKeyDown={handleOverflowMenuKeyDown}>
            <button role="menuitem" type="button" onClick={() => { setSheet("balance"); setMenuOpen(false); }}>
              <MaterialIcon name="wallet" className="menu-icon" />
              <span>Ajustar saldo inicial</span>
            </button>
            <button role="menuitem" type="button" onClick={handleSync}>
              <MaterialIcon name="sync" className="menu-icon" />
              <span>Sincronizar</span>
            </button>
            <button role="menuitem" type="button" onClick={handleCheckUpdates}>
              <MaterialIcon name="update" className="menu-icon" />
              <span>Verificar atualizações</span>
            </button>
            <button role="menuitem" type="button" onClick={handleToggleTheme}>
              <UiIcon name={theme === "dark" ? "sun" : "moon"} />
              <span>{theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}</span>
            </button>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onLock(); }}>
              <UiIcon name="lock" />
              <span>Bloquear app</span>
            </button>
            <div className="menu-divider" role="separator" />
            <button role="menuitem" type="button" onClick={handleExport}>
              <MaterialIcon name="export" className="menu-icon" />
              <span>Exportar backup</span>
            </button>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}>
              <MaterialIcon name="import" className="menu-icon" />
              <span>Importar backup</span>
            </button>
          </div>
        )}
      </header>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="application/json"
        onChange={(event) => handleImport(event.target.files?.[0])}
      />

      {message && <div className="snackbar">{message}</div>}

      <main className={view === "timeline" ? "content timeline-content" : "content"}>
        {view === "home" ? (
          <HomeView snapshot={homeSnapshot} />
        ) : (
          <TimelineView
            data={data}
            month={timelineMonth}
            setMonth={setTimelineMonth}
            onChanged={() => void runSync(false)}
            onEditMovement={handleEditMovement}
            onDeleteMovement={(item) => void handleDeleteMovement(item)}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navegação inferior">
        <button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}>
          <span>
            <UiIcon name="home" />
          </span>
          Dashboard
        </button>
        <button className="nav-action" type="button" onClick={handleNewEntry} aria-label="Novo lançamento">
          Novo
        </button>
        <button
          className={view === "timeline" ? "active" : ""}
          type="button"
          onClick={() => {
            setTimelineMonth(currentMonth);
            setView("timeline");
          }}
        >
          <span>
            <UiIcon name="list" />
          </span>
          Lançamentos
        </button>
      </nav>

      {sheet === "entry" && (
        <EntrySheet
          movement={editingSheetRecord}
          settings={data.settings}
          onClose={handleCloseEntrySheet}
          onSaved={handleEntrySaved}
        />
      )}
      {sheet === "balance" && <BalanceSheet settings={data.settings} onClose={() => setSheet(null)} onSaved={() => void runSync(false)} />}
      {deletingMovement && (
        <DeleteMovementSheet
          item={deletingMovement}
          onCancel={() => setDeletingMovement(null)}
          onConfirm={() => void confirmDeleteMovement()}
        />
      )}
    </div>
  );
}

function AccessGate({ checking = false, onUnlocked }: { checking?: boolean; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(checking ? "Verificando..." : "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setStatus("");

    try {
      const result = await verifyAccessPin(pin);
      if (!result.ok) {
        setStatus(result.message);
        return;
      }

      onUnlocked();
    } catch {
      setStatus("Nao foi possivel validar o PIN.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="access-screen">
      <form className="access-panel" onSubmit={handleSubmit}>
        <div className="access-mark">
          <UiIcon name="lock" />
        </div>
        <h1>Fluxo Casa</h1>
        <label>
          PIN de acesso
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            type="password"
            inputMode="text"
            pattern="[A-Za-z0-9]+"
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </label>
        <button className="filled-button" type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
        {status && <p role="status">{status}</p>}
      </form>
    </main>
  );
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "light";
}

function SyncIndicator({
  state,
  hint,
  visible,
  onPress
}: {
  state: SyncIndicatorState;
  hint: string;
  visible: boolean;
  onPress: () => void;
}) {
  const label = state === "syncing" ? "Atualizando..." : hint;

  return (
    <button className={`sync-indicator ${state}`} type="button" onClick={onPress} aria-label={label} title={label}>
      <SyncIcon state={state} />
      <span className={visible ? "sync-tooltip visible" : "sync-tooltip"} role="status">
        {label}
      </span>
    </button>
  );
}

async function checkForAppUpdate(): Promise<boolean> {
  const currentAssets = collectDocumentAssets(document);
  const [remoteAssets, serviceWorkerUpdated] = await Promise.all([
    fetchLatestDocumentAssets(),
    updateServiceWorker()
  ]);

  if (serviceWorkerUpdated) return true;
  if (!remoteAssets.length) return false;

  return currentAssets.join("|") !== remoteAssets.join("|");
}

function collectDocumentAssets(source: Document): string[] {
  return Array.from(source.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel='stylesheet'][href]"))
    .map((element) => {
      const asset = element instanceof HTMLScriptElement ? element.src : element.href;
      return normalizeLocalAssetUrl(asset);
    })
    .filter(Boolean)
    .sort();
}

function normalizeLocalAssetUrl(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return "";
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

async function fetchLatestDocumentAssets(): Promise<string[]> {
  try {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("app-update-check", String(Date.now()));

    const response = await fetch(url, {
      cache: "reload",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) return [];

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return collectDocumentAssets(parsed);
  } catch {
    return [];
  }
}

async function updateServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
    let foundUpdate = false;

    const updateFound = new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 1800);

      registration.addEventListener(
        "updatefound",
        () => {
          foundUpdate = true;
          const worker = registration.installing;

          if (!worker) {
            window.clearTimeout(timeout);
            resolve(true);
            return;
          }

          worker.addEventListener("statechange", () => {
            if (worker.state !== "installed" && worker.state !== "activated") return;
            window.clearTimeout(timeout);
            resolve(true);
          });
        },
        { once: true }
      );
    });

    await registration.update();
    return foundUpdate || (await updateFound);
  } catch {
    return false;
  }
}

function SyncIcon({ state }: { state: SyncIndicatorState }) {
  if (state === "syncing") {
    return (
      <svg className="sync-svg spinner" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M20 12a8 8 0 0 0-8-8" />
      </svg>
    );
  }

  if (state === "error") {
    return (
      <svg className="sync-svg" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v6" />
        <path d="M12 16.5v.5" />
      </svg>
    );
  }

  if (state === "synced") {
    return (
      <svg className="sync-svg" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12.2 2.2 2.2 4.8-5" />
      </svg>
    );
  }

  return (
    <svg className="sync-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function MaterialIcon({ name, className }: { name: MaterialIconName; className: string }) {
  return <span className={className} style={{ "--material-icon-src": `url("${MATERIAL_ICON_SRC[name]}")` } as CSSProperties} aria-hidden="true" />;
}

function UiIcon({ name }: { name: UiIconName }) {
  if (name === "home") {
    return (
      <svg className="ui-icon filled-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 10.8 12 3.7l8 7.1V20a1 1 0 0 1-1 1h-4.8v-6.2H9.8V21H5a1 1 0 0 1-1-1v-9.2Z" />
      </svg>
    );
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {UI_ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function HomeView({ snapshot }: { snapshot: MonthSnapshot }) {
  return (
    <section className="stack">
      <article className="hero-balance" aria-label="Saldo do mês">
        <span>Saldo</span>
        <strong>{formatMoney(snapshot.currentBalance)}</strong>
        <small>Saldo final previsto: {formatMoney(snapshot.projectedBalance)}</small>
      </article>

      <div className="card-grid">
        <MetricCard label="Recebido no mês" value={snapshot.receivedInMonth} tone="in" />
        <MetricCard label="Pago no mês" value={snapshot.spentInMonth} tone="out" />
        <MetricCard label="A receber" value={snapshot.futureIncome} tone="info" />
        <MetricCard label="A pagar" value={snapshot.futureExpenses} tone="warning" />
      </div>

      <ProjectionChart snapshot={snapshot} />
    </section>
  );
}

function ProjectionChart({ snapshot }: { snapshot: MonthSnapshot }) {
  const chart = useMemo(() => buildProjectionChart(snapshot), [snapshot]);

  return (
    <section className="projection-chart" aria-label="Projeção do mês">
      <div className="projection-chart-header">
        <div>
          <span>Projeção do mês</span>
          <strong>{formatMoney(snapshot.projectedBalance)}</strong>
        </div>
        <small>{chart.hasMovements ? `${chart.movementCount} lançamentos` : "Sem lançamentos"}</small>
      </div>

      <svg className="projection-chart-svg" viewBox="0 0 320 112" role="img" aria-label={`Saldo previsto: ${formatMoney(snapshot.projectedBalance)}`}>
        <path className="projection-chart-grid" d="M16 26H304M16 60H304M16 94H304" />
        <path className="projection-chart-area" d={chart.areaPath} />
        <path className="projection-chart-line" d={chart.linePath} />
        {chart.todayPoint && (
          <g className="projection-chart-today" transform={`translate(${chart.todayPoint.x} ${chart.todayPoint.y})`}>
            <line y1={-64} y2={18} />
            <circle r="4.2" />
          </g>
        )}
      </svg>

      <div className="projection-chart-footer">
        <span>{formatMoney(chart.minValue)}</span>
        <span>{formatMoney(chart.maxValue)}</span>
      </div>
    </section>
  );
}

function buildProjectionChart(snapshot: MonthSnapshot) {
  const lastDay = Number(lastDayOfMonth(snapshot.month).slice(8, 10));
  const today = todayIso();
  const todayDay = monthKey(today) === snapshot.month ? Number(today.slice(8, 10)) : undefined;
  const dailyChanges = new Map<number, number>();

  for (const item of snapshot.items) {
    const day = Number(item.date.slice(8, 10));
    dailyChanges.set(day, (dailyChanges.get(day) ?? 0) + signedAmount(item.kind, item.amount));
  }

  let balance = snapshot.openingBalance;
  const values = Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    balance += dailyChanges.get(day) ?? 0;
    return {
      day,
      value: balance
    };
  });

  const rawMin = Math.min(snapshot.openingBalance, ...values.map((point) => point.value));
  const rawMax = Math.max(snapshot.openingBalance, ...values.map((point) => point.value));
  const range = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax), 1) * 0.18);
  const minValue = rawMin - range * 0.16;
  const maxValue = rawMax + range * 0.16;
  const chartWidth = 288;
  const chartHeight = 68;
  const left = 16;
  const top = 26;
  const bottom = top + chartHeight;
  const valueRange = maxValue - minValue || 1;
  const points = values.map((point) => {
    const x = left + ((point.day - 1) / Math.max(lastDay - 1, 1)) * chartWidth;
    const y = bottom - ((point.value - minValue) / valueRange) * chartHeight;
    return { ...point, x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`).join(" ");
  const areaPath = `${linePath} L${round(left + chartWidth)} ${bottom} L${left} ${bottom} Z`;
  const todayPoint = todayDay ? points[todayDay - 1] : undefined;

  return {
    areaPath,
    hasMovements: snapshot.items.length > 0,
    linePath,
    maxValue: rawMax,
    minValue: rawMin,
    movementCount: snapshot.items.length,
    todayPoint
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function amountToCurrencyDigits(amount: number): string {
  const cents = Math.round(amount * 100);
  return cents > 0 ? String(cents) : "";
}

function extractCurrencyDigits(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits && Number(digits) > 0 ? digits : "";
}

function formatCurrencyDigits(digits: string): string {
  if (!digits) return "";
  const amount = currencyDigitsToAmount(digits);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function currencyDigitsToAmount(digits: string): number {
  if (!digits) return 0;
  return Number((Number(digits) / 100).toFixed(2));
}

function TimelineView({
  data,
  month,
  setMonth,
  onChanged,
  onEditMovement,
  onDeleteMovement
}: {
  data: AppData;
  month: string;
  setMonth: (month: string) => void;
  onChanged: () => void;
  onEditMovement: (item: TimelineItem) => void;
  onDeleteMovement: (item: TimelineItem) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState(month);
  const [motion, setMotion] = useState<"prev" | "next" | null>(null);
  const [consolidated, setConsolidated] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const snapshots = useMemo(
    () => [-1, 0, 1].map((offset) => calculateMonth(data, addMonths(displayMonth, offset))),
    [data, displayMonth]
  );

  useEffect(() => {
    if (!motion && month !== displayMonth) setDisplayMonth(month);
  }, [displayMonth, month, motion]);

  function navigate(direction: "prev" | "next") {
    if (motion) return;

    const targetMonth = addMonths(displayMonth, direction === "next" ? 1 : -1);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayMonth(targetMonth);
      setMonth(targetMonth);
      return;
    }

    setMotion(direction);
  }

  function finishMotion() {
    if (!motion) return;
    const targetMonth = addMonths(displayMonth, motion === "next" ? 1 : -1);
    setMotion(null);
    setDisplayMonth(targetMonth);
    setMonth(targetMonth);
  }

  function onTouchEnd(clientX: number, clientY: number) {
    if (touchStart.current == null) return;
    const diffX = clientX - touchStart.current.x;
    const diffY = clientY - touchStart.current.y;
    if (Math.abs(diffX) > 56 && Math.abs(diffX) > Math.abs(diffY) * 1.35) {
      navigate(diffX < 0 ? "next" : "prev");
    }
    touchStart.current = null;
  }

  return (
    <section
      className="timeline-stack"
      onTouchStart={(event) => {
        if ((event.target as HTMLElement).closest(".swipe-row")) {
          touchStart.current = null;
          return;
        }

        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        onTouchEnd(touch?.clientX ?? 0, touch?.clientY ?? 0);
      }}
    >
      <div className="timeline-pages-clip">
        <div
          className={motion ? `timeline-pages sliding-${motion}` : "timeline-pages"}
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) finishMotion();
          }}
        >
          {snapshots.map((snapshot, index) => (
            <MonthPage
              key={snapshot.month}
              snapshot={snapshot}
              onPrevious={() => navigate("prev")}
              onNext={() => navigate("next")}
              onChanged={onChanged}
              onEditMovement={onEditMovement}
              onDeleteMovement={onDeleteMovement}
              disabled={Boolean(motion)}
              visible={index === 1}
              consolidated={consolidated}
              onConsolidatedChange={setConsolidated}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function MonthPage({
  snapshot,
  onPrevious,
  onNext,
  onChanged,
  onEditMovement,
  onDeleteMovement,
  disabled,
  visible,
  consolidated,
  onConsolidatedChange
}: {
  snapshot: MonthSnapshot;
  onPrevious: () => void;
  onNext: () => void;
  onChanged: () => void;
  onEditMovement: (item: TimelineItem) => void;
  onDeleteMovement: (item: TimelineItem) => void;
  disabled: boolean;
  visible: boolean;
  consolidated: boolean;
  onConsolidatedChange: (consolidated: boolean) => void;
}) {
  const finalBalance = consolidated ? snapshot.projectedBalance : snapshot.currentBalance;

  return (
    <div className="month-page" aria-hidden={!visible} data-visible={visible ? "true" : "false"}>
      <div className="month-strip">
        <button type="button" onClick={onPrevious} disabled={disabled} tabIndex={visible ? undefined : -1}>
          {monthName(addMonths(snapshot.month, -1))}
        </button>
        <strong>{monthName(snapshot.month)}</strong>
        <button type="button" onClick={onNext} disabled={disabled} tabIndex={visible ? undefined : -1}>
          {monthName(addMonths(snapshot.month, 1))}
        </button>
      </div>

      <div className="balance-summary">
        <SummaryLine label="Saldo inicial" value={snapshot.openingBalance} />
        <label className="consolidated-toggle">
          <span>Consolidado</span>
          <input
            type="checkbox"
            checked={consolidated}
            onChange={(event) => onConsolidatedChange(event.target.checked)}
            tabIndex={visible ? undefined : -1}
          />
        </label>
      </div>

      <div className="timeline-scroll">
        <div className="timeline-list-section">
          <div className="timeline-list-header">
            <h2>Movimentos</h2>
          </div>
          <div className="timeline-list" role="list" aria-label="Lançamentos do mês">
            {snapshot.items.length === 0 ? (
              <div className="empty-state">Nenhum lançamento neste mês.</div>
            ) : (
              snapshot.items.map((item) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  consolidated={consolidated}
                  onEdit={onEditMovement}
                  onDelete={onDeleteMovement}
                />
              ))
            )}
          </div>
        </div>

        <div className="month-totals">
          <span>Saldo final</span>
          <b>{formatMoney(finalBalance)}</b>
        </div>
      </div>
    </div>
  );
}

function EntrySheet({
  movement,
  settings,
  onClose,
  onSaved
}: {
  movement?: EntrySheetRecord;
  settings: AppSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sourceRecord = movement?.record;
  const editing = Boolean(movement);
  const [kind, setKind] = useState<FlowKind>(sourceRecord?.kind ?? "out");
  const [entryMode, setEntryMode] = useState<EntryMode>(movement?.source === "recurrence" ? "recurring" : "single");
  const [title, setTitle] = useState(sourceRecord?.title ?? "");
  const [selectedIconId, setSelectedIconId] = useState<string | undefined>(sourceRecord?.iconId);
  const [amountDigits, setAmountDigits] = useState(sourceRecord ? amountToCurrencyDigits(sourceRecord.amount) : "");
  const [date, setDate] = useState(movement?.source === "entry" ? movement.record.date : movement?.occurrenceDate ?? todayIso());
  const [installmentCountText, setInstallmentCountText] = useState("2");
  const [recurrenceScope, setRecurrenceScope] = useState<RecurrenceEditScope>("future");
  const selectedIcon = findIconById(selectedIconId);
  const iconSuggestions = useMemo(
    () => (selectedIcon ? [] : searchIconOptions(title, selectedIconId).slice(0, 5)),
    [selectedIcon, selectedIconId, title]
  );
  const effectiveTitle = selectedIcon?.label ?? title.trim();
  const editingRecurrence = movement?.source === "recurrence";
  const totalCents = Number(amountDigits || "0");
  const amount = currencyDigitsToAmount(amountDigits);
  const amountDisplay = formatCurrencyDigits(amountDigits);
  const installmentCount = parseInstallmentCount(installmentCountText);
  const installmentPreview = entryMode === "installment" ? buildInstallmentPreview(totalCents, installmentCount) : "";
  const baseMonth = monthLabel(monthKey(settings.openingDate));
  const isBeforeOpeningDate = Boolean(date && date < settings.openingDate);
  const dateBaseNote = `${dayLabel(settings.openingDate)} (${baseMonth})`;
  const dateWarning = isBeforeOpeningDate
    ? entryMode === "installment"
      ? `As parcelas antes da data base ${dateBaseNote} serão ignoradas no saldo. Só os lançamentos a partir da data base entram no cálculo.`
      : entryMode === "recurring"
      ? `Esse lançamento começa antes da data base ${dateBaseNote}. Os meses anteriores serão ignorados no saldo. Só os lançamentos a partir da data base entram no cálculo.`
      : `Esse lançamento está antes da data base ${dateBaseNote} e será ignorado no saldo.`
    : "";

  function handleEntryModeChange(mode: EntryMode) {
    setEntryMode(mode);
    if (mode === "installment") setKind("out");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!effectiveTitle || !amount || !date) return;

    if (movement?.source === "entry") {
      await saveRecord("entries", {
        ...movement.record,
        kind,
        title: effectiveTitle,
        iconId: selectedIconId,
        amount,
        date
      });
    } else if (movement?.source === "recurrence") {
      if (recurrenceScope === "this") {
        await saveRecord("entries", {
          ...createBase("entry"),
          kind,
          title: effectiveTitle,
          iconId: selectedIconId,
          amount,
          date,
          recurrenceId: movement.record.id
        } as Entry);
      } else if (recurrenceScope === "future") {
        const newStartsOn = date;
        if (newStartsOn <= movement.record.startsOn) {
          await saveRecord("recurrences", {
            ...movement.record,
            kind,
            title: effectiveTitle,
            iconId: selectedIconId,
            amount,
            dayOfMonth: Number(newStartsOn.slice(8, 10)),
            startsOn: newStartsOn,
            active: true
          });
        } else {
          await saveRecord("recurrences", {
            ...movement.record,
            endsOn: previousDay(newStartsOn)
          });
          await saveRecord("recurrences", {
            ...createBase("recurrence"),
            kind,
            title: effectiveTitle,
            iconId: selectedIconId,
            amount,
            dayOfMonth: Number(newStartsOn.slice(8, 10)),
            startsOn: newStartsOn,
            endsOn: movement.record.endsOn && movement.record.endsOn >= newStartsOn ? movement.record.endsOn : undefined,
            active: true
          } as Recurrence);
        }
      } else {
        await saveRecord("recurrences", {
          ...movement.record,
          kind,
          title: effectiveTitle,
          iconId: selectedIconId,
          amount,
          dayOfMonth: Number(date.slice(8, 10)),
          active: true
        });
      }
    } else if (entryMode === "recurring") {
      await saveRecord("recurrences", {
        ...createBase("recurrence"),
        kind,
        title: effectiveTitle,
        iconId: selectedIconId,
        amount,
        dayOfMonth: Number(date.slice(8, 10)),
        startsOn: date,
        active: true
      } as Recurrence);
    } else if (entryMode === "installment") {
      const installmentPlan = buildInstallmentPlan({
        firstDate: date,
        installments: installmentCount,
        title: effectiveTitle,
        totalCents
      });
      if (installmentPlan.length === 0) return;

      for (const installment of installmentPlan) {
        await saveRecord("entries", {
          ...createBase("entry"),
          kind,
          title: installment.title,
          iconId: selectedIconId,
          amount: installment.amount,
          date: installment.date
        } as Entry);
      }
    } else {
      await saveRecord("entries", {
        ...createBase("entry"),
        kind,
        title: effectiveTitle,
        iconId: selectedIconId,
        amount,
        date
      } as Entry);
    }

    onClose();
    onSaved();
  }

  return (
    <BottomSheet title={editingRecurrence ? "Editar recorrência" : editing ? "Editar lançamento" : "Novo lançamento"} onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <div className="segmented">
          <button className={kind === "out" ? "active out" : ""} type="button" onClick={() => setKind("out")}>
            Saída
          </button>
          <button className={kind === "in" ? "active in" : ""} type="button" onClick={() => setKind("in")}>
            Entrada
          </button>
        </div>

        {!editing && (
          <div className="mode-segmented" role="group" aria-label="Tipo de lançamento">
            <button className={entryMode === "single" ? "active" : ""} type="button" onClick={() => handleEntryModeChange("single")}>
              Avulso
            </button>
            <button className={entryMode === "recurring" ? "active" : ""} type="button" onClick={() => handleEntryModeChange("recurring")}>
              Recorrente
            </button>
            <button className={entryMode === "installment" ? "active" : ""} type="button" onClick={() => handleEntryModeChange("installment")}>
              Parcelado
            </button>
          </div>
        )}

        <label>
          Título
          <input
            value={selectedIcon ? "" : title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={selectedIcon ? `${selectedIcon.label} selecionado` : "Salário, farmácia, iFood"}
            disabled={Boolean(selectedIcon)}
            required={!selectedIcon}
            autoFocus
          />
        </label>

        {(selectedIcon || iconSuggestions.length > 0) && (
          <div className="icon-picker" aria-label="Sugestões de ícone">
            {selectedIcon && (
              <div className="selected-icon-chip">
                <ServiceIconImage icon={selectedIcon} />
                <span>{selectedIcon.label}</span>
                <button type="button" onClick={() => setSelectedIconId(undefined)} aria-label="Remover ícone">
                  ×
                </button>
              </div>
            )}
            {iconSuggestions.length > 0 && (
              <div className="icon-suggestions">
                {iconSuggestions.map((icon) => (
                  <button key={icon.id} type="button" onClick={() => setSelectedIconId(icon.id)}>
                    <ServiceIconImage icon={icon} />
                    <span>{icon.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label>
          {entryMode === "installment" ? "Valor total" : "Valor"}
          <span className="currency-input">
            <span className="currency-prefix" aria-hidden="true">
              R$
            </span>
            <input
              value={amountDisplay}
              onChange={(event) => setAmountDigits(extractCurrencyDigits(event.target.value))}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              autoComplete="off"
              required
            />
          </span>
        </label>
        {entryMode === "installment" && (
          <>
            <label>
              Parcelas
              <input
                value={installmentCountText}
                onChange={(event) => setInstallmentCountText(event.target.value.replace(/\D/g, "").slice(0, 3))}
                type="number"
                inputMode="numeric"
                min="2"
                max="120"
                required
              />
            </label>
            {installmentPreview && (
              <div className="installment-preview" role="status">
                {installmentPreview}
              </div>
            )}
          </>
        )}
        <label>
          {entryMode === "installment" ? "Primeira parcela" : "Data"}
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" required />
        </label>
        {dateWarning && (
          <div className="date-warning" role="status">
            {dateWarning}
          </div>
        )}
        {editing && (
          <label className="switch-row">
            <span>
              Recorrente
              <small>Repete todo mês no mesmo dia</small>
            </span>
            <input checked={editingRecurrence} type="checkbox" disabled />
          </label>
        )}

        {editingRecurrence && (
          <fieldset className="scope-group">
            <legend>Aplicar alteração</legend>
            <label className={recurrenceScope === "this" ? "active" : ""}>
              <input
                type="radio"
                name="recurrence-scope"
                value="this"
                checked={recurrenceScope === "this"}
                onChange={() => setRecurrenceScope("this")}
              />
              <span>
                Só este mês
                <small>Cria uma exceção para {monthLabel(monthKey(movement.occurrenceDate))}</small>
              </span>
            </label>
            <label className={recurrenceScope === "future" ? "active" : ""}>
              <input
                type="radio"
                name="recurrence-scope"
                value="future"
                checked={recurrenceScope === "future"}
                onChange={() => setRecurrenceScope("future")}
              />
              <span>
                A partir deste mês
                <small>Mantém o histórico e usa o novo valor daqui em diante</small>
              </span>
            </label>
            <label className={recurrenceScope === "all" ? "active" : ""}>
              <input
                type="radio"
                name="recurrence-scope"
                value="all"
                checked={recurrenceScope === "all"}
                onChange={() => setRecurrenceScope("all")}
              />
              <span>
                Toda a recorrência
                <small>Altera meses anteriores e futuros dessa regra</small>
              </span>
            </label>
          </fieldset>
        )}

        <button className="filled-button" type="submit">
          Salvar
        </button>
      </form>
    </BottomSheet>
  );
}

function BalanceSheet({ settings, onClose, onSaved }: { settings: AppSettings; onClose: () => void; onSaved: () => void }) {
  const [openingBalance, setOpeningBalance] = useState(String(settings.openingBalance));
  const [openingDate, setOpeningDate] = useState(settings.openingDate || firstDayOfMonth(monthKey()));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await saveRecord("settings", {
      ...settings,
      openingBalance: Number(openingBalance || 0),
      openingDate
    });
    onClose();
    onSaved();
  }

  return (
    <BottomSheet title="Saldo inicial" onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <label>
          Valor base
          <input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} type="number" inputMode="decimal" step="0.01" />
        </label>
        <label>
          Data base
          <input value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} type="date" />
        </label>
        <button className="filled-button" type="submit">
          Salvar saldo
        </button>
      </form>
    </BottomSheet>
  );
}

function DeleteMovementSheet({
  item,
  onCancel,
  onConfirm
}: {
  item: MovementTarget;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = item.source === "recurrence" ? "esta recorrência" : "este lançamento";

  return (
    <BottomSheet title="Excluir movimento" onClose={onCancel}>
      <div className="confirm-sheet">
        <p>Excluir {label}?</p>
        <strong>{item.title}</strong>
        <div className="confirm-actions">
          <button className="tonal-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            <UiIcon name="delete" />
            Excluir
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function BottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet">
        <div className="drag-handle" />
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            <UiIcon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "in" | "out" | "warning" | "neutral" | "info" }) {
  return (
    <article className={`metric-card ${tone}`} aria-label={`${label}: ${formatMoney(value)}`}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </article>
  );
}

function SummaryLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "summary-line strong" : "summary-line"}>
      <span>{label}</span>
      <b>{formatMoney(value)}</b>
    </div>
  );
}

function TimelineRow({
  item,
  consolidated,
  onEdit,
  onDelete
}: {
  item: TimelineItem;
  consolidated: boolean;
  onEdit: (item: TimelineItem) => void;
  onDelete: (item: TimelineItem) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const gestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    swiping: boolean;
    cancelled: boolean;
  } | null>(null);
  const status = consolidated && item.future ? "Consolidado" : item.recurring ? "Recorrente" : item.future ? "Previsto" : "Lançado";
  const swipeStyle = { "--swipe-offset": `${offset}px` } as CSSProperties;
  const swipeClassName = [
    "swipe-row",
    dragging ? "dragging" : "",
    offset > 0 ? "reveal-edit" : "",
    offset < 0 ? "reveal-delete" : ""
  ]
    .filter(Boolean)
    .join(" ");

  function applyOffset(value: number) {
    offsetRef.current = value;
    setOffset(value);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      swiping: false,
      cancelled: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;

    const diffX = event.clientX - gesture.x;
    const diffY = event.clientY - gesture.y;

    if (!gesture.swiping) {
      if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) return;
      if (Math.abs(diffY) > Math.abs(diffX)) {
        gesture.cancelled = true;
        applyOffset(0);
        return;
      }

      gesture.swiping = true;
      setDragging(true);
    }

    event.preventDefault();
    applyOffset(clamp(diffX, -SWIPE_ACTION_WIDTH, SWIPE_ACTION_WIDTH));
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    gestureRef.current = null;
    setDragging(false);

    const finalOffset = offsetRef.current;
    applyOffset(0);

    if (!gesture.swiping) return;
    if (finalOffset >= SWIPE_TRIGGER_DISTANCE) onEdit(item);
    if (finalOffset <= -SWIPE_TRIGGER_DISTANCE) onDelete(item);
  }

  function cancelSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture && event.currentTarget.hasPointerCapture(gesture.pointerId)) {
      event.currentTarget.releasePointerCapture(gesture.pointerId);
    }

    gestureRef.current = null;
    setDragging(false);
    applyOffset(0);
  }

  return (
    <div
      className={swipeClassName}
      style={swipeStyle}
      role="listitem"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={cancelSwipe}
    >
      <div className="swipe-action swipe-action-edit" aria-hidden="true">
        <UiIcon name="edit" />
        <span>Editar</span>
      </div>
      <div className="swipe-action swipe-action-delete" aria-hidden="true">
        <UiIcon name="delete" />
        <span>Excluir</span>
      </div>
      <div className={`timeline-row ${item.kind} ${item.future && !consolidated ? "future" : ""}`}>
        <TimelineIcon item={item} />
        <div className="timeline-text">
          <strong>{item.title}</strong>
          <span>{dayLabel(item.date)} · {status}</span>
        </div>
        <div className={item.kind === "in" ? "amount money-in" : "amount money-out"}>
          {item.kind === "in" ? "+" : "-"} {formatMoney(item.amount)}
        </div>
      </div>
    </div>
  );
}

function TimelineIcon({ item }: { item: MonthSnapshot["items"][number] }) {
  const icon = findIconById(item.iconId);
  if (icon) {
    return (
      <div className="entry-icon">
        <ServiceIconImage icon={icon} />
      </div>
    );
  }

  return <div className="entry-icon fallback">{initialFor(item.title)}</div>;
}

function ServiceIconImage({ icon }: { icon: ServiceIcon }) {
  return <img src={icon.src} alt="" aria-hidden="true" loading="lazy" />;
}

function initialFor(title: string): string {
  return title.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?";
}

export default App;
