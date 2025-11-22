import { NextFunction, Request, Response } from "express";
import { HttpError } from "../middleware/httpError";
import {
  deleteDashboardView,
  getDashboardAlerts,
  getDashboardCharts,
  getDashboardProjects,
  getDashboardSummary,
  getDashboardTaskExceptions,
  getDashboardVendorPerformance,
  listSavedDashboardViews,
  saveDashboardView
} from "../services/dashboard.service";
import { DashboardFilterParams } from "../models/_types";

export async function dashboardSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const summary = await getDashboardSummary(req.currentUser!, filters);
    res.json({ summary });
  } catch (error) {
    next(error);
  }
}

export async function dashboardChartsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const charts = await getDashboardCharts(req.currentUser!, filters);
    const chartId = extractString(req.query.chart_id ?? req.query.chartId);
    if (chartId) {
      if (!charts[chartId]) {
        throw new HttpError(404, "Chart not found.");
      }
      return res.json({ charts: { [chartId]: charts[chartId] } });
    }
    res.json({ charts });
  } catch (error) {
    next(error);
  }
}

export async function dashboardProjectsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const rows = await getDashboardProjects(req.currentUser!, filters);
    res.json({ projects: rows });
  } catch (error) {
    next(error);
  }
}

export async function dashboardTaskExceptionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const rows = await getDashboardTaskExceptions(req.currentUser!, filters);
    res.json({ tasks: rows });
  } catch (error) {
    next(error);
  }
}

export async function dashboardVendorPerformanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const rows = await getDashboardVendorPerformance(req.currentUser!, filters);
    res.json({ vendors: rows });
  } catch (error) {
    next(error);
  }
}

export async function dashboardAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = extractFiltersFromQuery(req);
    const summary = await getDashboardAlerts(req.currentUser!, filters);
    res.json({ alerts: summary });
  } catch (error) {
    next(error);
  }
}

export async function listDashboardViewsController(req: Request, res: Response, next: NextFunction) {
  try {
    const views = await listSavedDashboardViews(req.currentUser!);
    res.json({ views });
  } catch (error) {
    next(error);
  }
}

export async function createDashboardViewController(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, filter_params, filterParams } = req.body ?? {};
    const filters = normalizeFilterPayload(filter_params ?? filterParams);
    const view = await saveDashboardView(req.currentUser!, { name, filters });
    res.status(201).json({ view });
  } catch (error) {
    next(error);
  }
}

export async function deleteDashboardViewController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteDashboardView(req.currentUser!, req.params.viewId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

function extractFiltersFromQuery(req: Request): DashboardFilterParams {
  const { query } = req;
  return {
    dateFrom: extractString(query.date_from ?? query.dateFrom),
    dateTo: extractString(query.date_to ?? query.dateTo),
    timeGranularity: extractString(query.time_granularity ?? query.timeGranularity) as DashboardFilterParams["timeGranularity"],
    businessUnitIds: collectArray(query, "business_unit_ids"),
    productModuleIds: collectArray(query, "product_module_ids"),
    projectIds: collectArray(query, "project_ids"),
    vendorIds: collectArray(query, "vendor_ids"),
    productManagerIds: collectArray(query, "product_manager_ids"),
    statusList: collectArray(query, "status_list") as DashboardFilterParams["statusList"],
    riskLevels: collectArray(query, "risk_levels") as DashboardFilterParams["riskLevels"],
    healthList: collectArray(query, "health_list") as DashboardFilterParams["healthList"]
  };
}

function normalizeFilterPayload(payload: unknown): DashboardFilterParams | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const source = payload as Record<string, unknown>;
  const get = (key: string) => extractString(source[key] ?? source[camelToSnake(key)]);
  const collect = (key: string) => normalizeList(source[key] ?? source[camelToSnake(key)]);

  return {
    dateFrom: get("dateFrom"),
    dateTo: get("dateTo"),
    timeGranularity: (get("timeGranularity") ?? get("time_granularity")) as DashboardFilterParams["timeGranularity"],
    businessUnitIds: collect("businessUnitIds"),
    productModuleIds: collect("productModuleIds"),
    projectIds: collect("projectIds"),
    vendorIds: collect("vendorIds"),
    productManagerIds: collect("productManagerIds"),
    statusList: collect("statusList") as DashboardFilterParams["statusList"],
    riskLevels: collect("riskLevels") as DashboardFilterParams["riskLevels"],
    healthList: collect("healthList") as DashboardFilterParams["healthList"]
  };
}

function collectArray(query: Request["query"], key: string): string[] {
  const combined = normalizeList(query[key]) as string[];
  const bracket = normalizeList(query[`${key}[]`]) as string[];
  return Array.from(new Set([...combined, ...bracket]));
}

function normalizeList(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => item?.toString().trim()).filter(Boolean) as string[];
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function extractString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value) && value.length) {
    return value[0]?.toString().trim() || undefined;
  }
  return undefined;
}

function camelToSnake(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/_/g, "_")
    .toLowerCase();
}
