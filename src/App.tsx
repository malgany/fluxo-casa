import { type Session } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { db, createBase, ensureSettings, exportBackup, importBackup, saveRecord, softDelete } from "./lib/db";
import { syncNow } from "./lib/sync";
import {
  createHousehold,
  getHouseholdMembers,
  loadCachedHouseholds,
  loadHouseholdContext,
  setSelectedHouseholdId as storeSelectedHouseholdId,
  inviteHouseholdMember,
  deleteHousehold,
  removeHouseholdMember,
  updateHouseholdName
} from "./lib/households";
import { getSupabaseClient, isSupabaseConfigured } from "./lib/supabase";
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
import { active, calculateMonth, defaultSettings, settingsIdForHousehold, type MonthSnapshot, type TimelineItem } from "./domain/finance";
import { findIconById, searchIconOptions, type ServiceIcon } from "./domain/iconRegistry";
import { buildInstallmentPlan, buildInstallmentPreview, MAX_INSTALLMENT_COUNT, parseInstallmentCount } from "./domain/installments";
import type { AppSettings, Entry, FlowKind, Household, HouseholdInvitation, HouseholdMember, HouseholdRole, HouseholdSummary, Recurrence } from "./domain/types";

type View = "home" | "timeline";
type Sheet = "entry" | "balance" | null;
type SyncIndicatorState = "idle" | "syncing" | "synced" | "error";
type ThemeMode = "light-new" | "light" | "dark";
type MaterialIconName = "wallet" | "update" | "export" | "import" | "add" | "lightMode" | "routine" | "darkMode";
type UiIconName = "home" | "list" | "more" | "back" | "close" | "delete" | "edit" | "external" | "moon" | "sun" | "lock" | "users" | "info" | "warning" | "eye" | "eyeOff";
type AuthMode = "sign-in" | "sign-up" | "reset";
type DialogTone = "info" | "error";
type HouseholdScreen = { mode: "list" | "create" | "edit"; householdId?: string };
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
type DemoHouseholdContext = {
  households: HouseholdSummary[];
  selectedHouseholdId: string;
};
const APP_UPDATE_CHECK_PARAM = "app-update-check";
const APP_UPDATE_RELOAD_DELAY_MS = 700;
const DEMO_LOADING_DELAY_MS = 3000;
const ANDROID_DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=br.com.fluxocasa";
const THEME_STORAGE_KEY = "fluxo-casa-theme";
const DEMO_USER_ID = "demo-user";
const DEMO_EMAIL = "demo@fluxocasa.local";
const DEMO_HOUSEHOLD_ID = "demo-household";
const DEMO_SESSION = {
  user: {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL
  }
} as unknown as Session;
const SWIPE_ACTION_WIDTH = 108;
const SWIPE_TRIGGER_DISTANCE = 72;
const INSTALLMENT_COUNT_OPTIONS = Array.from({ length: MAX_INSTALLMENT_COUNT - 1 }, (_, index) => index + 2);
const MATERIAL_ICON_SRC: Record<MaterialIconName, string> = {
  wallet: "/material-symbols/account_balance_wallet.svg",
  update: "/material-symbols/update.svg",
  export: "/material-symbols/file_download.svg",
  import: "/material-symbols/file_upload.svg",
  add: "/material-symbols/add.svg",
  lightMode: "/material-symbols/light_mode.svg",
  routine: "/material-symbols/routine.svg",
  darkMode: "/material-symbols/dark_mode.svg"
};
const UI_ICON_PATHS: Record<UiIconName, string[]> = {
  home: ["M3.5 10.5 12 3l8.5 7.5", "M5.5 10v10h13V10", "M9.5 20v-6h5v6"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  more: ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
  back: ["M15 18 9 12l6-6", "M9 12h12"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  delete: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V5h6v2"],
  edit: ["M4 20h4L18.5 9.5l-4-4L4 16v4", "M13.5 6.5l4 4"],
  external: ["M14 4h6v6", "M10 14 20 4", "M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"],
  lock: ["M7 10V7a5 5 0 0 1 10 0v3", "M6 10h12v10H6z", "M12 14v2"],
  users: ["M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20", "M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M21 20v-1.2a3.6 3.6 0 0 0-2.7-3.5", "M16 4.4a3.5 3.5 0 0 1 0 6.8"],
  info: ["M12 17v-5", "M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  warning: ["M12 9v4", "M12 17h.01", "M10.3 4.4 2.5 18a1.7 1.7 0 0 0 1.5 2.5h16a1.7 1.7 0 0 0 1.5-2.5L13.7 4.4a1.7 1.7 0 0 0-3.4 0Z"],
  sun: ["M12 4V2", "M12 22v-2", "m4.93 4.93-1.42-1.42", "m20.49 20.49-1.42-1.42", "M4 12H2", "M22 12h-2", "m4.93 19.07-1.42 1.42", "m20.49 3.51-1.42 1.42", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  moon: ["M21 14.8A8.5 8.5 0 0 1 9.2 3 7 7 0 1 0 21 14.8Z"],
  eye: ["M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  eyeOff: ["M3 3l18 18", "M10.6 10.6a3 3 0 0 0 3.8 3.8", "M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.6 3.5", "M6.4 6.4C3.8 8.1 2.5 12 2.5 12s3.5 7 9.5 7a10.5 10.5 0 0 0 5-1.3"]
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordSetup, setPasswordSetup] = useState(() => isPasswordSetupUrl());
  const [demoMode, setDemoMode] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readInitialTheme());
  const supabaseConfigured = isSupabaseConfigured();
  const productionDesktopGate = productionDesktopGateMode();

  useEffect(() => {
    const appliedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = appliedTheme;
    document.documentElement.dataset.themeVariant = theme;
    document.documentElement.style.colorScheme = appliedTheme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setCheckingSession(false);
      return undefined;
    }

    const supabase = getSupabaseClient();
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordSetup(true);
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseConfigured]);

  async function handleSignOut() {
    if (demoMode) {
      setDemoMode(false);
      return;
    }

    await getSupabaseClient().auth.signOut();
    setSession(null);
  }

  if (productionDesktopGate === "confirmation") return <DesktopConfirmationPage />;
  if (productionDesktopGate === "landing") return <DesktopLandingPage />;

  if (checkingSession) return <AuthGate checking configured={supabaseConfigured} onDemo={() => setDemoMode(true)} />;
  if (!session && !demoMode) return <AuthGate configured={supabaseConfigured} onDemo={() => setDemoMode(true)} />;
  if (passwordSetup && !demoMode) return <PasswordSetupGate onDone={() => setPasswordSetup(false)} />;

  return <FinanceApp session={demoMode ? DEMO_SESSION : session ?? DEMO_SESSION} demoMode={demoMode} theme={theme} setTheme={setTheme} onSignOut={() => void handleSignOut()} />;
}

function FinanceApp({
  session,
  demoMode = false,
  theme,
  setTheme,
  onSignOut
}: {
  session: Session;
  demoMode?: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  onSignOut: () => void;
}) {
  const [view, setView] = useState<View>("home");
  const currentMonth = monthKey();
  const [timelineMonth, setTimelineMonth] = useState(currentMonth);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingMovement, setEditingMovement] = useState<MovementTarget | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<MovementTarget | null>(null);
  const [deletingHousehold, setDeletingHousehold] = useState<HouseholdSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [syncState, setSyncState] = useState<SyncIndicatorState>("idle");
  const [syncHint, setSyncHint] = useState("Ainda não sincronizado");
  const [syncHintVisible, setSyncHintVisible] = useState(false);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState("");
  const [householdLoading, setHouseholdLoading] = useState(true);
  const [householdScreen, setHouseholdScreen] = useState<HouseholdScreen | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);
  const demoLoadingDelayShownRef = useRef(false);

  useEffect(() => {
    void refreshHouseholdContext();
  }, [demoMode, session.user.id]);

  useEffect(() => {
    if (!selectedHouseholdId) return;
    void ensureSettings(selectedHouseholdId);
  }, [selectedHouseholdId]);

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
    if (!selectedHouseholdId) return undefined;

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
  }, [selectedHouseholdId]);

  const entries = useLiveQuery<Entry[]>(
    () => (selectedHouseholdId ? db.entries.where("householdId").equals(selectedHouseholdId).toArray() : Promise.resolve([])),
    [selectedHouseholdId]
  ) ?? [];
  const recurrences = useLiveQuery<Recurrence[]>(
    () => (selectedHouseholdId ? db.recurrences.where("householdId").equals(selectedHouseholdId).toArray() : Promise.resolve([])),
    [selectedHouseholdId]
  ) ?? [];
  const settings = useLiveQuery<AppSettings | undefined>(
    () => (selectedHouseholdId ? db.settings.get(settingsIdForHousehold(selectedHouseholdId)) : Promise.resolve(undefined)),
    [selectedHouseholdId]
  );
  const memberHouseholdId = householdScreen?.mode === "edit" && householdScreen.householdId ? householdScreen.householdId : selectedHouseholdId;
  const members = useLiveQuery<HouseholdMember[]>(
    () => (memberHouseholdId ? db.householdMembers.where("householdId").equals(memberHouseholdId).toArray() : Promise.resolve([])),
    [memberHouseholdId]
  ) ?? [];
  const invitations = useLiveQuery<HouseholdInvitation[]>(
    () => (memberHouseholdId ? db.householdInvitations.where("householdId").equals(memberHouseholdId).toArray() : Promise.resolve([])),
    [memberHouseholdId]
  ) ?? [];

  const data = useMemo(
    () => ({
      entries: entries.filter(active),
      recurrences: recurrences.filter(active),
      settings: settings ?? defaultSettings(selectedHouseholdId || "pending")
    }),
    [entries, recurrences, selectedHouseholdId, settings]
  );
  const activeMembers = members.filter(active);
  const pendingInvitations = invitations.filter((invitation) => active(invitation) && invitation.status === "pending");
  const activeHouseholdScreen: HouseholdScreen | null =
    householdScreen ?? (!householdLoading && !selectedHouseholdId ? { mode: households.length > 0 ? "list" : "create" } : null);
  const insideSelectedHousehold = Boolean(selectedHouseholdId && !activeHouseholdScreen);
  const showHouseholdBackButton = Boolean(activeHouseholdScreen && activeHouseholdScreen.mode !== "list" && households.length > 0);
  const screenHousehold = activeHouseholdScreen?.householdId
    ? households.find((household) => household.id === activeHouseholdScreen.householdId)
    : undefined;
  const selectedHousehold = selectedHouseholdId ? households.find((household) => household.id === selectedHouseholdId) : undefined;
  const canManageSelectedHousehold = canManageHousehold(selectedHousehold);
  const headerTitle = activeHouseholdScreen
    ? activeHouseholdScreen.mode === "edit"
      ? "Editar conta"
      : activeHouseholdScreen.mode === "create"
        ? "Nova conta"
        : "Contas"
    : view === "home"
      ? "Dashboard"
      : "Lançamentos";
  const headerSubtitle = activeHouseholdScreen
    ? activeHouseholdScreen.mode === "edit"
      ? screenHousehold?.name ?? "Contas e membros"
      : "Contas e membros"
    : view === "timeline"
      ? yearLabel(timelineMonth)
      : monthLabel(currentMonth);

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

  async function handleCheckUpdates() {
    setMenuOpen(false);
    setMessage("Verificando atualizações...");

    const hasUpdate = await checkForAppUpdate();

    if (!hasUpdate) {
      setMessage("Aplicativo atualizado.");
      return;
    }

    setMessage("Atualizando...");
    window.setTimeout(() => reloadAppWithFreshNavigation(), APP_UPDATE_RELOAD_DELAY_MS);
  }

  async function refreshHouseholdContext(showMessage = false) {
    setHouseholdLoading(true);
    try {
      if (demoMode) {
        if (!demoLoadingDelayShownRef.current) {
          await delay(DEMO_LOADING_DELAY_MS);
          demoLoadingDelayShownRef.current = true;
        }
        const context = await ensureDemoHousehold();
        setHouseholds(context.households);
        setSelectedHouseholdId(context.selectedHouseholdId);
        if (showMessage) setMessage("Modo demo pronto.");
        return;
      }

      const context = await loadHouseholdContext(session);
      setHouseholds(context.households);
      setSelectedHouseholdId(context.selectedHouseholdId);
      if (context.selectedHouseholdId) await ensureSettings(context.selectedHouseholdId);
      if (showMessage) setMessage("Contas atualizadas.");
    } catch (error) {
      const cachedHouseholds = await loadCachedHouseholds();
      const fallbackHouseholdId = cachedHouseholds.find((household) => household.id === selectedHouseholdId)?.id ?? cachedHouseholds[0]?.id ?? "";
      setHouseholds(cachedHouseholds);
      setSelectedHouseholdId(fallbackHouseholdId);
      if (fallbackHouseholdId) await ensureSettings(fallbackHouseholdId);
      setMessage(errorMessage(error, "Não foi possível carregar suas contas."));
    } finally {
      setHouseholdLoading(false);
    }
  }

  async function handleSelectHousehold(householdId: string) {
    storeSelectedHouseholdId(householdId);
    setSelectedHouseholdId(householdId);
    setHouseholdScreen(null);
    setSheet(null);
    setMenuOpen(false);
    setView("home");
    await ensureSettings(householdId);
    void runSync(false, householdId);
  }

  async function handleCreateHousehold(name: string) {
    try {
      if (demoMode) {
        const context = await createDemoHousehold(name);
        setHouseholds(context.households);
        setSelectedHouseholdId(context.selectedHouseholdId);
        setMessage("Conta criada.");
        setHouseholdScreen({ mode: "edit", householdId: context.selectedHouseholdId });
        return;
      }

      const context = await createHousehold(name);
      setHouseholds(context.households);
      setSelectedHouseholdId(context.selectedHouseholdId);
      await ensureSettings(context.selectedHouseholdId);
      setMessage("Conta criada.");
      setHouseholdScreen({ mode: "edit", householdId: context.selectedHouseholdId });
      void runSync(false, context.selectedHouseholdId);
    } catch (error) {
      setMessage(errorMessage(error, "Não foi possível criar a conta."));
    }
  }

  async function handleSaveHousehold(householdId: string, name: string) {
    try {
      if (demoMode) {
        const context = await updateDemoHouseholdName(householdId, name);
        setHouseholds(context.households);
        setSelectedHouseholdId(context.selectedHouseholdId);
        setMessage("Conta salva.");
        return;
      }

      const context = await updateHouseholdName(householdId, name);
      setHouseholds(context.households);
      setSelectedHouseholdId(context.selectedHouseholdId);
      setMessage("Conta salva.");
    } catch (error) {
      setMessage(errorMessage(error, "Não foi possível salvar a conta."));
    }
  }

  async function handleInviteMember(householdId: string, email: string, role: HouseholdRole): Promise<boolean> {
    if (!householdId) return false;
    if (demoMode) {
      setMessage("Convites ficam desativados no modo demo.");
      return false;
    }

    try {
      const invite = await inviteHouseholdMember(householdId, email, role);
      await getHouseholdMembers(householdId);
      setMessage(inviteMessage(invite));
      return true;
    } catch (error) {
      setMessage(errorMessage(error, "Não foi possível enviar o convite."));
      return false;
    }
  }

  async function handleRemoveMember(householdId: string, memberId: string) {
    if (demoMode) {
      setMessage("Membros ficam fixos no modo demo.");
      return;
    }

    try {
      await removeHouseholdMember(householdId, memberId);
      setMessage("Membro removido.");
    } catch (error) {
      setMessage(errorMessage(error, "Não foi possível remover o membro."));
    }
  }

  async function confirmDeleteHousehold() {
    if (!deletingHousehold) return;

    try {
      if (demoMode) {
        const context = await deleteDemoHousehold(deletingHousehold.id);
        setHouseholds(context.households);
        setSelectedHouseholdId(context.selectedHouseholdId);
        setDeletingHousehold(null);
        setHouseholdScreen({ mode: context.households.length > 0 ? "list" : "create" });
        setSheet(null);
        setMessage("Conta excluida.");
        return;
      }

      const context = await deleteHousehold(deletingHousehold.id);
      setHouseholds(context.households);
      setSelectedHouseholdId(context.selectedHouseholdId);
      setDeletingHousehold(null);
      setHouseholdScreen({ mode: context.households.length > 0 ? "list" : "create" });
      setSheet(null);
      setMessage("Conta excluída.");
    } catch (error) {
      setMessage(errorMessage(error, "Não foi possível excluir a conta."));
    }
  }

  function openHouseholdList() {
    setHouseholdScreen({ mode: "list" });
    setSheet(null);
    setMenuOpen(false);
  }

  function revealSyncHint(text?: string) {
    if (text) setSyncHint(text);
    setSyncHintVisible(true);
  }

  async function runSync(showHint: boolean, targetHouseholdId = selectedHouseholdId) {
    if (!targetHouseholdId) return;
    if (demoMode) {
      setSyncState("synced");
      setSyncHint("Modo demo");
      if (showHint) setSyncHintVisible(true);
      return;
    }

    if (syncingRef.current) {
      if (showHint) revealSyncHint("Atualizando...");
      return;
    }
    syncingRef.current = true;
    setSyncState("syncing");
    setSyncHint("Atualizando...");
    if (showHint) setSyncHintVisible(true);

    try {
      const result = await syncNow(targetHouseholdId);
      setSyncState(result.ok ? "synced" : "error");
      setSyncHint(result.ok ? "Sincronizado" : result.message);
      if (showHint || !result.ok) setSyncHintVisible(true);
    } finally {
      syncingRef.current = false;
    }
  }

  async function handleExport() {
    if (!selectedHouseholdId || !canManageSelectedHousehold) return;
    const backup = await exportBackup(selectedHouseholdId);
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
    if (!file || !selectedHouseholdId || !canManageSelectedHousehold) return;
    await importBackup(JSON.parse(await file.text()), selectedHouseholdId);
    setMessage("Backup importado.");
    setMenuOpen(false);
  }

  function handleNewEntry() {
    if (!selectedHouseholdId) {
      setMessage("Selecione uma conta antes de lançar.");
      return;
    }
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
        {showHouseholdBackButton && (
          <div className="top-leading-action">
            <button className="icon-button" type="button" onClick={() => setHouseholdScreen({ mode: "list" })} aria-label="Voltar para contas" title="Voltar para contas">
              <UiIcon name="back" />
            </button>
          </div>
        )}
        <div className="top-title">
          <h1>{headerTitle}</h1>
          <span>{headerSubtitle}</span>
        </div>
        {insideSelectedHousehold && selectedHousehold?.name && (
          <div className="top-account-label" title={`Conta atual: ${selectedHousehold.name}`}>
            {selectedHousehold.name}
          </div>
        )}
        <div className="app-actions">
          {insideSelectedHousehold && <SyncIndicator state={syncState} hint={syncHint} visible={syncHintVisible} onPress={() => revealSyncHint()} />}
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
            <button role="menuitem" type="button" onClick={openHouseholdList}>
              <UiIcon name="users" />
              <span>Contas e membros</span>
            </button>
            {insideSelectedHousehold && canManageSelectedHousehold && (
              <>
                <button role="menuitem" type="button" onClick={() => { setSheet("balance"); setMenuOpen(false); }}>
                  <MaterialIcon name="wallet" className="menu-icon" />
                  <span>Ajustar saldo inicial</span>
                </button>
              </>
            )}
            <div className="theme-menu-control" role="group" aria-label="Tema">
              <button className={theme === "light-new" ? "active" : ""} type="button" onClick={() => setTheme("light-new")} aria-label="Tema claro novo">
                <MaterialIcon name="lightMode" className="theme-icon" />
              </button>
              <button className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")} aria-label="Tema claro atual">
                <MaterialIcon name="routine" className="theme-icon" />
              </button>
              <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")} aria-label="Tema escuro">
                <MaterialIcon name="darkMode" className="theme-icon" />
              </button>
            </div>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onSignOut(); }}>
              <UiIcon name="lock" />
              <span>Sair</span>
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

      <main className={activeHouseholdScreen ? "content household-content" : view === "timeline" ? "content timeline-content" : "content"}>
        {householdLoading ? (
          <DashboardSkeleton />
        ) : activeHouseholdScreen ? (
          <HouseholdManagerPage
            currentUserEmail={session.user.email ?? ""}
            currentUserId={session.user.id}
            households={households}
            invitations={pendingInvitations}
            members={activeMembers}
            screen={activeHouseholdScreen}
            selectedHouseholdId={selectedHouseholdId}
            onCreate={(name) => void handleCreateHousehold(name)}
            onEdit={(householdId) => {
              setHouseholdScreen({ mode: "edit", householdId });
              if (!demoMode) void getHouseholdMembers(householdId);
            }}
            onInvite={(householdId, email, role) => handleInviteMember(householdId, email, role)}
            onNew={() => setHouseholdScreen({ mode: "create" })}
            onDelete={(household) => setDeletingHousehold(household)}
            onRemoveMember={(householdId, memberId) => void handleRemoveMember(householdId, memberId)}
            onSave={(householdId, name) => void handleSaveHousehold(householdId, name)}
            onSelect={(householdId) => void handleSelectHousehold(householdId)}
          />
        ) : view === "home" ? (
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

      {insideSelectedHousehold && (
        <nav className="bottom-nav" aria-label="Navegação inferior">
          <button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}>
            <span>
              <UiIcon name="home" />
            </span>
            Dashboard
          </button>
          <button className="nav-action" type="button" onClick={handleNewEntry} aria-label="Novo lançamento">
            <span>
              <MaterialIcon name="add" className="nav-action-icon" />
            </span>
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
      )}

      {sheet === "entry" && (
        <EntrySheet
          movement={editingSheetRecord}
          householdId={selectedHouseholdId}
          settings={data.settings}
          onClose={handleCloseEntrySheet}
          onSaved={handleEntrySaved}
        />
      )}
      {sheet === "balance" && canManageSelectedHousehold && <BalanceSheet settings={data.settings} onClose={() => setSheet(null)} onSaved={() => void runSync(false)} />}
      {deletingHousehold && (
        <DeleteHouseholdSheet
          household={deletingHousehold}
          onCancel={() => setDeletingHousehold(null)}
          onConfirm={() => void confirmDeleteHousehold()}
        />
      )}
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

async function ensureDemoHousehold(): Promise<DemoHouseholdContext> {
  const now = new Date().toISOString();
  const currentMonth = monthKey();
  const existing = await db.households.get(DEMO_HOUSEHOLD_ID);

  if (!existing || existing.deletedAt) {
    await db.households.put({
      id: DEMO_HOUSEHOLD_ID,
      name: "Casa demo",
      ownerId: DEMO_USER_ID,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      syncStatus: "synced"
    });
    await db.householdMembers.put({
      id: "demo-member-owner",
      householdId: DEMO_HOUSEHOLD_ID,
      userId: DEMO_USER_ID,
      email: DEMO_EMAIL,
      role: "owner",
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced"
    });
  }

  const settings = {
    ...defaultSettings(DEMO_HOUSEHOLD_ID, todayIso()),
    openingBalance: 1200,
    openingDate: firstDayOfMonth(currentMonth),
    syncStatus: "synced" as const
  };
  await db.settings.put(settings);

  const existingEntries = await db.entries.where("householdId").equals(DEMO_HOUSEHOLD_ID).count();
  if (existingEntries === 0) {
    await db.entries.bulkPut([
      demoEntry("demo-entry-salary", "in", "Salario demo", 5200, firstDayOfMonth(currentMonth), now),
      demoEntry("demo-entry-market", "out", "Mercado", 640, previousDay(todayIso()), now),
      demoEntry("demo-entry-rent", "out", "Aluguel", 1800, todayIso(), now)
    ]);
  }

  const existingRecurrences = await db.recurrences.where("householdId").equals(DEMO_HOUSEHOLD_ID).count();
  if (existingRecurrences === 0) {
    await db.recurrences.put({
      id: "demo-recurrence-internet",
      householdId: DEMO_HOUSEHOLD_ID,
      kind: "out",
      title: "Internet",
      amount: 129.9,
      dayOfMonth: 10,
      startsOn: firstDayOfMonth(currentMonth),
      active: true,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced"
    });
  }

  storeSelectedHouseholdId(DEMO_HOUSEHOLD_ID);
  return loadDemoHouseholds(DEMO_HOUSEHOLD_ID);
}

async function createDemoHousehold(name: string): Promise<DemoHouseholdContext> {
  const cleanName = name.trim() || "Casa demo";
  const household = {
    ...createBase("household"),
    name: cleanName,
    ownerId: DEMO_USER_ID,
    syncStatus: "synced" as const
  } satisfies Household;
  const member = {
    ...createBase("member"),
    householdId: household.id,
    userId: DEMO_USER_ID,
    email: DEMO_EMAIL,
    role: "owner",
    syncStatus: "synced" as const
  } satisfies HouseholdMember;

  await db.households.put(household);
  await db.householdMembers.put(member);
  await ensureSettings(household.id);
  storeSelectedHouseholdId(household.id);
  return loadDemoHouseholds(household.id);
}

async function updateDemoHouseholdName(householdId: string, name: string): Promise<DemoHouseholdContext> {
  const cleanName = name.trim();
  if (!householdId || !cleanName) throw new Error("Informe o nome da conta.");

  await db.households.update(householdId, {
    name: cleanName,
    updatedAt: new Date().toISOString(),
    syncStatus: "synced"
  });

  return loadDemoHouseholds(householdId);
}

async function deleteDemoHousehold(householdId: string): Promise<DemoHouseholdContext> {
  const now = new Date().toISOString();
  await db.households.update(householdId, {
    deletedAt: now,
    updatedAt: now,
    syncStatus: "synced"
  });

  const members = await db.householdMembers.where("householdId").equals(householdId).toArray();
  await db.householdMembers.bulkPut(
    members.map((member) => ({
      ...member,
      deletedAt: now,
      updatedAt: now,
      syncStatus: "synced" as const
    }))
  );

  return loadDemoHouseholds("");
}

async function loadDemoHouseholds(preferredHouseholdId: string): Promise<DemoHouseholdContext> {
  const [households, members] = await Promise.all([db.households.toArray(), db.householdMembers.toArray()]);
  const summaries = households
    .filter(active)
    .map((household) => {
      const member = members.find((item) => item.householdId === household.id && item.userId === DEMO_USER_ID && !item.deletedAt);
      if (!member) return undefined;
      return {
        id: household.id,
        name: household.name,
        role: member.role,
        ownerId: household.ownerId,
        createdAt: household.createdAt,
        updatedAt: household.updatedAt
      };
    })
    .filter(Boolean) as HouseholdSummary[];
  const selectedHouseholdId = summaries.some((household) => household.id === preferredHouseholdId) ? preferredHouseholdId : summaries[0]?.id ?? "";
  storeSelectedHouseholdId(selectedHouseholdId);

  return { households: summaries, selectedHouseholdId };
}

function demoEntry(id: string, kind: FlowKind, title: string, amount: number, date: string, now: string): Entry {
  return {
    id,
    householdId: DEMO_HOUSEHOLD_ID,
    kind,
    title,
    amount,
    date,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced"
  };
}

function AuthGate({ checking = false, configured, onDemo }: { checking?: boolean; configured: boolean; onDemo: () => void }) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState(checking ? "Verificando sessão..." : "");
  const [dialog, setDialog] = useState<{ tone: DialogTone; title: string; message: string; onClose?: () => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (checking) {
      setStatus("Verificando sessão...");
      return;
    }

    setStatus((current) => (current === "Verificando sessão..." ? "" : current));
  }, [checking]);

  function closeDialog() {
    const onClose = dialog?.onClose;
    setDialog(null);
    onClose?.();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !configured) return;

    setSubmitting(true);
    setStatus("");

    try {
      const supabase = getSupabaseClient();
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: import.meta.env.VITE_APP_URL || window.location.origin
        });
        if (error) throw error;
        setDialog({
          tone: "info",
          title: "E-mail enviado",
          message: "Enviamos uma mensagem com as instruções para recuperar sua senha.",
          onClose: () => {
            setMode("sign-in");
            setPassword("");
          }
        });
        return;
      }

      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: import.meta.env.VITE_APP_URL || window.location.origin
          }
        });
        if (error) throw error;
        if (!data.session) {
          setDialog({
            tone: "info",
            title: "Cadastro criado",
            message: "Enviamos um e-mail de confirmação. Confirme seu cadastro antes de entrar.",
            onClose: () => {
              setMode("sign-in");
              setPassword("");
            }
          });
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
    } catch (error) {
      setDialog({
        tone: "error",
        title: "Não foi possível entrar",
        message: translateAuthError(error)
      });
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
        {!configured ? (
          <p role="status">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local.</p>
        ) : (
          <>
            <div className="auth-tabs" role="group" aria-label="Acesso">
              <button className={mode === "sign-in" ? "active" : ""} type="button" onClick={() => setMode("sign-in")}>
                Entrar
              </button>
              <button className={mode === "sign-up" ? "active" : ""} type="button" onClick={() => setMode("sign-up")}>
                Criar
              </button>
            </div>
            <label>
              E-mail
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
              />
            </label>
            {mode !== "reset" && (
              <label>
                Senha
                <span className="password-field">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={passwordVisible ? "text" : "password"}
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    minLength={6}
                    required
                  />
                  <button
                    className="password-visibility-button"
                    type="button"
                    aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    <UiIcon name={passwordVisible ? "eyeOff" : "eye"} />
                  </button>
                </span>
              </label>
            )}
            <button className="filled-button" type="submit" disabled={submitting}>
              {submitting ? "Aguarde..." : mode === "reset" ? "Enviar e-mail" : mode === "sign-up" ? "Criar conta" : "Entrar"}
            </button>
            <button className="tonal-button demo-access-button" type="button" onClick={onDemo}>
              Modo demo
            </button>
            <button className="text-button" type="button" onClick={() => setMode(mode === "reset" ? "sign-in" : "reset")}>
              {mode === "reset" ? "Voltar para login" : "Esqueci minha senha"}
            </button>
            <div className="access-links">
              <a href="/privacy.html">Política de privacidade</a>
              <span aria-hidden="true">|</span>
              <a href="/account-deletion.html">Excluir conta</a>
            </div>
            {status && <p role="status">{status}</p>}
          </>
        )}
      </form>
      {dialog && <MaterialDialog tone={dialog.tone} title={dialog.title} message={dialog.message} onConfirm={closeDialog} />}
    </main>
  );
}

