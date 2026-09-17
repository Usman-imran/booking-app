import apiClient from './client';

export type PublicUser = {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  companyName: string | null;
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
  phone?: string;
}): Promise<AuthResponse> {
  return apiClient.post('/auth/register', input);
}

export function me(): Promise<{ user: PublicUser }> {
  return apiClient.get('/auth/me');
}

// Renames the business for the signed-in account only. Returns the
// refreshed user.
export function updateCompanyName(companyName: string): Promise<{ user: PublicUser }> {
  return apiClient.put('/auth/company', { companyName });
}
