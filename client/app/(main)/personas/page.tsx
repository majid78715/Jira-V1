"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../lib/apiClient";
import { PageShell } from "../../../components/layout/PageShell";
import { Role } from "../../../lib/types";
import { useCurrentUser } from "../../../hooks/useCurrentUser";

interface Persona {
  id: string;
  name: string;
  role: Role;
  email: string;
  description?: string;
}

const PERSONAS: Persona[] = [
  {
    id: "test-admin",
    name: "Test Admin",
    role: "SUPER_ADMIN",
    email: "test-admin@humain.local",
    description: "Full access to all features."
  },
  {
    id: "test-pm",
    name: "Test Product Manager",
    role: "PM",
    email: "test-pm@humain.local",
    description: "Manages products and roadmaps."
  },
  {
    id: "test-pjm",
    name: "Test Project Manager",
    role: "PROJECT_MANAGER",
    email: "test-pjm@humain.local",
    description: "Oversees project execution."
  },
  {
    id: "test-dev",
    name: "Test Developer",
    role: "DEVELOPER",
    email: "test-dev@humain.local",
    description: "Works on tasks and code."
  },
  {
    id: "user-super-admin",
    name: "Ada Steward",
    role: "SUPER_ADMIN",
    email: "super@humain.local",
    description: "Existing Super Admin"
  },
  {
    id: "user-vp-1",
    name: "Miguel Sanders",
    role: "VP",
    email: "vp@humain.local",
    description: "VP of Delivery"
  },
  {
    id: "user-pm-1",
    name: "Priya Malhotra",
    role: "PM",
    email: "pm@humain.local",
    description: "Existing Program Manager"
  },
  {
    id: "user-eng-1",
    name: "Luis Garcia",
    role: "ENGINEER",
    email: "eng@humain.local",
    description: "Lead Engineer"
  }
];

export default function PersonasPage() {
  const router = useRouter();
  const { user } = useCurrentUser({ redirectTo: "/login" });
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSwitch = async (persona: Persona) => {
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PERSONAS.map((persona) => (
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
            
            <p className="mb-6 text-sm text-ink-500">{persona.description}</p>
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
    </PageShell>
  );
}
