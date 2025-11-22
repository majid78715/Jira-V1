"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Button } from "../../../../components/ui/Button";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { User } from "../../../../lib/types";

export default function FirstLoginPasswordChangePage() {
  const router = useRouter();
  const { user, loading, refresh } = useCurrentUser({ redirectTo: "/login" });
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (!loading && user && !user.firstLoginRequired) {
      router.replace("/settings");
    }
  }, [user, loading, router]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    setStatusTone(null);
    try {
      await apiRequest<{ user: User }>("/auth/change-password-first-login", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setStatusTone("success");
      setStatus("Password updated. Redirecting...");
      await refresh();
      router.push("/dashboard");
    } catch (error) {
      const apiError = error as ApiError;
      setStatusTone("error");
      setStatus(apiError?.message ?? "Unable to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  return (
    <PageShell
      title="Change Default Password"
      subtitle="Complete your first login setup"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUserId={user.id}
      currentUser={user}
    >
      <div className="mx-auto max-w-2xl">
        <Card
          title="Secure your account"
          helperText="Use the default password once, set a new secure password, and continue to the console."
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Current password</label>
              <Input
                type="password"
                required
                placeholder="Enter default password 12124545"
                value={form.currentPassword}
                onChange={(event) => handleChange("currentPassword", event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">New password</label>
              <Input
                type="password"
                required
                value={form.newPassword}
                onChange={(event) => handleChange("newPassword", event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Confirm new password</label>
              <Input
                type="password"
                required
                value={form.confirmNewPassword}
                onChange={(event) => handleChange("confirmNewPassword", event.target.value)}
              />
            </div>
            {status && (
              <p className={statusTone === "error" ? "text-sm text-red-600" : "text-sm text-ink-600"}>{status}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
