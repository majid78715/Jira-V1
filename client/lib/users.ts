import { apiRequest } from "./apiClient";
import { Role, UserDirectoryEntry } from "./types";

export type UserDirectoryFilters = {
  role?: Role | "";
  country?: string;
  city?: string;
  timeZone?: string;
  query?: string;
};

export async function fetchUserDirectory(filters: UserDirectoryFilters): Promise<UserDirectoryEntry[]> {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.country) params.set("country", filters.country);
  if (filters.city) params.set("city", filters.city);
  if (filters.timeZone) params.set("timeZone", filters.timeZone);
  if (filters.query) params.set("q", filters.query);
  const response = await apiRequest<{ users: UserDirectoryEntry[] }>(`/users?${params.toString()}`);
  return response.users;
}
