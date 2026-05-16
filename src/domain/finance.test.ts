import { describe, expect, it } from "vitest";
import { calculateMonth, type FinanceData } from "./finance";
import type { AppSettings, Entry, Recurrence } from "./types";

const createdAt = "2026-05-01T00:00:00.000Z";

function base(id: string) {
  return { id, createdAt, updatedAt: createdAt };
}

const settings: AppSettings = {
  ...base("settings_app"),
  openingBalance: 10000,
  openingDate: "2026-05-01"
};

function data(overrides: Partial<FinanceData>): FinanceData {
  return {
    settings,
    entries: [],
    recurrences: [],
    ...overrides
  };
}

describe("calculateMonth", () => {
  it("calculates current balance, committed spending and projected free balance", () => {
    const entries: Entry[] = [
      {
        ...base("entry_salary"),
        kind: "in",
        title: "Salário",
        amount: 3000,
        date: "2026-05-02"
      },
      {
        ...base("entry_market"),
        kind: "out",
        title: "Mercado",
        amount: 1000,
        date: "2026-05-05"
      },
      {
        ...base("entry_bonus"),
        kind: "in",
        title: "Bônus",
        amount: 500,
        date: "2026-05-18"
      },
      {
        ...base("entry_rent"),
        kind: "out",
        title: "Casa",
        amount: 2000,
        date: "2026-05-20"
      }
    ];

    const snapshot = calculateMonth(data({ entries }), "2026-05", "2026-05-15");

    expect(snapshot.openingBalance).toBe(10000);
    expect(snapshot.currentBalance).toBe(12000);
    expect(snapshot.committed).toBe(2000);
    expect(snapshot.receivedInMonth).toBe(3000);
    expect(snapshot.spentInMonth).toBe(1000);
    expect(snapshot.futureIncome).toBe(500);
    expect(snapshot.projectedFree).toBe(10500);
    expect(snapshot.projectedBalance).toBe(10500);
  });

  it("projects monthly recurring values into future months", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_salary"),
        kind: "in",
        title: "Salário",
        amount: 8000,
        dayOfMonth: 5,
        startsOn: "2026-05-05",
        active: true
      }
    ];

    const snapshot = calculateMonth(data({ recurrences }), "2026-06", "2026-05-15");

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].title).toBe("Salário");
    expect(snapshot.futureIncome).toBe(8000);
    expect(snapshot.projectedBalance).toBe(26000);
  });

  it("marks entries after the selected cutoff as future", () => {
    const entries: Entry[] = [
      {
        ...base("entry_future"),
        kind: "out",
        title: "Internet",
        amount: 120,
        date: "2026-05-25"
      }
    ];

    const snapshot = calculateMonth(data({ entries }), "2026-05", "2026-05-15");

    expect(snapshot.items[0].future).toBe(true);
    expect(snapshot.futureExpenses).toBe(120);
  });
});
