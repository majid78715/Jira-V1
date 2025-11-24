"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { apiRequest, ApiError } from "../../../../lib/apiClient";

const initialProfile = {
  firstName: "",
  lastName: "",
  country: "",
  city: "",
  timeZone: "",
  title: ""
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(initialProfile);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof typeof profile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatusMessage(null);
    try {
      await apiRequest<{ user: unknown }>("/auth/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ token, password, profile })
      });
      setStatusMessage("Invitation accepted! A PM will review your profile soon.");
      setProfile(initialProfile);
      setToken("");
      setPassword("");
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-10 shadow-card">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            Invitation onboarding
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ink-900">Complete your profile</h1>
          <p className="text-sm text-ink-500">Provide full profile details for PM approval.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">Invitation Token</label>
              <Input value={token} onChange={(e) => setToken(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">First name</label>
              <Input value={profile.firstName} onChange={(e) => handleChange("firstName", e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Last name</label>
              <Input value={profile.lastName} onChange={(e) => handleChange("lastName", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">Country (ISO-2)</label>
              <Input value={profile.country} onChange={(e) => handleChange("country", e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">City</label>
              <Input value={profile.city} onChange={(e) => handleChange("city", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">Time Zone</label>
              <Input value={profile.timeZone} onChange={(e) => handleChange("timeZone", e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Title</label>
            <Input value={profile.title} onChange={(e) => handleChange("title", e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {statusMessage && <p className="text-sm text-brand-700">{statusMessage}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit for approval"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Already approved?{" "}
          <Link href="/login" className="text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
