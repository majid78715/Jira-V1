"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import { Table } from "../../../../components/ui/Table";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { PermissionModule, Role, RolePermission } from "../../../../lib/types";

const MODULES: Array<{ id: PermissionModule; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "projects", label: "Projects" },
  { id: "tasks", label: "Tasks" },
  { id: "notifications", label: "Notifications" },
  { id: "teamDevelopers", label: "Developers" },
  { id: "approvals", label: "Approvals" },
  { id: "alerts", label: "Alerts" },
  { id: "reports", label: "Reports" },
  { id: "chat", label: "Chat" },
  { id: "settings", label: "Settings" },
  { id: "admin", label: "Admin" },
  { id: "adminHolidays", label: "Company Holidays" },
  { id: "personas", label: "Personas" }
];

const ROLES: Role[] = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"];

type RolePermissionMap = Record<Role, Set<PermissionModule>>;

const toSet = (modules: PermissionModule[] = []): Set<PermissionModule> => new Set(modules);

export default function RolePermissionsPage() {
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login", requiredRoles: ["SUPER_ADMIN"] });
  const [permissions, setPermissions] = useState<RolePermissionMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<{ rolePermissions: RolePermission[] }>("/admin/role-permissions");
      const map: Partial<RolePermissionMap> = {};
      ROLES.forEach((role) => {
        const record = response.rolePermissions.find((entry) => entry.role === role);
        map[role] = toSet(record?.modules ?? []);
      });
      setPermissions(map as RolePermissionMap);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.message ?? "Unable to load role permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPermissions();
  }, []);

  const handleToggle = (role: Role, module: PermissionModule) => {
    setPermissions((prev) => {
      if (!prev) return prev;
      const next = new Set(prev[role] ?? []);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return { ...prev, [role]: next } as RolePermissionMap;
    });
  };

  const handleSave = async (role: Role) => {
    if (!permissions) return;
    setSavingRole(role);
    setInfoMessage(null);
    setError(null);
    try {
      const modules = Array.from(permissions[role] ?? []);
      const response = await apiRequest<{ rolePermission: RolePermission }>("/admin/role-permissions", {
        method: "POST",
        body: JSON.stringify({ role, modules })
      });
      setPermissions((prev) => {
        if (!prev) return prev;
        return { ...prev, [role]: toSet(response.rolePermission.modules) } as RolePermissionMap;
      });
      setInfoMessage(`${role} permissions saved.`);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.message ?? "Unable to save permissions.");
    } finally {
      setSavingRole(null);
    }
  };

  const tableBody = useMemo(() => {
    if (!permissions) return null;
    return ROLES.map((role) => {
      const allocated = permissions[role] ?? new Set<PermissionModule>();
      return (
        <tr key={role} className="border-b border-ink-100">
          <td className="px-4 py-3 text-sm font-semibold text-ink-900">
            <div className="flex items-center gap-2">
              <Badge label={role.replace(/_/g, " ")} />
            </div>
          </td>
          {MODULES.map((module) => (
            <td key={module.id} className="px-4 py-3 text-center">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                checked={allocated.has(module.id)}
                onChange={() => handleToggle(role, module.id)}
              />
            </td>
          ))}
          <td className="px-4 py-3 text-right">
            <Button type="button" variant="secondary" disabled={savingRole === role || loading} onClick={() => handleSave(role)}>
              {savingRole === role ? "Saving..." : "Save"}
            </Button>
          </td>
        </tr>
      );
    });
  }, [permissions, savingRole, loading]);

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading...</div>;
  }

  return (
    <PageShell
      title="Role permissions"
      subtitle="Super admins can fine-tune which modules each role can access. Changes take effect immediately across the workspace."
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="space-y-6">
        <Card
          title="Access matrix"
          helperText="Toggle modules per role. Backend RBAC still enforces route protection; this controls UI and workspace entry points."
        >
          {loading ? (
            <p className="text-sm text-ink-500">Loading permissions...</p>
          ) : error ? (
            <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <span>{error}</span>
              <Button type="button" variant="secondary" onClick={() => void loadPermissions()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Role</th>
                    {MODULES.map((module) => (
                      <th key={module.id} className="px-4 py-3 text-center">
                        {module.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-sm text-ink-800">{tableBody}</tbody>
              </Table>
            </div>
          )}
          {infoMessage && <p className="mt-3 text-sm text-emerald-600">{infoMessage}</p>}
        </Card>
      </div>
    </PageShell>
  );
}
