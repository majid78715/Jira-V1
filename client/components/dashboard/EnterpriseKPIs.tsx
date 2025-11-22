"use client";

import { Activity, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { Card } from "../ui/Card";

interface EnterpriseKPIsProps {
  activeProjects: number;
  criticalRisks: number;
  teamUtilization: number;
  onTimeDelivery: number;
}

export function EnterpriseKPIs({ activeProjects, criticalRisks, teamUtilization, onTimeDelivery }: EnterpriseKPIsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Active Projects"
        value={activeProjects}
        icon={<Activity className="h-5 w-5 text-blue-600" />}
        trend="+2 this month"
        trendColor="text-blue-600"
      />
      <KpiCard
        label="Team Utilization"
        value={`${teamUtilization}%`}
        icon={<Users className="h-5 w-5 text-purple-600" />}
        trend="Optimal range"
        trendColor="text-emerald-600"
      />
      <KpiCard
        label="On-Time Delivery"
        value={`${onTimeDelivery}%`}
        icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        trend="+5% vs last month"
        trendColor="text-emerald-600"
      />
      <KpiCard
        label="Critical Risks"
        value={criticalRisks}
        icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
        trend={criticalRisks > 0 ? "Requires attention" : "All clear"}
        trendColor={criticalRisks > 0 ? "text-rose-600" : "text-emerald-600"}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  trend,
  trendColor
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend: string;
  trendColor: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="rounded-lg bg-gray-50 p-2">{icon}</div>
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        <p className={`mt-1 text-xs font-medium ${trendColor}`}>{trend}</p>
      </div>
    </div>
  );
}
