import { describe, expect, it } from "vitest";
import { buildInstallmentPlan, buildInstallmentPreview, parseInstallmentCount } from "./installments";

describe("installments", () => {
  it("builds monthly installment entries from the first due date", () => {
    const plan = buildInstallmentPlan({
      firstDate: "2026-06-10",
      installments: 3,
      title: "Celular",
      totalCents: 90000
    });

    expect(plan).toEqual([
      { amount: 300, date: "2026-06-10", index: 1, title: "Celular 1/3" },
      { amount: 300, date: "2026-07-10", index: 2, title: "Celular 2/3" },
      { amount: 300, date: "2026-08-10", index: 3, title: "Celular 3/3" }
    ]);
  });

  it("keeps the exact total when cents do not split evenly", () => {
    const plan = buildInstallmentPlan({
      firstDate: "2026-01-31",
      installments: 3,
      title: "Compra",
      totalCents: 10000
    });

    expect(plan.map((item) => item.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(plan.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("validates installment count and builds a readable preview", () => {
    expect(parseInstallmentCount("1")).toBe(0);
    expect(parseInstallmentCount("10")).toBe(10);
    expect(parseInstallmentCount("37")).toBe(0);
    expect(buildInstallmentPreview(100000, 10).replace(/\s/g, " ")).toBe("10x de R$ 100,00");
  });
});
