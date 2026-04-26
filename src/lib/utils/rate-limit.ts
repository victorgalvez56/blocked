import { serverEnv } from './env';

interface DailyBudget {
  date: string;
  spentUsd: number;
}

let memoryBudget: DailyBudget = { date: today(), spentUsd: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rolloverIfNeeded(): void {
  const t = today();
  if (memoryBudget.date !== t) memoryBudget = { date: t, spentUsd: 0 };
}

export interface BudgetCheck {
  ok: boolean;
  spent: number;
  ceiling: number;
  remaining: number;
}

export function checkBudget(estimatedCostUsd: number): BudgetCheck {
  rolloverIfNeeded();
  const ceiling = serverEnv().OPENAI_DAILY_BUDGET_USD;
  const projected = memoryBudget.spentUsd + estimatedCostUsd;
  return {
    ok: projected <= ceiling,
    spent: memoryBudget.spentUsd,
    ceiling,
    remaining: Math.max(0, ceiling - memoryBudget.spentUsd),
  };
}

export function recordSpend(actualCostUsd: number): void {
  rolloverIfNeeded();
  memoryBudget.spentUsd += actualCostUsd;
}
