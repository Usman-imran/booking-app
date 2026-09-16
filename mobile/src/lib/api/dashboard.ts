import apiClient from './client';

export type DashboardData = {
  date: string;
  year: number;
  month: number;
  today: { orders: number; sales: number };
  monthly: { orders: number; sales: number };
  target: {
    id: number | null;
    targetAmount: number;
    achieved: number;
    remaining: number;
    achievementPercent: number;
    status: 'achieved' | 'in-progress' | 'not-started' | 'no-target';
  };
  draftOrders: number;
  recentOrders: {
    id: number;
    orderNumber: string;
    submittedAt: string | null;
    status: string;
    total: number;
    customer: { name: string; code: string };
  }[];
};

export function getDashboard(): Promise<DashboardData> {
  return apiClient.get('/dashboard');
}
