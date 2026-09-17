import apiClient from './client';

export type TargetStatus = 'achieved' | 'in-progress' | 'not-started' | 'no-target';

// One scope's progress for a month - the overall target or one company's.
// `id` is null when no target has been set (a company that sold without
// one still appears so the gap is visible).
export type TargetProgress = {
  id: string | null;
  scope: 'overall' | 'company';
  company: string | null;
  orders: number;
  targetAmount: number;
  achieved: number;
  remaining: number;
  // null when the target is zero - the percentage is undefined, not infinite.
  achievementPercent: number | null;
  status: TargetStatus;
};

export type MonthTargets = {
  year: number;
  month: number;
  scope: 'all' | 'overall';
  overall: TargetProgress;
  companies: TargetProgress[];
};

export type Target = {
  id: string;
  year: number;
  month: number;
  company: string | null;
  scope: 'overall' | 'company';
  targetAmount: number;
};

// A month's targets alongside what was achieved. Achieved, remaining,
// achievement % and status are computed by the backend from the same
// definition of a valid sale Sales Reports use.
export function getTargets({ year, month, scope = 'all' }: { year: number; month: number; scope?: 'all' | 'overall' }): Promise<MonthTargets> {
  const query = new URLSearchParams({ year: String(year), month: String(month), scope });
  return apiClient.get(`/targets?${query.toString()}`);
}

// Sets the target for a month and scope, creating it if it doesn't exist.
// `company` null means the month's overall target.
export function setTarget(input: { year: number; month: number; company: string | null; targetAmount: number }): Promise<{ target: Target }> {
  return apiClient.put('/targets', input);
}

export function deleteTarget(id: string): Promise<{ target: Target }> {
  return apiClient.delete(`/targets/${id}`);
}
