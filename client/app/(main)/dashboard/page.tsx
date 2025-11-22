"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest } from "../../../lib/apiClient";
import { DashboardSummaryPayload } from "../../../lib/types";
import { EnterpriseKPIs } from "../../../components/dashboard/EnterpriseKPIs";
import { EnterpriseCharts } from "../../../components/dashboard/EnterpriseCharts";
import { EnterpriseRisks } from "../../../components/dashboard/EnterpriseRisks";

export default function DashboardPage() {
  const { user } = useCurrentUser({ redirectTo: "/login" });
  const [summary, setSummary] = useState<DashboardSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      // Fetch default summary (last 60 days)
      const response = await apiRequest<{ summary: DashboardSummaryPayload }>("/dashboard/summary?time_granularity=week");
      setSummary(response.summary);
    } catch (error) {
      console.error("Failed to load dashboard", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void fetchSummary();
    }
  }, [user, fetchSummary]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">Loading command center...</div>;
  }

  // Transform data for Enterprise components
  const kpis = summary?.kpi_cards || [];
  const getKpiValue = (id: string) => kpis.find(k => k.id === id)?.primaryValue || "0";

  const activeProjects = parseInt(getKpiValue("active-projects"), 10) || 0;
  const criticalRisks = summary?.task_exceptions_rows.filter(t => t.priority === "CRITICAL").length ?? 0;
  
  // Calculate Utilization from KPI card text
  const utilizationCard = kpis.find(k => k.id === "hours-vs-expected");
  let teamUtilization = 0;
  if (utilizationCard?.secondaryText) {
    const match = utilizationCard.secondaryText.match(/\((\d+)%\)/);
    if (match) teamUtilization = parseInt(match[1], 10);
  }

  // Calculate On-Time Delivery from On-Track Projects
  const onTrackCard = kpis.find(k => k.id === "on-track");
  let onTimeDelivery = 0;
  if (onTrackCard?.primaryValue) {
     const [onTrack, total] = onTrackCard.primaryValue.split("/").map(Number);
     if (total > 0) onTimeDelivery = Math.round((onTrack / total) * 100);
  }
  
  // Calculate Health Distribution
  const healthCounts = { GREEN: 0, AMBER: 0, RED: 0 };
  summary?.projects_summary_rows.forEach(p => {
    if (p.health in healthCounts) healthCounts[p.health as keyof typeof healthCounts]++;
  });
  
  const projectHealthData = [
    { name: "On Track", value: healthCounts.GREEN, color: "#10b981" }, // Emerald 500
    { name: "At Risk", value: healthCounts.AMBER, color: "#f59e0b" }, // Amber 500
    { name: "Critical", value: healthCounts.RED, color: "#ef4444" },   // Red 500
  ];

  // Real Velocity Data from Throughput Trend
  const throughputChart = summary?.charts["throughput_trend"];
  const velocityData = throughputChart?.categories?.map((cat, i) => ({
    name: cat,
    completed: throughputChart.series.find(s => s.label === "Completed")?.values[i] || 0,
    planned: throughputChart.series.find(s => s.label === "Created")?.values[i] || 0,
  })) || [];

  // Map Risks
  const risks = (summary?.task_exceptions_rows || [])
    .filter(t => ["CRITICAL", "HIGH", "MEDIUM"].includes(t.priority))
    .slice(0, 5)
    .map((t) => ({
      id: t.taskId,
      title: t.title,
      project: t.projectName || "Unknown Project",
      severity: t.priority as "CRITICAL" | "HIGH" | "MEDIUM",
      date: t.dueDate || t.updatedAt,
    }));

  // Map Alerts
  const alerts = (summary?.alerts_summary.rows || []).slice(0, 5).map(a => ({
    id: a.id,
    message: a.message,
    type: a.type,
    date: a.createdAt,
    severity: (a.severity || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH"
  }));

  return (
    <PageShell currentUser={user} title="Executive Command Center">
      <div className="space-y-6">
        {/* Tier 1: KPIs */}
        <EnterpriseKPIs 
          activeProjects={activeProjects}
          criticalRisks={criticalRisks}
          teamUtilization={teamUtilization}
          onTimeDelivery={onTimeDelivery}
        />

        {/* Tier 2: Charts */}
        <EnterpriseCharts 
          projectHealthData={projectHealthData}
          velocityData={velocityData}
        />

        {/* Tier 3: Risks & Alerts */}
        <EnterpriseRisks risks={risks} alerts={alerts} />
      </div>
    </PageShell>
  );
}
