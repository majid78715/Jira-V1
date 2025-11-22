"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Company, Invitation, Project, User, UserDirectoryEntry } from "../../../../lib/types";
import { formatShortDate } from "../../../../lib/format";

type ManagerSummary = {
  id: string;
  name: string;
  email?: string;
  companyName: string;
  totalProjects: number;
  activeProjects: number;
  lastActivity?: string | null;
};

type ManagerInfo = {
  id: string;
  name: string;
  email?: string;
  companyId?: string;
};

type ProjectAssignmentRow = {
  id: string;
  name: string;
  status: Project["status"];
  health: Project["health"];
  companyName: string;
  managerName: string;
  managerEmail?: string;
  updatedAt: string;
  assigned: boolean;
};

type StatusMessage = { tone: "success" | "error"; message: string };

const STATUS_TONE: Record<Project["status"], "success" | "warning" | "neutral"> = {
  PROPOSED: "neutral",
  IN_PLANNING: "neutral",
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
  CANCELLED: "warning"
};

const HEALTH_TONE: Record<Project["health"], "success" | "warning" | "neutral"> = {
  GREEN: "success",
  AMBER: "warning",
  RED: "warning"
};

const INVITE_FORM_DEFAULTS = {
  email: "",
  firstName: "",
  lastName: "",
  companyId: ""
};

