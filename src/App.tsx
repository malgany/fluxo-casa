import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { db, createBase, ensureSettings, exportBackup, importBackup, saveRecord, softDelete } from "./lib/db";
import { syncNow } from "./lib/sync";
import { addMonths, dayLabel, firstDayOfMonth, formatMoney, monthKey, monthLabel, monthName, todayIso, yearLabel } from "./domain/dates";
import { active, calculateMonth, defaultSettings, type MonthSnapshot } from "./domain/finance";
import { findIconById, searchIconOptions, type ServiceIcon } from "./domain/iconRegistry";
import type { AppSettings, Entry, FlowKind, Recurrence } from "./domain/types";

type View = "home" | "timeline";
type Sheet = "entry" | "balance" | null;

function App() {
  const [view, setView] = useState<View>("home");
  const currentMonth = monthKey();
  const [timelineMonth, setTimelineMonth] = useState(currentMonth);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    void ensureSettings();
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
  const timelineSnapshot = useMemo(() => calculateMonth(data, timelineMonth), [data, timelineMonth]);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => setMessage(""), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!menuOpen) return undefined;

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

  async function runSync(showMessage: boolean) {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const result = await syncNow();
      if (showMessage || result.ok) setMessage(result.message);
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
          <span className="eyebrow">{view === "timeline" ? yearLabel(timelineMonth) : monthLabel(currentMonth)}</span>
          <h1>{view === "home" ? "Início" : "Lançamentos"}</h1>
        </div>
        <div className="app-actions">
          <button ref={menuButtonRef} className="icon-button" type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="Menu">
            ⋮
          </button>
        </div>

        {menuOpen && (
          <div ref={menuRef} className="overflow-menu">
            <button type="button" onClick={() => { setSheet("balance"); setMenuOpen(false); }}>
              Ajustar saldo inicial
            </button>
            <button type="button" onClick={handleSync}>
              Sincronizar
            </button>
            <button type="button" onClick={handleExport}>
              Exportar backup
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Importar backup
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

      <main className="content">
        {view === "home" ? (
          <HomeView snapshot={homeSnapshot} onOpenTimeline={() => setView("timeline")} />
        ) : (
          <TimelineView snapshot={timelineSnapshot} setMonth={setTimelineMonth} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navegação inferior">
        <button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}>
          <span>⌂</span>
          Início
        </button>
        <button className={view === "timeline" ? "active" : ""} type="button" onClick={() => setView("timeline")}>
          <span>≡</span>
          Lançamentos
        </button>
      </nav>

      <button className="fab" type="button" onClick={() => setSheet("entry")} aria-label="Novo lançamento">
        +
      </button>

      {sheet === "entry" && <EntrySheet onClose={() => setSheet(null)} onSaved={() => void runSync(false)} />}
      {sheet === "balance" && <BalanceSheet settings={data.settings} onClose={() => setSheet(null)} />}
    </div>
  );
}

function HomeView({ snapshot, onOpenTimeline }: { snapshot: MonthSnapshot; onOpenTimeline: () => void }) {
  return (
    <section className="stack">
      <div className="hero-balance">
        <span>Saldo atual</span>
        <strong>{formatMoney(snapshot.currentBalance)}</strong>
        <small>Saldo previsto: {formatMoney(snapshot.projectedBalance)}</small>
      </div>

      <div className="card-grid">
        <MetricCard label="Comprometido" value={snapshot.committed} tone="warning" />
        <MetricCard label="Gasto no mês" value={snapshot.spentInMonth} tone="out" />
        <MetricCard label="Livre projetado" value={snapshot.projectedFree} tone="neutral" />
        <MetricCard label="Entradas futuras" value={snapshot.futureIncome} tone="in" />
      </div>

      <button className="timeline-preview" type="button" onClick={onOpenTimeline}>
        <div>
          <span>Linha do tempo</span>
          <strong>{snapshot.items.length} lançamentos em {monthLabel(snapshot.month)}</strong>
        </div>
        <b>›</b>
      </button>
    </section>
  );
}

function TimelineView({ snapshot, setMonth }: { snapshot: MonthSnapshot; setMonth: (month: string) => void }) {
  const touchStart = useRef<number | null>(null);

  function onTouchEnd(clientX: number) {
    if (touchStart.current == null) return;
    const diff = clientX - touchStart.current;
    if (Math.abs(diff) > 56) setMonth(addMonths(snapshot.month, diff < 0 ? 1 : -1));
    touchStart.current = null;
  }

  return (
    <section
      className="stack"
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => onTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="month-strip">
        <button type="button" onClick={() => setMonth(addMonths(snapshot.month, -1))}>
          {monthName(addMonths(snapshot.month, -1))}
        </button>
        <strong>{monthName(snapshot.month)}</strong>
        <button type="button" onClick={() => setMonth(addMonths(snapshot.month, 1))}>
          {monthName(addMonths(snapshot.month, 1))}
        </button>
      </div>

      <div className="balance-summary">
        <SummaryLine label="Saldo inicial" value={snapshot.openingBalance} />
        <SummaryLine label="Saldo atual" value={snapshot.currentBalance} />
        <SummaryLine label="Gastos previstos" value={snapshot.futureExpenses} />
        <SummaryLine label="Saldo previsto" value={snapshot.projectedBalance} strong />
      </div>

      <div className="timeline-list">
        {snapshot.items.length === 0 ? (
          <div className="empty-state">Nenhum lançamento neste mês.</div>
        ) : (
          snapshot.items.map((item) => <TimelineRow key={item.id} item={item} />)
        )}
      </div>

      <div className="month-totals">
        <span>Entradas: <b className="money-in">{formatMoney(snapshot.monthIncome)}</b></span>
        <span>Saídas: <b className="money-out">{formatMoney(snapshot.monthExpenses)}</b></span>
      </div>
    </section>
  );
}

function EntrySheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<FlowKind>("out");
  const [title, setTitle] = useState("");
  const [selectedIconId, setSelectedIconId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [recurring, setRecurring] = useState(false);
  const selectedIcon = findIconById(selectedIconId);
  const iconSuggestions = useMemo(() => searchIconOptions(title, selectedIconId).slice(0, 5), [selectedIconId, title]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !value) return;

    if (recurring) {
      await saveRecord("recurrences", {
        ...createBase("recurrence"),
        kind,
        title: title.trim(),
        iconId: selectedIconId,
        amount: value,
        dayOfMonth: Number(date.slice(8, 10)),
        startsOn: date,
        active: true
      } as Recurrence);
    } else {
      await saveRecord("entries", {
        ...createBase("entry"),
        kind,
        title: title.trim(),
        iconId: selectedIconId,
        amount: value,
        date
      } as Entry);
    }

    onClose();
    onSaved();
  }

  return (
    <BottomSheet title="Novo lançamento" onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <div className="segmented">
          <button className={kind === "out" ? "active out" : ""} type="button" onClick={() => setKind("out")}>
            Saída
          </button>
          <button className={kind === "in" ? "active in" : ""} type="button" onClick={() => setKind("in")}>
            Entrada
          </button>
        </div>

        <label>
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Salário, farmácia, iFood" autoFocus />
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
          Valor
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" inputMode="decimal" step="0.01" min="0" />
        </label>
        <label>
          Data
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
        </label>
        <label className="switch-row">
          <span>
            Recorrente
            <small>Repete todo mês no mesmo dia</small>
          </span>
          <input checked={recurring} onChange={(event) => setRecurring(event.target.checked)} type="checkbox" />
        </label>

        <button className="filled-button" type="submit">
          Salvar
        </button>
      </form>
    </BottomSheet>
  );
}

function BalanceSheet({ settings, onClose }: { settings: AppSettings; onClose: () => void }) {
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

function BottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet">
        <div className="drag-handle" />
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "in" | "out" | "warning" | "neutral" }) {
  return (
    <article className={`metric-card ${tone}`}>
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

function TimelineRow({ item }: { item: MonthSnapshot["items"][number] }) {
  return (
    <div className={`timeline-row ${item.kind} ${item.future ? "future" : ""}`}>
      <TimelineIcon item={item} />
      <div className="timeline-text">
        <strong>{item.title}</strong>
        <span>{dayLabel(item.date)} · {item.recurring ? "Recorrente" : item.future ? "Previsto" : "Lançado"}</span>
      </div>
      <div className={item.kind === "in" ? "amount money-in" : "amount money-out"}>
        {item.kind === "in" ? "+" : "-"} {formatMoney(item.amount)}
      </div>
      <button
        className="delete-button"
        type="button"
        onClick={() => softDelete(item.source === "entry" ? "entries" : "recurrences", item.recordId)}
        aria-label="Excluir"
      >
        ×
      </button>
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
