import {
  addMonths,
  dateInMonth,
  firstDayOfMonth,
  lastDayOfMonth,
  monthKey,
  previousDay,
  signedAmount,
  todayIso
} from "./dates";
import type { AppSettings, Entry, FlowKind, Recurrence } from "./types";

export interface FinanceData {
  entries: Entry[];
  recurrences: Recurrence[];
  settings: AppSettings;
}

export interface TimelineItem {
  id: string;
  recordId: string;
  kind: FlowKind;
  title: string;
  iconId?: string;
  amount: number;
  date: string;
  future: boolean;
  recurring: boolean;
  recurrenceId?: string;
  source: "entry" | "recurrence";
}

export interface MonthSnapshot {
  month: string;
  openingBalance: number;
  currentBalance: number;
  projectedBalance: number;
  committed: number;
  receivedInMonth: number;
  spentInMonth: number;
  projectedFree: number;
  futureIncome: number;
  futureExpenses: number;
  monthIncome: number;
  monthExpenses: number;
  items: TimelineItem[];
}

export function active<T extends { deletedAt?: string }>(item: T): boolean {
  return !item.deletedAt;
}

export function defaultSettings(today = todayIso()): AppSettings {
  const now = new Date().toISOString();
  return {
    id: "settings_app",
    openingBalance: 0,
    openingDate: firstDayOfMonth(monthKey(today)),
    createdAt: now,
    updatedAt: now,
    syncStatus: "dirty"
  };
}

export function buildMonthItems(data: FinanceData, month: string, today = todayIso()): TimelineItem[] {
  const entries = data.entries
    .filter(active)
    .filter((entry) => entry.date >= data.settings.openingDate)
    .filter((entry) => monthKey(entry.date) === month)
    .map<TimelineItem>((entry) => ({
      id: entry.id,
      recordId: entry.id,
      kind: entry.kind,
      title: entry.title,
      iconId: entry.iconId,
      amount: entry.amount,
      date: entry.date,
      future: entry.date > today,
      recurring: Boolean(entry.recurrenceId),
      recurrenceId: entry.recurrenceId,
      source: "entry"
    }));

  const recurring = data.recurrences
    .filter(active)
    .filter((rule) => rule.active)
    .filter((rule) => {
      const date = dateInMonth(month, rule.dayOfMonth);
      return date >= rule.startsOn && (!rule.endsOn || date <= rule.endsOn) && date >= data.settings.openingDate;
    })
    .filter((rule) => !entries.some((entry) => entry.recurrenceId === rule.id && entry.date === dateInMonth(month, rule.dayOfMonth)))
    .map<TimelineItem>((rule) => {
      const date = dateInMonth(month, rule.dayOfMonth);
      return {
        id: `${rule.id}_${month}`,
        recordId: rule.id,
        kind: rule.kind,
        title: rule.title,
        iconId: rule.iconId,
        amount: rule.amount,
        date,
        future: date > today,
        recurring: true,
        source: "recurrence"
      };
    });

  return [...entries, ...recurring].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function balanceUntil(data: FinanceData, date: string): number {
  let balance = data.settings.openingBalance;

  for (const entry of data.entries.filter(active)) {
    if (entry.date >= data.settings.openingDate && entry.date <= date) {
      balance += signedAmount(entry.kind, entry.amount);
    }
  }

  const fromMonth = monthKey(data.settings.openingDate);
  const toMonth = monthKey(date);
  for (const rule of data.recurrences.filter(active).filter((item) => item.active)) {
    let cursor = fromMonth;
    while (cursor <= toMonth) {
      const occurrenceDate = dateInMonth(cursor, rule.dayOfMonth);
      const starts = occurrenceDate >= rule.startsOn;
      const notEnded = !rule.endsOn || occurrenceDate <= rule.endsOn;
      const duplicateEntry = data.entries.some(
        (entry) => active(entry) && entry.recurrenceId === rule.id && entry.date === occurrenceDate
      );
      if (starts && notEnded && !duplicateEntry && occurrenceDate >= data.settings.openingDate && occurrenceDate <= date) {
        balance += signedAmount(rule.kind, rule.amount);
      }
      cursor = addMonths(cursor, 1);
    }
  }

  return balance;
}

export function calculateMonth(data: FinanceData, month: string, today = todayIso()): MonthSnapshot {
  const firstDay = firstDayOfMonth(month);
  const lastDay = lastDayOfMonth(month);
  const currentMonth = monthKey(today);
  const currentCutoff = month < currentMonth ? lastDay : month > currentMonth ? previousDay(firstDay) : today;
  const items = buildMonthItems(data, month, today);
  const futureItems = items.filter((item) => item.date > currentCutoff);

  const monthIncome = items.filter((item) => item.kind === "in").reduce((sum, item) => sum + item.amount, 0);
  const monthExpenses = items.filter((item) => item.kind === "out").reduce((sum, item) => sum + item.amount, 0);
  const futureIncome = futureItems.filter((item) => item.kind === "in").reduce((sum, item) => sum + item.amount, 0);
  const futureExpenses = futureItems.filter((item) => item.kind === "out").reduce((sum, item) => sum + item.amount, 0);

  return {
    month,
    openingBalance: balanceUntil(data, previousDay(firstDay)),
    currentBalance: balanceUntil(data, currentCutoff),
    projectedBalance: balanceUntil(data, lastDay),
    committed: futureExpenses,
    receivedInMonth: items
      .filter((item) => item.kind === "in" && item.date <= currentCutoff)
      .reduce((sum, item) => sum + item.amount, 0),
    spentInMonth: items
      .filter((item) => item.kind === "out" && item.date <= currentCutoff)
      .reduce((sum, item) => sum + item.amount, 0),
    projectedFree: balanceUntil(data, currentCutoff) + futureIncome - futureExpenses,
    futureIncome,
    futureExpenses,
    monthIncome,
    monthExpenses,
    items
  };
}
