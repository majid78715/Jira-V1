import { AlertStatus, AlertType } from "./types";

type BadgeTone = "warning" | "neutral" | "success";

export const ALERT_TYPE_META: Record<AlertType, { label: string; helper: string; tone: BadgeTone }> = {
  MISSING_DAILY_LOG: {
    label: "Missing Daily Log",
    helper: "No time entry or attendance recorded on a working day.",
    tone: "warning"
  },
  INACTIVITY: {
    label: "Inactivity",
    helper: "Multiple consecutive working days without activity.",
    tone: "warning"
  },
  OVER_BUDGET: {
    label: "Over Budget",
    helper: "Project hours logged beyond the approved budget.",
    tone: "warning"
  },
  HOLIDAY_WORK: {
    label: "Holiday Work",
    helper: "Time logged on a company holiday or approved day off.",
    tone: "warning"
  },
  SCHEDULE_EXCEPTION: {
    label: "Schedule Exception",
    helper: "Attendance or time tracked outside of expected schedule.",
    tone: "neutral"
  },
  TASK_OVERDUE: {
    label: "Task Overdue",
    helper: "Task due date has passed without completion.",
    tone: "warning"
  },
  OVERDUE_MILESTONE: {
    label: "Overdue Milestone",
    helper: "Milestone deadline missed without completion.",
    tone: "warning"
  },
  HIGH_RISK_PROJECT: {
    label: "High Risk Project",
    helper: "Project marked as high risk by PMO.",
    tone: "warning"
  },
  LOW_UTILISATION: {
    label: "Low Utilisation",
    helper: "Team utilisation fell below the target threshold.",
    tone: "neutral"
  }
};

export const ALERT_STATUS_META: Record<AlertStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Open", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" }
};

export function formatAlertType(type: AlertType): string {
  return ALERT_TYPE_META[type]?.label ?? type;
}
