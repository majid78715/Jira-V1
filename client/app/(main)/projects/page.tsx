"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Input } from "../../../components/ui/Input";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { formatNumber } from "../../../lib/format";
import { Company, Project } from "../../../lib/types";
import { isProjectMine, canUserEditProject } from "../../../lib/projectAccess";
import { ProjectFormDrawer } from "../../../components/projects/ProjectFormDrawer";
import { ProjectCreateWizard } from "../../../components/projects/ProjectCreateWizard";
import { ProjectWorkspace, ProjectDetailData } from "../../../components/projects/ProjectWorkspace";

export default function ProjectsPage() {
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Company[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    ownerId: "",
    vendorId: "",
    health: "",
    dateFrom: "",
    dateTo: ""
  });
  const [showFilters, setShowFilters] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [projectScope, setProjectScope] = useState<"mine" | "all">("mine");
  const [autoOpenTaskForm, setAutoOpenTaskForm] = useState(false);
  const hasProjects = projects.length > 0;

  const loadProjects = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const response = await apiRequest<{ projects: Project[] }>("/projects");
      setProjects(response.projects ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load projects.");
      setProjects([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadVendors = useCallback(async () => {
    try {
      const response = await apiRequest<{ companies: Company[] }>("/companies");
      setVendors(response.companies?.filter((company) => company.type === "VENDOR") ?? []);
    } catch {
      setVendors([]);
    }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await apiRequest<ProjectDetailData>(`/projects/${projectId}`);
      setDetail(response);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load project details.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      setSelectedProjectId(projectId);
      await loadDetail(projectId);
    },
    [loadDetail]
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadProjects();
    void loadVendors();
  }, [user, loadProjects, loadVendors]);

  const isScopedUser = user?.role === "PM" || user?.role === "PROJECT_MANAGER";
  // Project Managers are forced to see only their projects
  const activeScope: "mine" | "all" = user?.role === "PROJECT_MANAGER" ? "mine" : (isScopedUser ? projectScope : "all");
  const canCreateProject = user?.permittedModules?.includes("createProject") ?? false;

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (activeScope === "mine" && !isProjectMine(project, user)) {
        return false;
      }
      if (filters.status && project.status !== filters.status) {
        return false;
      }
      if (filters.ownerId && project.ownerId !== filters.ownerId) {
        return false;
      }
      if (filters.vendorId && !project.vendorCompanyIds.includes(filters.vendorId)) {
        return false;
      }
      if (filters.health && project.health !== filters.health) {
        return false;
      }
      if (filters.dateFrom && project.startDate && project.startDate < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && project.endDate && project.endDate > filters.dateTo) {
        return false;
      }
      return true;
    });
  }, [projects, filters, activeScope, user]);

  useEffect(() => {
    if (!filteredProjects.length) {
      setDetail((prev) => (prev === null ? prev : null));
      setSelectedProjectId((prev) => (prev === null ? prev : null));
      return;
    }

    const selectionStillVisible = selectedProjectId
      ? filteredProjects.some((project) => project.id === selectedProjectId)
      : false;

    if (selectionStillVisible) {
      return;
    }

    const fallbackProjectId = filteredProjects[0]?.id;
    if (fallbackProjectId) {
      void handleSelectProject(fallbackProjectId);
    }
  }, [filteredProjects, selectedProjectId, handleSelectProject]);

  const summary = useMemo(() => {
    const active = filteredProjects.filter((project) => project.status === "ACTIVE").length;
    const onHold = filteredProjects.filter((project) => project.status === "ON_HOLD").length;
    const completed = filteredProjects.filter((project) => project.status === "COMPLETED").length;
    const totalBudget = filteredProjects.reduce((sum, project) => sum + project.budgetHours, 0);
    const totalLogged = filteredProjects.reduce((sum, project) => sum + (project.metrics?.hoursLogged ?? 0), 0);
    return { active, onHold, completed, totalBudget, totalLogged };
  }, [filteredProjects]);

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const activeProjectForPermissions = detail?.project ?? selectedProject;
  const canEditSelectedProject = canUserEditProject(activeProjectForPermissions, user);

  const handleOpenDrawer = (mode: "create" | "edit", project?: Project) => {
    setDrawerMode(mode);
    setEditingProject(project);
    setDrawerOpen(true);
  };

  const handleProjectSaved = async (saved: Project) => {
    await loadProjects();
    if (saved.id) {
      await handleSelectProject(saved.id);
    }
    setDrawerOpen(false);
  };

  const handleProjectCreated = async (project: Project) => {
    await loadProjects();
    if (project.id) {
      setAutoOpenTaskForm(true);
      await handleSelectProject(project.id);
    }
    setWizardOpen(false);
  };

  const handleProjectDeleted = async () => {
    setDetail(null);
    await loadProjects();
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  return (
    <PageShell
      title="Projects"
      subtitle="Portfolio budget, vendor coordination and delivery tracking."
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Summary</p>
          <p className="text-sm text-ink-500">
            Active: {summary.active} | On hold: {summary.onHold} | Completed: {summary.completed} | Budget:{" "}
            {formatNumber(summary.totalBudget)}h | Logged: {formatNumber(summary.totalLogged)}h
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setShowFilters((prev) => !prev)}>
            Filters
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="mt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}>
              <option value="">All</option>
              {["PROPOSED", "IN_PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Owner" value={filters.ownerId} onChange={(value) => setFilters((prev) => ({ ...prev, ownerId: value }))}>
              <option value="">All</option>
              {projects.map((project) => (
                <option key={project.id} value={project.ownerId}>
                  {project.owner?.profile.firstName} {project.owner?.profile.lastName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Vendor"
              value={filters.vendorId}
              onChange={(value) => setFilters((prev) => ({ ...prev, vendorId: value }))}
            >
              <option value="">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Health"
              value={filters.health}
              onChange={(value) => setFilters((prev) => ({ ...prev, health: value }))}
            >
              <option value="">All</option>
              {["GREEN", "AMBER", "RED"].map((health) => (
                <option key={health} value={health}>
                  {humanize(health)}
                </option>
              ))}
            </FilterSelect>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Start after</label>
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Finish before</label>
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
            </div>
          </div>
        </Card>
      )}

      {!hasProjects && !loadingList && (
        <Card className="mt-6 flex flex-col gap-4 rounded-2xl border-dashed border-ink-200 bg-ink-25 p-6 text-center">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Projects workspace</p>
            <p className="text-lg font-semibold text-ink-900">You don&apos;t have any projects yet</p>
            <p className="text-sm text-ink-500">
              Create your first project to walk through the package workflow and unlock the project manager stage.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {canCreateProject && (
              <Button type="button" onClick={() => setWizardOpen(true)}>
                + New Project
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setShowFilters(false)}>
              Hide filters
            </Button>
          </div>
        </Card>
      )}

      {hasProjects && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
          <ProjectListPanel
            loading={loadingList}
            projects={filteredProjects}
            selectedProjectId={selectedProjectId}
            onSelect={(projectId) => {
              setAutoOpenTaskForm(false);
              void handleSelectProject(projectId);
            }}
            onCreate={() => setWizardOpen(true)}
            isScopedUser={isScopedUser}
            projectScope={projectScope}
            setProjectScope={setProjectScope}
            user={user}
            canCreateProject={canCreateProject}
          />
          <div className="space-y-4">
            <ProjectWorkspace
              detail={detail}
              loading={detailLoading}
              currentUser={user}
              onRefresh={async () => {
                if (detail) {
                  await loadDetail(detail.project.id);
                  await loadProjects();
                }
              }}
              onEditProject={(project) => handleOpenDrawer("edit", project)}
              onDeleted={handleProjectDeleted}
              canEdit={canEditSelectedProject}
              initialOpenTaskForm={autoOpenTaskForm}
              onAutoOpenHandled={() => setAutoOpenTaskForm(false)}
            />
          </div>
        </div>
      )}

      {drawerOpen && (
        <ProjectFormDrawer
          open={drawerOpen}
          mode={drawerMode}
          project={drawerMode === "edit" ? editingProject : undefined}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleProjectSaved}
          vendors={vendors}
          currentUser={user}
        />
      )}
      <ProjectCreateWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={handleProjectCreated} />
    </PageShell>
  );
}

function ProjectListPanel({
  loading,
  projects,
  selectedProjectId,
  onSelect,
  onCreate,
  isScopedUser,
  projectScope,
  setProjectScope,
  user,
  canCreateProject
}: {
  loading: boolean;
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void | Promise<void>;
  onCreate: () => void;
  isScopedUser: boolean;
  projectScope: "mine" | "all";
  setProjectScope: (scope: "mine" | "all") => void;
  user: any;
  canCreateProject: boolean;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Projects</p>
          <p className="text-sm text-ink-500">Select a project to see its tasks and workflow.</p>
        </div>
        {canCreateProject && (
          <Button type="button" variant="ghost" onClick={onCreate}>
            + New Project
          </Button>
        )}
      </div>

      {isScopedUser && user?.role !== "PROJECT_MANAGER" && (
        <div className="flex w-full items-center gap-1 rounded-lg border border-ink-100 bg-ink-50 p-1 text-xs font-semibold uppercase tracking-wide">
          <button
            type="button"
            onClick={() => setProjectScope("mine")}
            className={`flex-1 rounded-md py-1.5 text-center transition ${
              projectScope === "mine" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
            }`}
          >
            My projects
          </button>
          <button
            type="button"
            onClick={() => setProjectScope("all")}
            className={`flex-1 rounded-md py-1.5 text-center transition ${
              projectScope === "all" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
            }`}
          >
            All projects
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-ink-500">Loading project list...</p>}
      {!loading && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-25 p-4 text-sm text-ink-500">
          <p className="font-medium text-ink-600">No projects match your filters or scope.</p>
          <p className="text-xs">Try adjusting filters or switch tabs to see more projects.</p>
        </div>
      )}
      {!loading && projects.length > 0 && (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => void onSelect(project.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 ${
                  selectedProjectId === project.id
                    ? project.status === "ACTIVE"
                      ? "border-emerald-500 bg-emerald-100"
                      : "border-brand-200 bg-brand-gradient/5"
                    : project.status === "ACTIVE"
                    ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300"
                    : "border-ink-100 bg-white hover:border-brand-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{project.name}</p>
                    <p className="text-xs text-ink-500">
                      {project.code}
                      {project.owner?.profile.firstName || project.owner?.profile.lastName
                        ? ` | Owner ${project.owner?.profile.firstName ?? ""} ${project.owner?.profile.lastName ?? ""}`
                        : ""}
                    </p>
                    <p className="mt-2 text-xs text-ink-600">{formatProjectDescription(project.description)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-ink-400">Tasks</p>
                    <p className="text-lg font-semibold text-ink-900">{project.metrics?.totalTasks ?? 0}</p>
                    <p className="text-xs text-ink-500">{Math.round(project.metrics?.progressPercent ?? 0)}% ready</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function formatProjectDescription(description?: string | null) {
  const normalized = description?.trim();
  if (!normalized) {
    return "No description provided.";
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1">
        {children}
      </Select>
    </label>
  );
}

function humanize(value?: string | null) {
  const normalized = value?.toString().trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
