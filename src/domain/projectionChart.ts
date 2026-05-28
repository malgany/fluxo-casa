import { lastDayOfMonth, monthKey, signedAmount, todayIso } from "./dates";
import type { MonthSnapshot } from "./finance";

export interface ProjectionPoint {
  day: number;
  value: number;
  x: number;
  y: number;
}

export interface ProjectionChartData {
  actualLinePath: string;
  areaPath: string;
  finalPoint: ProjectionPoint;
  hasNegativeBalance: boolean;
  hasMovements: boolean;
  movementCount: number;
  projectionLinePath: string;
  todayPoint?: ProjectionPoint;
  zeroY: number;
}

export function buildProjectionChart(snapshot: MonthSnapshot, today = todayIso()): ProjectionChartData {
  const lastDay = Number(lastDayOfMonth(snapshot.month).slice(8, 10));
  const currentMonth = monthKey(today);
  const todayDay = currentMonth === snapshot.month ? Number(today.slice(8, 10)) : undefined;
  const cutoffDay = snapshot.month < currentMonth ? lastDay : snapshot.month > currentMonth ? 0 : todayDay ?? 0;
  const dailyChanges = new Map<number, number>();

  for (const item of snapshot.items) {
    const day = Number(item.date.slice(8, 10));
    dailyChanges.set(day, (dailyChanges.get(day) ?? 0) + signedAmount(item.kind, item.amount));
  }

  let balance = snapshot.openingBalance;
  const values = [{ day: 0, value: balance }];
  for (let day = 1; day <= lastDay; day += 1) {
    balance += dailyChanges.get(day) ?? 0;
    values.push({ day, value: balance });
  }

  const rawMin = Math.min(0, ...values.map((point) => point.value));
  const rawMax = Math.max(0, ...values.map((point) => point.value));
  const range = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax), Math.abs(rawMin), 1) * 0.18);
  const minValue = rawMin - range * 0.12;
  const maxValue = rawMax + range * 0.12;
  const chartWidth = 288;
  const chartHeight = 68;
  const left = 16;
  const top = 26;
  const bottom = top + chartHeight;
  const valueRange = maxValue - minValue || 1;
  const projectY = (value: number) => bottom - ((value - minValue) / valueRange) * chartHeight;
  const points = values.map((point) => {
    const x = left + (point.day / Math.max(lastDay, 1)) * chartWidth;
    const y = projectY(point.value);
    return { ...point, x, y };
  });

  const zeroY = projectY(0);
  const fullLinePath = pathFromPoints(points);
  const actualPoints = points.filter((point) => point.day <= cutoffDay);
  const projectionPoints = cutoffDay < lastDay ? points.filter((point) => point.day >= cutoffDay) : [];

  return {
    actualLinePath: pathFromPoints(actualPoints),
    areaPath: `${fullLinePath} L${round(left + chartWidth)} ${round(zeroY)} L${left} ${round(zeroY)} Z`,
    finalPoint: points[points.length - 1],
    hasNegativeBalance: points.some((point) => point.value < 0),
    hasMovements: snapshot.items.length > 0,
    movementCount: snapshot.items.length,
    projectionLinePath: pathFromPoints(projectionPoints),
    todayPoint: todayDay ? points.find((point) => point.day === todayDay) : undefined,
    zeroY
  };
}

function pathFromPoints(points: ProjectionPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`).join(" ");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
