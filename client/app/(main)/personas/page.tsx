"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../lib/apiClient";
import { PageShell } from "../../../components/layout/PageShell";
import { Role, UserDirectoryEntry } from "../../../lib/types";
import { useCurrentUser } from "../../../hooks/useCurrentUser";

export default function PersonasPage() {
  const router = useRouter();
  const { user } = useCurrentUser({ redirectTo: "/login" });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<UserDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const response = await apiRequest<{ users: UserDirectoryEntry[] }>("/users");
        setPersonas(response.users);
      } catch (error) {
        console.error("Failed to fetch personas", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, []);

  const handleSwitch = async (persona: UserDirectoryEntry) => {
    setLoadingId(persona.id);
    try {
      await apiRequest("/auth/impersonate", {
        method: "POST",
        body: JSON.stringify({ userId: persona.id })
      });
      // Force a hard reload to ensure all state/context is reset
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Failed to switch persona", error);
      setLoadingId(null);
      alert("Failed to switch persona. Please try again.");
    }
  };

  return (
    <PageShell 
      title="Test Personas" 
      subtitle="Switch between different user roles for testing."
      currentUser={user}
    >
      {loading ? (
        <div className="text-center text-ink-500">Loading personas...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="flex flex-col rounded-xl border border-ink-100 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-600">
                  {persona.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900">{persona.name}</h3>
                  <span className="inline-flex items-center rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-600">
                    {persona.role}
                  </span>
                </div>
              </div>
              
              <p className="mb-6 text-sm text-ink-500">{persona.title || "No title"}</p>
              <p className="mb-6 text-xs text-ink-400 font-mono">{persona.email}</p>

              <button
                onClick={() => handleSwitch(persona)}
                disabled={loadingId !== null}
                className="mt-auto w-full rounded-lg bg-white border border-ink-200 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50 disabled:opacity-50"
              >
                {loadingId === persona.id ? "Switching..." : "Switch to Persona"}
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
