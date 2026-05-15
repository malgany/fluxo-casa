export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function monthKey(date = todayIso()): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, diff: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

export function lastDayOfMonth(month: string): string {
  return dateInMonth(month, 31);
}

export function dateInMonth(month: string, day: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0")}`;
}

export function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(year, month - 1, day - 1);
  return previous.toISOString().slice(0, 10);
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1)
  );
}

export function monthName(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year, monthNumber - 1, 1));
}

export function yearLabel(month: string): string {
  return month.slice(0, 4);
}

export function dayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function signedAmount(kind: "in" | "out", amount: number): number {
  return kind === "in" ? amount : -amount;
}
