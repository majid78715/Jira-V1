import { Alert, AlertStatus, AlertType, PublicUser } from "../models/_types";
import { HttpError } from "../middleware/httpError";
import {
  getAlertById,
  getCompanyById,
  listAlerts as listAlertsRepo,
  resolveAlert as resolveAlertRepo,
  recordActivity
} from "../data/repositories";

type AlertQueryParams = {
  status?: string;
  type?: string;
  search?: string;
};

export type AlertsSummary = {
  open: number;
  byType: Record<AlertType, number>;
};

export type AlertsResponse = {
  alerts: Alert[];
  summary: AlertsSummary;
};

type AlertScopeFilters = {
  companyId?: string;
  userId?: string;
};

async function resolveAlertScope(actor: PublicUser): Promise<AlertScopeFilters> {
  if (["DEVELOPER", "ENGINEER"].includes(actor.role)) {
    return { userId: actor.id };
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (!actor.companyId) {
      throw new HttpError(403, "Alerts are only available within your vendor scope.");
    }
    return { companyId: actor.companyId };
  }
  if (["PM", "SUPER_ADMIN", "VP"].includes(actor.role)) {
    if (!actor.companyId) {
      return {};
    }
    const company = await getCompanyById(actor.companyId);
    if (company?.type === "HUMAIN") {
      return {};
    }
    return { companyId: actor.companyId };
  }
  throw new HttpError(403, "You do not have permission to view alerts.");
}

async function enforceAlertResolutionScope(actor: PublicUser, alert: Alert) {
  if (["PM", "SUPER_ADMIN", "VP"].includes(actor.role)) {
    if (!actor.companyId) {
      return;
    }
    const company = await getCompanyById(actor.companyId);
    if (company?.type === "HUMAIN") {
      return;
    }
    if (alert.companyId && alert.companyId === actor.companyId) {
      return;
    }
    throw new HttpError(403, "Cannot resolve alerts outside your company.");
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && alert.companyId === actor.companyId) {
      return;
    }
    throw new HttpError(403, "Cannot resolve alerts outside your vendor scope.");
  }
  throw new HttpError(403, "You do not have permission to resolve alerts.");
}

export async function fetchAlerts(actor: PublicUser, params: AlertQueryParams): Promise<AlertsResponse> {
  const statuses = parseStatuses(params.status);
  const types = parseTypes(params.type);
  const scope = await resolveAlertScope(actor);
  const [alerts, openAlerts] = await Promise.all([
    listAlertsRepo({ statuses, types, search: params.search, ...scope }),
    listAlertsRepo({ statuses: ["OPEN"], ...scope })
  ]);

  return {
    alerts,
    summary: {
      open: openAlerts.length,
      byType: buildCountsByType(openAlerts)
    }
  };
}

export async function resolveAlertForUser(actor: PublicUser, alertId: string): Promise<Alert> {
  const alert = await getAlertById(alertId);
  if (!alert) {
    throw new HttpError(404, "Alert not found.");
  }
  await enforceAlertResolutionScope(actor, alert);
  if (alert.status === "RESOLVED") {
    return alert;
  }
  const resolved = await resolveAlertRepo(alert.id, actor.id);
  await recordActivity(actor.id, "ALERT_RESOLVED", `Resolved ${alert.type} alert`, {
    alertId: alert.id,
    type: alert.type
  });
  return resolved;
}

function parseStatuses(value?: string): AlertStatus[] | undefined {
  if (!value) {
    return undefined;
  }
  const statuses = value
    .split(",")
    .map((status) => status.trim().toUpperCase())
    .filter((status): status is AlertStatus => status === "OPEN" || status === "RESOLVED");
  return statuses.length ? Array.from(new Set(statuses)) : undefined;
}

function parseTypes(value?: string): AlertType[] | undefined {
  if (!value) {
    return undefined;
  }
  const allowed: AlertType[] = [
    "MISSING_DAILY_LOG",
    "INACTIVITY",
    "OVER_BUDGET",
    "HOLIDAY_WORK",
    "SCHEDULE_EXCEPTION",
    "TASK_OVERDUE"
  ];
  const types = value
    .split(",")
    .map((type) => type.trim().toUpperCase())
    .filter((type): type is AlertType => allowed.includes(type as AlertType));
  return types.length ? Array.from(new Set(types)) : undefined;
}

function buildCountsByType(alerts: Alert[]): Record<AlertType, number> {
  const totals: Record<AlertType, number> = {
    MISSING_DAILY_LOG: 0,
    INACTIVITY: 0,
    OVER_BUDGET: 0,
    HOLIDAY_WORK: 0,
    SCHEDULE_EXCEPTION: 0,
    TASK_OVERDUE: 0,
    OVERDUE_MILESTONE: 0,
    HIGH_RISK_PROJECT: 0,
    LOW_UTILISATION: 0
  };
  for (const alert of alerts) {
    totals[alert.type] = (totals[alert.type] ?? 0) + 1;
  }
  return totals;
}
