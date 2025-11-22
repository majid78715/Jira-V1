"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";
import { Role, User } from "../lib/types";

interface UseCurrentUserOptions {
  redirectTo?: string;
  requiredRoles?: Role[];
}

interface UseCurrentUserResult {
  user: User | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCurrentUser(options: UseCurrentUserOptions = {}): UseCurrentUserResult {
  const { redirectTo, requiredRoles } = options;
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstLoginPath = "/settings/first-login-password-change";

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ user: User }>(`/auth/me?t=${Date.now()}`);
      setUser(response.user);
    } catch (err) {
      const apiError = err as ApiError;
      setUser(null);
      setError(apiError?.message ?? "Unable to fetch user.");
      if (apiError?.status === 401 && redirectTo) {
        router.replace(redirectTo);
      }
    } finally {
      setLoading(false);
    }
  }, [redirectTo, router]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (user?.firstLoginRequired) {
      if (pathname !== firstLoginPath) {
        router.replace(firstLoginPath);
      }
      return;
    }
    if (!requiredRoles?.length) {
      return;
    }
    if (!user && redirectTo) {
      router.replace(redirectTo);
      return;
    }
    if (user && requiredRoles && !requiredRoles.includes(user.role)) {
      const fallback = redirectTo ?? "/dashboard";
      router.replace(fallback);
      setError("Insufficient permissions.");
    }
  }, [user, loading, requiredRoles, redirectTo, router, pathname, firstLoginPath]);

  return { user, loading, error, refresh: fetchUser };
}