function PasswordSetupGate({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<{ tone: DialogTone; title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setStatus("");

    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) throw error;
      onDone();
    } catch (error) {
      setDialog({
        tone: "error",
        title: "Senha não salva",
        message: translateAuthError(error)
      });
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
        <h1>Definir senha</h1>
        <label>
          Nova senha
          <span className="password-field">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              className="password-visibility-button"
              type="button"
              aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              <UiIcon name={passwordVisible ? "eyeOff" : "eye"} />
            </button>
          </span>
        </label>
        <button className="filled-button" type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : "Salvar senha"}
        </button>
        {status && <p role="status">{status}</p>}
      </form>
      {dialog && <MaterialDialog tone={dialog.tone} title={dialog.title} message={dialog.message} onConfirm={() => setDialog(null)} />}
    </main>
  );
}

function DesktopLandingPage() {
  return (
    <main className="desktop-gate">
      <section className="desktop-gate-panel">
        <div className="desktop-gate-mark" aria-hidden="true">
          <UiIcon name="home" />
        </div>
        <p>Fluxo Casa</p>
        <h1>Seu app de finanças da casa fica melhor no celular.</h1>
        <span>
          Esta versão foi pensada para uso mobile. Baixe o app no Android para cadastrar lançamentos, acompanhar o saldo e manter tudo sincronizado.
        </span>
        <a className="filled-button desktop-gate-action" href={ANDROID_DOWNLOAD_URL} target="_blank" rel="noreferrer">
          Baixar para Android
        </a>
      </section>
    </main>
  );
}

