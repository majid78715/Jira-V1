"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Company, Project } from "../../../../lib/types";
import { canUserEditProject } from "../../../../lib/projectAccess";
import { ProjectWorkspace, ProjectDetailData } from "../../../../components/projects/ProjectWorkspace";
import { ProjectFormDrawer } from "../../../../components/projects/ProjectFormDrawer";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });
  const [detail, setDetail] = useState<ProjectDetailData | null>(null);
  const [vendors, setVendors] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canEdit = detail ? canUserEditProject(detail.project, user) : false;

  const loadDetail = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<ProjectDetailData>(`/projects/${projectId}`);
      setDetail(response);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load project.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !user) {
      return;
    }
    void loadDetail();
  }, [user, projectId, loadDetail]);

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const response = await apiRequest<{ companies: Company[] }>("/companies");
        setVendors(response.companies?.filter((company) => company.type === "VENDOR") ?? []);
      } catch {
        setVendors([]);
      }
    };
    void loadCompanies();
  }, []);

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  if (!projectId) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Project ID missing.</div>;
  }

  return (
    <PageShell
      title="Project Detail"
      subtitle="Master detail workspace for delivery teams."
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Project</p>
          <h1 className="text-2xl font-semibold text-ink-900">{detail?.project.name ?? "Loading…"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setDrawerOpen(true)} disabled={!detail || !canEdit}>
            Edit Project
          </Button>
          <Button type="button" onClick={() => void loadDetail()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="mt-6">
        {loading && <p className="text-sm text-ink-500">Loading project workspace…</p>}
        {!loading && detail && (
          <ProjectWorkspace
            detail={detail}
            loading={false}
            currentUser={user}
            onRefresh={loadDetail}
            onEditProject={canEdit ? () => setDrawerOpen(true) : undefined}
            canEdit={canEdit}
          />
        )}
        {!loading && !detail && <p className="text-sm text-ink-500">Project not found.</p>}
      </Card>

      {detail && drawerOpen && canEdit && (
        <ProjectFormDrawer
          open={drawerOpen}
          mode="edit"
          project={detail.project as Project}
          onClose={() => setDrawerOpen(false)}
          onSaved={(project) => {
            setDrawerOpen(false);
            void loadDetail();
          }}
          vendors={vendors}
          currentUser={user}
        />
      )}
    </PageShell>
  );
}
