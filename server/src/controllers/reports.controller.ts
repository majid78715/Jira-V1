import { NextFunction, Request, Response } from "express";
import {
  getExecutiveSummary,
  getTimesheetSummaryReport,
  getVendorPerformanceReport,
  timesheetSummaryReportToCsv,
  vendorPerformanceReportToCsv
} from "../services/report.service";

export async function vendorPerformanceReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId, from, to, format } = req.query;
    const report = await getVendorPerformanceReport(req.currentUser!, {
      companyId: typeof companyId === "string" ? companyId : undefined,
      from: typeof from === "string" ? from : undefined,
      to: typeof to === "string" ? to : undefined
    });

    if (format === "csv") {
      const csv = vendorPerformanceReportToCsv(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="vendor-performance-${report.vendor.id}.csv"`
      );
      return res.send(csv);
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
}

export async function executiveSummaryReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await getExecutiveSummary(req.currentUser!);
    res.json({ summary });
  } catch (error) {
    next(error);
  }
}

export async function timesheetSummaryReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId, from, to, groupBy, format } = req.query;
    const report = await getTimesheetSummaryReport(req.currentUser!, {
      companyId: typeof companyId === "string" ? companyId : undefined,
      from: typeof from === "string" ? from : undefined,
      to: typeof to === "string" ? to : undefined,
      groupBy: groupBy === "project" ? "project" : "user"
    });

    if (format === "csv") {
      const csv = timesheetSummaryReportToCsv(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="timesheet-summary-${report.groupBy}.csv"`);
      return res.send(csv);
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
}