function DesktopConfirmationPage() {
  return (
    <main className="desktop-gate confirmation">
      <section className="desktop-gate-panel">
        <div className="desktop-gate-mark success" aria-hidden="true">
          <SyncIcon state="synced" />
        </div>
        <p>Fluxo Casa</p>
        <h1>Conta confirmada com sucesso.</h1>
        <span>
          Seu cadastro foi confirmado. Abra o Fluxo Casa no celular para continuar; sua conta inicial será preparada automaticamente.
        </span>
        <small>Você já pode fechar esta aba.</small>
      </section>
    </main>
  );
}

function MaterialDialog({
  tone,
  title,
  message,
  onConfirm
}: {
  tone: DialogTone;
  title: string;
  message: string;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section className={`material-dialog ${tone}`} role={tone === "error" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="auth-dialog-title">
        <div className="dialog-icon" aria-hidden="true">
          <UiIcon name={tone === "error" ? "warning" : "info"} />
        </div>
        <h2 id="auth-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="text-button" type="button" onClick={onConfirm} autoFocus>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function inviteMessage(invite: { emailSent: boolean; alreadyMember: boolean }): string {
  if (invite.alreadyMember) return "Essa pessoa já faz parte desta conta.";
  if (invite.emailSent) return "Convite enviado.";
  return "Convite salvo. Essa pessoa já tem conta; peça para entrar no app para aceitar.";
}

function translateAuthError(error: unknown): string {
  const message = errorMessage(error, "");
  const normalized = message.toLowerCase();

  if (normalized.includes("email not confirmed")) {
    return "E-mail não confirmado. Abra a mensagem que enviamos e confirme seu cadastro antes de entrar.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Este e-mail já possui cadastro. Entre com sua senha ou recupere o acesso.";
  }
  if (normalized.includes("password") && (normalized.includes("6") || normalized.includes("weak"))) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Não foi possível conectar ao Supabase. Verifique sua conexão e tente novamente.";
  }

  return "Não foi possível concluir esta ação. Tente novamente.";
}

function isPasswordSetupUrl(): boolean {
  if (typeof window === "undefined") return false;
  const value = `${window.location.hash} ${window.location.search}`;
  return value.includes("type=recovery") || value.includes("type=invite");
}

function productionDesktopGateMode(): "confirmation" | "landing" | null {
  if (!import.meta.env.PROD || typeof window === "undefined") return null;
  if (isMobileLikeDevice()) return null;
  return isAuthConfirmationUrl() ? "confirmation" : "landing";
}

function isAuthConfirmationUrl(): boolean {
  const value = `${window.location.hash} ${window.location.search}`.toLowerCase();
  if (value.includes("type=recovery") || value.includes("type=invite")) return false;
  return value.includes("type=signup") || value.includes("type=email_change") || value.includes("access_token=") || value.includes("code=");
}

function isMobileLikeDevice(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod|mobile|windows phone/.test(userAgent)) return true;
  return navigator.maxTouchPoints > 1 && window.matchMedia("(max-width: 900px)").matches;
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" || stored === "light-new" ? stored : "light";
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
    url.searchParams.set(APP_UPDATE_CHECK_PARAM, String(Date.now()));

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

function reloadAppWithFreshNavigation(): void {
  const url = new URL(window.location.href);
  url.searchParams.set(APP_UPDATE_CHECK_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

async function updateServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
    if (registration.waiting) return true;

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

function DashboardSkeleton() {
  return (
    <section className="stack dashboard-skeleton" aria-label="Carregando suas contas" aria-busy="true">
      <article className="hero-balance skeleton-card">
        <span className="skeleton-line short" />
        <strong className="skeleton-line amount-line" />
        <small className="skeleton-line medium" />
      </article>

      <div className="card-grid">
        {["in", "out", "info", "warning"].map((tone) => (
          <article key={tone} className={`metric-card skeleton-card ${tone}`}>
            <span className="skeleton-line medium" />
            <strong className="skeleton-line value-line" />
          </article>
        ))}
      </div>

      <section className="projection-chart skeleton-card">
        <div className="projection-chart-header">
          <div>
            <span className="skeleton-line medium" />
            <strong className="skeleton-line value-line" />
          </div>
          <small className="skeleton-line tiny" />
        </div>
        <div className="skeleton-chart" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="projection-chart-footer">
          <span className="skeleton-line tiny" />
          <span className="skeleton-line tiny" />
        </div>
      </section>
    </section>
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
  householdId,
  settings,
  onClose,
  onSaved
}: {
  movement?: EntrySheetRecord;
  householdId: string;
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
          householdId,
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
            householdId,
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
        householdId,
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
          householdId,
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
        householdId,
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

        <div className="mode-segmented" role="group" aria-label={editing ? "Tipo de lançamento fixo na edição" : "Tipo de lançamento"}>
          <button
            className={entryMode === "single" ? "active" : ""}
            type="button"
            onClick={() => handleEntryModeChange("single")}
            disabled={editing}
          >
            Avulso
          </button>
          <button
            className={entryMode === "recurring" ? "active" : ""}
            type="button"
            onClick={() => handleEntryModeChange("recurring")}
            disabled={editing}
          >
            Recorrente
          </button>
          <button
            className={entryMode === "installment" ? "active" : ""}
            type="button"
            onClick={() => handleEntryModeChange("installment")}
            disabled={editing}
          >
            Parcelado
          </button>
        </div>

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

        {entryMode === "installment" ? (
          <>
            <div className="installment-fields">
              <label>
                Valor total
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
              <label>
                Parcelas
                <select value={installmentCountText} onChange={(event) => setInstallmentCountText(event.target.value)} required>
                  {INSTALLMENT_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={String(count)}>
                      {count}x
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {installmentPreview && (
              <div className="installment-preview" role="status">
                {installmentPreview}
              </div>
            )}
          </>
        ) : (
          <label>
            Valor
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

function HouseholdManagerPage({
  currentUserEmail,
  currentUserId,
  households,
  invitations,
  members,
  screen,
  selectedHouseholdId,
  onCreate,
  onDelete,
  onEdit,
  onInvite,
  onNew,
  onRemoveMember,
  onSave,
  onSelect
}: {
  currentUserEmail: string;
  currentUserId: string;
  households: HouseholdSummary[];
  invitations: HouseholdInvitation[];
  members: HouseholdMember[];
  screen: HouseholdScreen;
  selectedHouseholdId: string;
  onCreate: (name: string) => void;
  onDelete: (household: HouseholdSummary) => void;
  onEdit: (householdId: string) => void;
  onInvite: (householdId: string, email: string, role: HouseholdRole) => Promise<boolean>;
  onNew: () => void;
  onRemoveMember: (householdId: string, memberId: string) => void;
  onSave: (householdId: string, name: string) => void;
  onSelect: (householdId: string) => void;
}) {
  const editingHousehold = screen.householdId ? households.find((household) => household.id === screen.householdId) : undefined;
  const [householdName, setHouseholdName] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<HouseholdRole>("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const canManageMembers = canManageHousehold(editingHousehold);

  useEffect(() => {
    setHouseholdName(screen.mode === "edit" ? editingHousehold?.name ?? "" : "");
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("member");
    setInviteSubmitting(false);
  }, [editingHousehold?.id, editingHousehold?.name, screen.mode]);

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!householdName.trim()) return;
    onCreate(householdName);
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!editingHousehold || !canManageHousehold(editingHousehold) || !householdName.trim()) return;
    onSave(editingHousehold.id, householdName);
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    if (!editingHousehold || !canManageMembers || !inviteEmail.trim() || inviteSubmitting) return;

    setInviteSubmitting(true);
    const invited = await onInvite(editingHousehold.id, inviteEmail, inviteRole);
    setInviteSubmitting(false);
    if (!invited) return;

    setInviteEmail("");
    setInviteRole("member");
    setInviteOpen(false);
  }

  const identity = (
    <div className="household-current">
      <span>Conectado como</span>
      <strong>{currentUserEmail}</strong>
    </div>
  );

  if (screen.mode === "list") {
    return (
      <div className="household-manager">
        {identity}
        <div className="section-title">
          <span>Contas</span>
          <button className="tonal-button compact-button" type="button" onClick={onNew}>
            Nova conta
          </button>
        </div>
        <div className="household-list" role="list" aria-label="Contas">
          {households.length === 0 ? (
            <div className="empty-state compact">Nenhuma conta cadastrada.</div>
          ) : (
            households.map((household) => {
              const canManage = canManageHousehold(household);

              return (
                <article key={household.id} className={household.id === selectedHouseholdId ? "household-row active" : "household-row"} role="listitem">
                  <div className="household-row-main">
                    <span>{household.name}</span>
                    <small>{roleLabel(household.role)}</small>
                  </div>
                  <div className="household-row-actions">
                    {canManage && (
                      <button className="household-action-button" type="button" onClick={() => onEdit(household.id)} aria-label={`Editar ${household.name}`} title="Editar">
                        <UiIcon name="edit" />
                      </button>
                    )}
                    <button className="household-action-button" type="button" onClick={() => onSelect(household.id)} aria-label={`Acessar ${household.name}`} title="Acessar">
                      <UiIcon name="external" />
                    </button>
                    {canManage && (
                      <button className="household-action-button danger" type="button" onClick={() => onDelete(household)} aria-label={`Excluir ${household.name}`} title="Excluir">
                        <UiIcon name="delete" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (screen.mode === "create") {
    return (
      <div className="household-manager">
        {identity}
        <form className="household-form" onSubmit={handleCreate}>
          <label>
            Nova conta
            <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder="Apartamento, família, projeto" autoFocus />
          </label>
          <button className="filled-button" type="submit">
            Criar conta
          </button>
        </form>
      </div>
    );
  }

  if (!editingHousehold) {
    return (
      <div className="household-manager">
        <div className="empty-state compact">Conta não encontrada.</div>
      </div>
    );
  }

  if (!canManageMembers) {
    return (
      <div className="household-manager">
        {identity}
        <div className="household-form">
          <div className="household-current">
            <span>Conta</span>
            <strong>{editingHousehold.name}</strong>
          </div>
          <button className="filled-button" type="button" onClick={() => onSelect(editingHousehold.id)}>
            Acessar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="household-manager">
      {identity}
      <form className="household-form" onSubmit={handleSave}>
        <label>
          Nome da conta
          <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} required />
        </label>
        <div className="household-actions">
          <button className="tonal-button" type="button" onClick={() => onSelect(editingHousehold.id)}>
            Acessar
          </button>
          <button className="filled-button" type="submit">
            Salvar
          </button>
        </div>
      </form>

      <div className="member-section">
        <div className="section-title">
          <span>Membros</span>
          {canManageMembers && (
            <button className="text-button icon-text-button" type="button" onClick={() => setInviteOpen(true)}>
              <MaterialIcon name="add" className="button-icon" />
              Adicionar
            </button>
          )}
        </div>
        <div className="member-table">
          {members.length === 0 && invitations.length === 0 ? (
            <div className="empty-state compact">Nenhum membro carregado.</div>
          ) : (
            <>
              {members.map((member) => {
                const canRemove = canManageMembers && member.userId !== currentUserId && member.role !== "owner";
                return (
                  <div key={member.id} className="member-row">
                    <div className="member-main">
                      <span className="member-email">{member.email || member.userId}</span>
                      <div className="member-meta">
                        <span className="role-chip">{roleLabel(member.role)}</span>
                      </div>
                    </div>
                    {canRemove && (
                      <button className="danger-text-button member-remove-button" type="button" onClick={() => onRemoveMember(editingHousehold.id, member.id)}>
                        Remover
                      </button>
                    )}
                  </div>
                );
              })}
              {invitations.map((invitation) => (
                <div key={invitation.id} className="member-row pending">
                  <div className="member-main">
                    <span className="member-email">{invitation.email}</span>
                    <div className="member-meta">
                      <span className="role-chip">{roleLabel(invitation.role)}</span>
                      <span className="status-chip">Convidado</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {inviteOpen && (
        <BottomSheet title="Adicionar membro" onClose={() => { if (!inviteSubmitting) setInviteOpen(false); }}>
          <form className="sheet-form" onSubmit={handleInvite}>
        <label>
          Convidar por e-mail
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            type="email"
            placeholder="pessoa@email.com"
            disabled={!canManageMembers || inviteSubmitting}
            autoFocus
            required
          />
        </label>
        <label>
          Permissão
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as HouseholdRole)} disabled={!canManageMembers || inviteSubmitting}>
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button className="filled-button" type="submit" disabled={!canManageMembers || inviteSubmitting}>
          {inviteSubmitting ? "Enviando..." : "Enviar convite"}
        </button>
          </form>
        </BottomSheet>
      )}
    </div>
  );
}

function roleLabel(role: HouseholdRole): string {
  if (role === "owner") return "Dono";
  if (role === "admin") return "Administrador";
  return "Membro";
}

function canManageHousehold(household?: Pick<HouseholdSummary, "role">): boolean {
  return household?.role === "owner" || household?.role === "admin";
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

function DeleteHouseholdSheet({
  household,
  onCancel,
  onConfirm
}: {
  household: HouseholdSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet title="Excluir conta" onClose={onCancel}>
      <div className="confirm-sheet">
        <p>Excluir esta conta?</p>
        <strong>{household.name}</strong>
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
