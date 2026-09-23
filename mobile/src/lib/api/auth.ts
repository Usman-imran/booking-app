import apiClient from './client';

export type PublicUser = {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  companyName: string | null;
  // The line printed under the company name on receipts; null = default.
  tagline: string | null;
  // 'pro' while the subscription is paid up (proUntil in the future).
  plan: 'free' | 'pro';
  proUntil: string | null;
  // The receipt logo as a data URI; only ever set while the plan is Pro.
  logo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AuthResponse = { token: string; user: PublicUser };

export function login(username: string, password: string): Promise<AuthResponse> {
  return apiClient.post('/auth/login', { username, password });
}

export function register(input: {
  name: string;
  username: string;
  password: string;
  companyName: string;
  tagline?: string;
  phone?: string;
}): Promise<AuthResponse> {
  return apiClient.post('/auth/register', input);
}

export function me(): Promise<{ user: PublicUser }> {
  return apiClient.get('/auth/me');
}

// Renames the business and sets its receipt tagline, for the signed-in
// account only. An empty tagline clears it. Returns the refreshed user.
export function updateCompanyProfile(input: { companyName: string; tagline?: string | null }): Promise<{ user: PublicUser }> {
  return apiClient.put('/auth/company', input);
}

// Sets the receipt logo (a data URI), or removes it with null. Pro only:
// a Free account gets a 402. Returns the refreshed user.
export function updateLogo(logo: string | null): Promise<{ user: PublicUser }> {
  return apiClient.put('/auth/logo', { logo });
}

export type PlanSummary = {
  plan: 'free' | 'pro';
  proUntil: string | null;
  // null = unlimited (Pro).
  dailyOrderLimit: number | null;
  ordersToday: number;
  // When ordersToday next goes back to zero (midnight, Pakistan time).
  resetsAt: string;
};

// The account's plan and how much of today's allowance it has used.
export function getPlan(): Promise<PlanSummary> {
  return apiClient.get('/auth/plan');
}
