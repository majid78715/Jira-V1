import { apiRequest, ApiError, API_BASE_URL } from "./apiClient";
import {
  TimesheetSummaryGroup,
  TimesheetSummaryReport,
  VendorPerformanceReport
} from "./types";

type VendorReportParams = {
  companyId: string;
  from?: string;
  to?: string;
};

type TimesheetSummaryParams = {
  from?: string;
  to?: string;
  groupBy?: TimesheetSummaryGroup;
};

export async function fetchVendorPerformanceReport(params: VendorReportParams): Promise<VendorPerformanceReport> {
  const search = new URLSearchParams();
  search.set("companyId", params.companyId);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  const response = await apiRequest<{ report: VendorPerformanceReport }>(
    `/reports/vendor-performance?${search.toString()}`
  );
  return response.report;
}

export async function fetchTimesheetSummaryReport(
  params: TimesheetSummaryParams
): Promise<TimesheetSummaryReport> {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.groupBy) search.set("groupBy", params.groupBy);
  const response = await apiRequest<{ report: TimesheetSummaryReport }>(
    `/reports/timesheet-summary?${search.toString()}`
  );
  return response.report;
}

export async function downloadReportCsv(
  path: string,
  params: Record<string, string | undefined>,
  filename: string
) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  url.searchParams.set("format", "csv");

  const response = await fetch(url.toString(), {
    credentials: "include"
  });
  if (!response.ok) {
    throw new ApiError(response.statusText, response.status);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
