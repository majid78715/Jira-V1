"use client";

import { AlertOctagon, ArrowRight, Calendar } from "lucide-react";
import { Card } from "../ui/Card";
import { formatShortDate } from "../../lib/format";

interface RiskItem {
  id: string;
  title: string;
  project: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  date: string;
}

interface AlertItem {
  id: string;
  message: string;
  type: string;
  date: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

interface EnterpriseRisksProps {
  risks: RiskItem[];
  alerts: AlertItem[];
}

export function EnterpriseRisks({ risks, alerts }: EnterpriseRisksProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Critical Attention Required">
          <div className="space-y-4">
            {risks.length === 0 ? (
              <p className="text-sm text-gray-500">No critical risks identified.</p>
            ) : (
              risks.map((risk) => (
                <div key={risk.id} className="flex items-start gap-4 rounded-lg border border-l-4 border-gray-100 border-l-rose-500 bg-white p-4 transition hover:bg-gray-50">
                  <div className="rounded-full bg-rose-50 p-2 text-rose-600">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{risk.title}</h4>
                    <p className="text-sm text-gray-500">{risk.project}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
                      {risk.severity}
                    </span>
                    <p className="mt-1 text-xs text-gray-400">{formatShortDate(risk.date)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div>
        <Card title="Recent Alerts">
          <div className="relative space-y-6 border-l-2 border-gray-100 pl-6">
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-500">No active alerts.</p>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="relative">
                  <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                    <Calendar className="h-3 w-3 text-blue-600" />
                  </span>
                  <h5 className="font-medium text-gray-900">{alert.type.replace(/_/g, " ")}</h5>
                  <p className="text-sm text-gray-500">{alert.message}</p>
                  <p className="mt-1 text-xs font-medium text-blue-600">{formatShortDate(alert.date)}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
