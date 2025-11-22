"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { apiRequest, ApiError } from "../../../lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ user: unknown; firstLoginRequired?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (response.firstLoginRequired) {
        router.push("/settings/first-login-password-change");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            HUMAIN Console
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ink-900">Sign in to continue</h1>
          <p className="text-sm text-ink-500">Professional B2B workspace</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium text-ink-700">Email</label>
            <Input
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Password</label>
            <Input
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Continue"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Need a workspace?{" "}
          <Link href="/" className="text-brand-600 hover:text-brand-700">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
