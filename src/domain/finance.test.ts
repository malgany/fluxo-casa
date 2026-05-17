import { describe, expect, it } from "vitest";
import { calculateMonth, type FinanceData } from "./finance";
import type { AppSettings, Entry, Recurrence } from "./types";

const createdAt = "2026-05-01T00:00:00.000Z";

function base(id: string) {
  return { id, householdId: "household_1", createdAt, updatedAt: createdAt };
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

  it("uses one-off entries as monthly exceptions for recurring values", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_salary"),
        kind: "in",
        title: "Salario",
        amount: 1500,
        dayOfMonth: 5,
        startsOn: "2026-05-05",
        active: true
      }
    ];
    const entries: Entry[] = [
      {
        ...base("entry_salary_exception"),
        kind: "in",
        title: "Salario ajustado",
        amount: 2000,
        date: "2026-08-05",
        recurrenceId: "rec_salary"
      }
    ];

    const august = calculateMonth(data({ entries, recurrences }), "2026-08", "2026-08-15");

    expect(august.items).toHaveLength(1);
    expect(august.items[0].title).toBe("Salario ajustado");
    expect(august.monthIncome).toBe(2000);
    expect(august.projectedBalance).toBe(16500);
  });

  it("does not show a recurring occurrence after the rule ended inside the same month", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_split_old"),
        kind: "in",
        title: "Salario antigo",
        amount: 1500,
        dayOfMonth: 5,
        startsOn: "2026-08-05",
        endsOn: "2026-08-04",
        active: true
      },
      {
        ...base("rec_split_new"),
        kind: "in",
        title: "Salario novo",
        amount: 2000,
        dayOfMonth: 5,
        startsOn: "2026-08-05",
        active: true
      }
    ];

    const august = calculateMonth(data({ recurrences }), "2026-08", "2026-08-15");

    expect(august.items).toHaveLength(1);
    expect(august.items[0].title).toBe("Salario novo");
  });

  it("supports versioned recurring values from a future month", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_salary_old"),
        kind: "in",
        title: "Salario",
        amount: 1500,
        dayOfMonth: 5,
        startsOn: "2026-05-05",
        endsOn: "2026-07-31",
        active: true
      },
      {
        ...base("rec_salary_new"),
        kind: "in",
        title: "Salario",
        amount: 2000,
        dayOfMonth: 5,
        startsOn: "2026-08-05",
        active: true
      }
    ];

    const july = calculateMonth(data({ recurrences }), "2026-07", "2026-07-15");
    const august = calculateMonth(data({ recurrences }), "2026-08", "2026-08-15");

    expect(july.items[0].amount).toBe(1500);
    expect(july.projectedBalance).toBe(14500);
    expect(august.items[0].amount).toBe(2000);
    expect(august.projectedBalance).toBe(16500);
  });

  it("ignores recurring months before the opening date", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_retro_salary"),
        kind: "in",
        title: "Salario retroativo",
        amount: 500,
        dayOfMonth: 5,
        startsOn: "2026-03-05",
        active: true
      }
    ];
    const zeroBase = {
      ...settings,
      openingBalance: 0,
      openingDate: "2026-05-01"
    };

    const april = calculateMonth(data({ settings: zeroBase, recurrences }), "2026-04", "2026-05-15");
    const may = calculateMonth(data({ settings: zeroBase, recurrences }), "2026-05", "2026-05-15");

    expect(april.items).toHaveLength(0);
    expect(april.monthIncome).toBe(0);
    expect(april.projectedBalance).toBe(0);
    expect(may.items).toHaveLength(1);
    expect(may.receivedInMonth).toBe(500);
    expect(may.projectedBalance).toBe(500);
  });

  it("ignores one-off entries before the opening date", () => {
    const entries: Entry[] = [
      {
        ...base("entry_before_base"),
        kind: "in",
        title: "Ajuste antigo",
        amount: 500,
        date: "2026-03-15"
      }
    ];
    const mayBase = {
      ...settings,
      openingBalance: 0,
      openingDate: "2026-05-01"
    };

    const march = calculateMonth(data({ settings: mayBase, entries }), "2026-03", "2026-05-15");

    expect(march.items).toHaveLength(0);
    expect(march.monthIncome).toBe(0);
    expect(march.projectedBalance).toBe(0);
  });

  it("counts retroactive recurring values when they are after the opening date", () => {
    const recurrences: Recurrence[] = [
      {
        ...base("rec_march_salary"),
        kind: "in",
        title: "Salario",
        amount: 500,
        dayOfMonth: 5,
        startsOn: "2026-03-05",
        active: true
      }
    ];
    const januaryBase = {
      ...settings,
      openingBalance: 0,
      openingDate: "2026-01-01"
    };

    const may = calculateMonth(data({ settings: januaryBase, recurrences }), "2026-05", "2026-05-15");

    expect(may.projectedBalance).toBe(1500);
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
