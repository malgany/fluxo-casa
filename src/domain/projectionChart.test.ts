import { describe, expect, it } from "vitest";
import { buildProjectionChart } from "./projectionChart";
import type { MonthSnapshot, TimelineItem } from "./finance";

describe("buildProjectionChart", () => {
  it("uses the opening balance as the first plotted point", () => {
    const chart = buildProjectionChart(
      snapshot({
        openingBalance: 500,
        items: [item({ date: "2026-05-10", amount: 200, kind: "out" })]
      }),
      "2026-05-15"
    );

    expect(chart.actualLinePath).toMatch(/^M16 /);
  });

  it("keeps the zero baseline visible and places negative balances below it", () => {
    const chart = buildProjectionChart(
      snapshot({
        openingBalance: 100,
        items: [item({ date: "2026-05-02", amount: 200, kind: "out" })]
      }),
      "2026-05-05"
    );

    expect(chart.zeroY).toBeGreaterThan(26);
    expect(chart.zeroY).toBeLessThan(94);
    expect(chart.todayPoint?.value).toBe(-100);
    expect(chart.todayPoint?.y).toBeGreaterThan(chart.zeroY);
    expect(chart.hasNegativeBalance).toBe(true);
  });

  it("draws the future part as a separate projection segment from today", () => {
    const chart = buildProjectionChart(
      snapshot({
        openingBalance: 0,
        items: [
          item({ date: "2026-05-03", amount: 100, kind: "in" }),
          item({ date: "2026-05-20", amount: 50, kind: "out" })
        ]
      }),
      "2026-05-10"
    );

    expect(chart.todayPoint).toBeDefined();
    expect(chart.projectionLinePath).toContain(`M${round(chart.todayPoint?.x ?? 0)} ${round(chart.todayPoint?.y ?? 0)}`);
  });

  it("keeps the right edge tied to the projected final balance instead of the mid-month peak", () => {
    const chart = buildProjectionChart(
      snapshot({
        openingBalance: 100,
        projectedBalance: 200,
        items: [
          item({ date: "2026-05-05", amount: 500, kind: "in" }),
          item({ date: "2026-05-25", amount: 400, kind: "out" })
        ]
      }),
      "2026-05-10"
    );

    expect(chart.finalPoint.x).toBe(304);
    expect(chart.finalPoint.value).toBe(200);
    expect(chart.todayPoint?.value).toBe(600);
    expect(chart.finalPoint.y).toBeGreaterThan(chart.todayPoint?.y ?? 0);
  });
});

function snapshot(overrides: Partial<MonthSnapshot>): MonthSnapshot {
  return {
    month: "2026-05",
    openingBalance: 0,
    currentBalance: 0,
    projectedBalance: 0,
    committed: 0,
    receivedInMonth: 0,
    spentInMonth: 0,
    projectedFree: 0,
    futureIncome: 0,
    futureExpenses: 0,
    monthIncome: 0,
    monthExpenses: 0,
    items: [],
    ...overrides
  };
}

function item(overrides: Pick<TimelineItem, "amount" | "date" | "kind">): TimelineItem {
  return {
    id: `item_${overrides.date}_${overrides.kind}`,
    recordId: `record_${overrides.date}_${overrides.kind}`,
    title: "Movimento",
    future: false,
    recurring: false,
    source: "entry",
    ...overrides
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
