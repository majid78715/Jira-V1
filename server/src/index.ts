import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import healthRoutes from "./routes/_health.routes";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import companiesRoutes from "./routes/companies.routes";
import invitationsRoutes from "./routes/invitations.routes";
import teamRoutes from "./routes/team.routes";
import usersRoutes from "./routes/users.routes";
import profileChangeRequestsRoutes from "./routes/profileChangeRequests.routes";
import projectsRoutes from "./routes/projects.routes";
import tasksRoutes from "./routes/tasks.routes";
import assignmentsRoutes from "./routes/assignments.routes";
import scheduleRoutes from "./routes/schedule.routes";
import companyHolidaysRoutes from "./routes/companyHolidays.routes";
import leaveRoutes from "./routes/dayoffs.routes";
import workflowsRoutes from "./routes/workflows.routes";
import attendanceRoutes from "./routes/attendance.routes";
import timeEntriesRoutes from "./routes/timeEntries.routes";
import timesheetsRoutes from "./routes/timesheets.routes";
import calendarRoutes from "./routes/calendar.routes";
import exportRoutes from "./routes/export.routes";
import notificationsRoutes from "./routes/notifications.routes";
import commentsRoutes from "./routes/comments.routes";
import activityRoutes from "./routes/activity.routes";
import attachmentsRoutes from "./routes/attachments.routes";
import filesRoutes from "./routes/files.routes";
import alertsRoutes from "./routes/alerts.routes";
import chatRoutes from "./routes/aiChat.routes";
import teamChatRoutes from "./routes/teamChat.routes";
import reportsRoutes from "./routes/reports.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import callsRoutes from "./routes/calls.routes";
import meetingsRoutes from "./routes/meetings.routes";
import releasesRoutes from "./routes/releases.routes";
import workItemTypesRoutes from "./routes/workItemTypes.routes";
import workflowSchemesRoutes from "./routes/workflowSchemes.routes";
import { startWorklogScheduler } from "./jobs/worklogScheduler";
import { startDigestScheduler } from "./jobs/digestScheduler";
import { errorHandler } from "./middleware/httpError";
import { sessionMiddleware } from "./middleware/session";
import { enforceFirstLoginCompletion } from "./middleware/firstLogin";
import { initSignalingServer } from "./ws/signaling";
import { createServer } from "node:http";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000", credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(sessionMiddleware);
  app.use("/uploads", express.static(path.resolve(__dirname, "../../uploads")));
  app.use(enforceFirstLoginCompletion);

  app.use("/api", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/companies", companiesRoutes);
  app.use("/api/invitations", invitationsRoutes);
  app.use("/api/team", teamRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/profile-change-requests", profileChangeRequestsRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/assignments", assignmentsRoutes);
  app.use("/api/workflows", workflowsRoutes);
  app.use("/api/schedule", scheduleRoutes);
  app.use("/api/holidays", companyHolidaysRoutes);
  app.use("/api/company-holidays", companyHolidaysRoutes);
  app.use("/api/leave", leaveRoutes);
  app.use("/api/dayoffs", leaveRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/time-entries", timeEntriesRoutes);
  app.use("/api/timesheets", timesheetsRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/export", exportRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/comments", commentsRoutes);
  app.use("/api/activity", activityRoutes);
  app.use("/api/attachments", attachmentsRoutes);
  app.use("/api/files", filesRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/ai-chat", chatRoutes);
  app.use("/api/team-chat", teamChatRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/calls", callsRoutes);
  app.use("/api/meetings", meetingsRoutes);
  app.use("/api/releases", releasesRoutes);
  app.use("/api/work-item-types", workItemTypesRoutes);
  app.use("/api/workflow-schemes", workflowSchemesRoutes);

  app.use(errorHandler);

  return app;
}

export const app = createApp();
startWorklogScheduler();
startDigestScheduler();

if (require.main === module) {
  const port = Number(process.env.SERVER_PORT) || 4000;
  const httpServer = createServer(app);
  initSignalingServer(httpServer);
  httpServer.listen(port, () => {
    console.log(`API ready on http://localhost:${port}`);
  });
}