export default function AdminProjectManagersPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectManagerRoster, setProjectManagerRoster] = useState<User[]>([]);
  const [projectManagerInvitations, setProjectManagerInvitations] = useState<Invitation[]>([]);
  const [inviteForm, setInviteForm] = useState(INVITE_FORM_DEFAULTS);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [managerFeedback, setManagerFeedback] = useState<StatusMessage | null>(null);
  const [deletingManagerId, setDeletingManagerId] = useState<string | null>(null);
  const canRemoveManagers = user?.role === "SUPER_ADMIN";

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [projectResponse, companyResponse, directoryResponse, rosterResponse] = await Promise.all([
        apiRequest<{ projects: Project[] }>("/projects"),
        apiRequest<{ companies: Company[] }>("/companies"),
        apiRequest<{ users: UserDirectoryEntry[] }>("/users"),
        apiRequest<{ users: User[]; invitations: Invitation[] }>("/team/project-managers")
      ]);
      setProjects(projectResponse.projects ?? []);
      setCompanies(companyResponse.companies ?? []);
      setDirectory(directoryResponse.users ?? []);
      setProjectManagerRoster(rosterResponse.users ?? []);
      setProjectManagerInvitations(rosterResponse.invitations ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setProjects([]);
      setCompanies([]);
      setDirectory([]);
      setProjectManagerRoster([]);
      setProjectManagerInvitations([]);
      setError(apiError?.message ?? "Unable to load project managers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadData();
  }, [user, loadData]);

  const companyLookup = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const directoryLookup = useMemo(() => new Map(directory.map((entry) => [entry.id, entry])), [directory]);

  const managerSummaries = useMemo<ManagerSummary[]>(() => {
    const map = new Map<string, ManagerSummary>();
    projects.forEach((project) => {
      const info = resolveManagerInfo(project, directoryLookup);
      if (!info) {
        return;
      }
      const vendorName =
        (info.companyId && companyLookup.get(info.companyId)) ??
        (project.primaryVendorId && companyLookup.get(project.primaryVendorId)) ??
        (project.vendorCompanyIds[0] && companyLookup.get(project.vendorCompanyIds[0])) ??
        "Vendor TBD";
      if (!map.has(info.id)) {
        map.set(info.id, {
          id: info.id,
          name: info.name,
          email: info.email,
          companyName: vendorName,
          totalProjects: 0,
          activeProjects: 0,
          lastActivity: null
        });
      }
      const summary = map.get(info.id)!;
      summary.totalProjects += 1;
      if (project.status === "ACTIVE") {
        summary.activeProjects += 1;
      }
      if (!summary.lastActivity || summary.lastActivity < project.updatedAt) {
        summary.lastActivity = project.updatedAt;
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (b.totalProjects === a.totalProjects) {
        return a.name.localeCompare(b.name);
      }
      return b.totalProjects - a.totalProjects;
    });
  }, [projects, companyLookup, directoryLookup]);

  const assignmentRows = useMemo<ProjectAssignmentRow[]>(() => {
    return projects
      .map((project) => {
        const info = resolveManagerInfo(project, directoryLookup);
        const companyName =
          (info?.companyId && companyLookup.get(info.companyId)) ??
          (project.primaryVendorId && companyLookup.get(project.primaryVendorId)) ??
          (project.vendorCompanyIds[0] && companyLookup.get(project.vendorCompanyIds[0])) ??
          "Internal";
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          health: project.health,
          companyName,
          managerName: info?.name ?? "Unassigned",
          managerEmail: info?.email,
          updatedAt: project.updatedAt,
          assigned: Boolean(info)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, companyLookup, directoryLookup]);

  const totalProjects = projects.length;
  const assignedProjects = assignmentRows.filter((row) => row.assigned).length;
  const unassignedProjects = totalProjects - assignedProjects;
  const activeProjects = projects.filter((project) => project.status === "ACTIVE").length;
  const vendorsRepresented = new Set(managerSummaries.map((summary) => summary.companyName)).size;
  const heaviestLoad = managerSummaries.reduce((max, summary) => Math.max(max, summary.totalProjects), 0);
  const medianCoverage = medianProjectsPerManager(managerSummaries);

  const handleInviteChange = (field: keyof typeof INVITE_FORM_DEFAULTS, value: string) => {
    setInviteForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.companyId) {
      setInviteStatus("Select a vendor company for the invite.");
      return;
    }
    setInviteSubmitting(true);
    setInviteStatus(null);
    try {
      await apiRequest<{ invitation: Invitation }>("/invitations/project-manager", {
        method: "POST",
        body: JSON.stringify(inviteForm)
      });
      setInviteStatus("Project manager invite sent.");
      setInviteForm(INVITE_FORM_DEFAULTS);
      await loadData();
    } catch (err) {
      const apiError = err as ApiError;
      setInviteStatus(apiError?.message ?? "Unable to send invite.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleDeleteManager = async (managerId: string) => {
    if (!canRemoveManagers) {
      setManagerFeedback({ tone: "error", message: "Only super admins can remove project managers." });
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("Remove this project manager? They can be invited again later.")) {
      return;
    }
    setDeletingManagerId(managerId);
    setManagerFeedback(null);
    try {
      await apiRequest(`/admin/users/${managerId}`, { method: "DELETE" });
      setManagerFeedback({ tone: "success", message: "Project manager deleted." });
      await loadData();
    } catch (err) {
      const apiError = err as ApiError;
      setManagerFeedback({ tone: "error", message: apiError?.message ?? "Unable to delete project manager." });
    } finally {
      setDeletingManagerId(null);
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading...</div>;
  }

  return (
    <PageShell
      title="Admin - Project Managers"
      subtitle="Track vendor-side delivery ownership across the portfolio"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Managers on record" helperText="Unique vendor leads">
          <p className="text-3xl font-semibold text-ink-900">{managerSummaries.length}</p>
          <p className="text-sm text-ink-500">{assignedProjects} assignments across the portfolio.</p>
        </Card>
        <Card title="Active projects" helperText="Currently delivering">
          <p className="text-3xl font-semibold text-ink-900">{activeProjects}</p>
          <p className="text-sm text-ink-500">{totalProjects} total projects</p>
        </Card>
        <Card title="Unassigned projects" helperText="Need project manager coverage">
          <p className="text-3xl font-semibold text-amber-600">{unassignedProjects}</p>
          <p className="text-sm text-ink-500">Assign from the project workspace.</p>
        </Card>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-center justify-between gap-3">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void loadData()} disabled={loading}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Vendor project managers" helperText="Sorted by coverage">
          {loading ? (
            <p className="text-sm text-ink-500">Loading roster...</p>
          ) : (
            <Table
              rows={managerSummaries}
              emptyState="No assigned project managers."
              columns={[
                {
                  header: "Manager",
                  render: (row) => (
                    <div>
                      <p className="font-semibold text-ink-900">{row.name}</p>
                      {row.email && <p className="text-xs text-ink-400">{row.email}</p>}
                    </div>
                  )
                },
                { header: "Vendor", accessor: "companyName" },
                {
                  header: "Projects",
                  accessor: "totalProjects",
                  headerClassName: "text-right",
                  cellClassName: "text-right"
                },
                {
                  header: "Active",
                  accessor: "activeProjects",
                  headerClassName: "text-right",
                  cellClassName: "text-right"
                },
                {
                  header: "Last Activity",
                  render: (row) => (
                    <span className="text-xs text-ink-500">{row.lastActivity ? formatShortDate(row.lastActivity) : "-"}</span>
                  )
                }
              ]}
            />
          )}
        </Card>

        <Card className="lg:col-span-2" title="Assignment insights" helperText="Quick health checks">
          <div className="space-y-4 text-sm text-ink-600">
            <InsightLine label="Projects without a project manager" value={unassignedProjects} />
            <InsightLine label="Median projects per manager" value={medianCoverage} />
            <InsightLine label="Heaviest manager load" value={heaviestLoad} />
            <InsightLine label="Vendors represented" value={vendorsRepresented} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Active project managers" helperText={`${projectManagerRoster.length} active`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading roster...</p>
          ) : (
            <Table
              rows={projectManagerRoster as unknown as Record<string, unknown>[]}
              emptyState="No project managers yet."
              columns={[
                {
                  header: "Name",
                  render: (row) => {
                    const user = row as unknown as User;
                    return (
                      <div>
                        <p className="font-semibold text-ink-900">
                          {user.profile.firstName} {user.profile.lastName}
                        </p>
                        <p className="text-xs text-ink-400">{user.email}</p>
                      </div>
                    );
                  }
                },
                {
                  header: "Company",
                  render: (row) => {
                    const user = row as unknown as User;
                    return companyLookup.get(user.companyId ?? "") ?? "Unassigned";
                  }
                },
                {
                  header: "Status",
                  render: (row) => {
                    const user = row as unknown as User;
                    return (
                      <Badge
                        label={user.profileStatus === "ACTIVE" ? "Active" : user.profileStatus}
                        tone={user.profileStatus === "ACTIVE" ? "success" : "warning"}
                      />
                    );
                  }
                },
                {
                  header: "Actions",
                  render: (row) => {
                    const user = row as unknown as User;
                    if (!canRemoveManagers) {
                      return <span className="text-xs text-ink-400">Super admin only</span>;
                    }
                    return (
                      <Button
                        variant="ghost"
                        onClick={() => handleDeleteManager(user.id)}
                        disabled={deletingManagerId === user.id}
                      >
                        {deletingManagerId === user.id ? "Removing..." : "Remove"}
                      </Button>
                    );
                  }
                }
              ]}
            />
          )}
          {managerFeedback && (
            <p
              className={`mt-3 text-sm ${managerFeedback.tone === "error" ? "text-rose-600" : "text-emerald-600"}`}
            >
              {managerFeedback.message}
            </p>
          )}
        </Card>
        <Card title="Invite project manager" helperText="Vendor-side lead">
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input type="email" value={inviteForm.email} onChange={(e) => handleInviteChange("email", e.target.value)} required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">First name</label>
                <Input value={inviteForm.firstName} onChange={(e) => handleInviteChange("firstName", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Last name</label>
                <Input value={inviteForm.lastName} onChange={(e) => handleInviteChange("lastName", e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Vendor company</label>
              <Select value={inviteForm.companyId} onChange={(e) => handleInviteChange("companyId", e.target.value)} required>
                <option value="">Select vendor</option>
                {companies
                  .filter((company) => company.type === "VENDOR")
                  .map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
              </Select>
            </div>
            {inviteStatus && <p className="text-sm text-ink-500">{inviteStatus}</p>}
            <Button type="submit" className="w-full" disabled={inviteSubmitting}>
              {inviteSubmitting ? "Sending..." : "Send invite"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6" title="Open project manager invitations" helperText={`${projectManagerInvitations.length} invites`}>
        {projectManagerInvitations.length === 0 ? (
          <p className="text-sm text-ink-500">No pending invitations.</p>
        ) : (
          <Table
            rows={projectManagerInvitations as unknown as Record<string, unknown>[]}
            columns={[
              {
                header: "Invitee",
                render: (row) => {
                  const inv = row as unknown as Invitation;
                  return `${inv.firstName} ${inv.lastName}`;
                }
              },
              { header: "Email", accessor: "email" },
              {
                header: "Token",
                render: (row) => {
                  const inv = row as unknown as Invitation;
                  return <span className="font-mono text-xs">{inv.token}</span>;
                }
              },
              {
                header: "Status",
                render: (row) => {
                  const inv = row as unknown as Invitation;
                  return <Badge label={inv.status} tone={inv.status === "SENT" ? "warning" : "success"} />;
                }
              }
            ]}
          />
        )}
      </Card>

      <Card className="mt-6" title="Project assignments" helperText="Live per-project routing">
        {loading ? (
          <p className="text-sm text-ink-500">Loading assignments...</p>
        ) : (
          <Table
            rows={assignmentRows}
            emptyState="No projects available."
            columns={[
              {
                header: "Project",
                render: (row) => (
                  <div>
                    <p className="font-semibold text-ink-900">{row.name}</p>
                    <p className="text-xs text-ink-400">{row.companyName}</p>
                  </div>
                )
              },
              {
                header: "Project Manager",
                render: (row) =>
                  row.assigned ? (
                    <div>
                      <p className="font-medium text-ink-900">{row.managerName}</p>
                      {row.managerEmail && <p className="text-xs text-ink-400">{row.managerEmail}</p>}
                    </div>
                  ) : (
                    <Badge label="Unassigned" tone="warning" />
                  )
              },
              {
                header: "Status",
                render: (row) => <Badge label={row.status} tone={STATUS_TONE[row.status]} />
              },
              {
                header: "Health",
                render: (row) => <Badge label={row.health} tone={HEALTH_TONE[row.health]} />
              },
              {
                header: "Updated",
                render: (row) => <span className="text-xs text-ink-500">{formatShortDate(row.updatedAt)}</span>
              }
            ]}
          />
        )}
      </Card>
    </PageShell>
  );
}

function resolveManagerInfo(project: Project, directoryLookup: Map<string, UserDirectoryEntry>): ManagerInfo | null {
  if (project.deliveryManager) {
    return {
      id: project.deliveryManager.id,
      name: `${project.deliveryManager.profile.firstName} ${project.deliveryManager.profile.lastName}`.trim(),
      email: project.deliveryManager.email,
      companyId: project.deliveryManager.companyId
    };
  }
  if (project.deliveryManagerUserId) {
    const entry = directoryLookup.get(project.deliveryManagerUserId);
    if (entry) {
      return {
        id: entry.id,
        name: entry.name,
        email: entry.email,
        companyId: entry.companyId
      };
    }
  }
  return null;
}

function InsightLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className="text-lg font-semibold text-ink-900">{value.toLocaleString()}</p>
    </div>
  );
}

function medianProjectsPerManager(summaries: ManagerSummary[]): number {
  if (!summaries.length) {
    return 0;
  }
  const counts = summaries.map((summary) => summary.totalProjects).sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  if (counts.length % 2 === 0) {
    return Math.round((counts[middle - 1] + counts[middle]) / 2);
  }
  return counts[middle];
}
