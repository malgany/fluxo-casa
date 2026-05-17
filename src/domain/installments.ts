import { addMonths, dateInMonth, formatMoney, monthKey } from "./dates";

export interface InstallmentPlanItem {
  amount: number;
  date: string;
  index: number;
  title: string;
}

export function parseInstallmentCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 2 || count > 120) return 0;
  return count;
}

export function buildInstallmentPlan({
  firstDate,
  installments,
  title,
  totalCents
}: {
  firstDate: string;
  installments: number;
  title: string;
  totalCents: number;
}): InstallmentPlanItem[] {
  if (!firstDate || !title || totalCents < installments || installments < 2) return [];

  const day = Number(firstDate.slice(8, 10));
  const baseCents = Math.floor(totalCents / installments);
  const remainder = totalCents - baseCents * installments;

  return Array.from({ length: installments }, (_, index) => {
    const cents = index === installments - 1 ? baseCents + remainder : baseCents;
    return {
      amount: cents / 100,
      date: dateInMonth(addMonths(monthKey(firstDate), index), day),
      index: index + 1,
      title: `${title} ${index + 1}/${installments}`
    };
  });
}

export function buildInstallmentPreview(totalCents: number, installments: number): string {
  const plan = buildInstallmentPlan({
    firstDate: "2026-01-01",
    installments,
    title: "Parcela",
    totalCents
  });
  if (plan.length === 0) return "";

  const first = plan[0].amount;
  const last = plan[plan.length - 1].amount;
  if (first === last) return `${installments}x de ${formatMoney(first)}`;
  return `${installments - 1}x de ${formatMoney(first)} + 1x de ${formatMoney(last)}`;
}
