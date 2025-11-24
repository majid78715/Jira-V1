import request from "supertest";
import { DateTime } from "luxon";
import { app } from "../src/index";
import { seedDatabase } from "../src/data/seedDatabase";
import {
  createProject,
  createTask,
  createTimeEntry,
  createTimesheet
} from "../src/data/repositories";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

async function setupReportData() {
  const project = await createProject({
    name: "Vendor Analytics",
    code: "VA-1",
    ownerId: "user-pm-1",
    budgetHours: 120,
    vendorCompanyIds: ["company-vertex"],
    status: "ACTIVE",
    taskWorkflowDefinitionId: "workflow-task-default"
  });
  const blockedTask = await createTask({
    projectId: project.id,
    title: "API Integration",
    description: "Waiting on vendor API keys",
    createdById: "user-pm-1",
    budgetHours: 24,
    status: "BLOCKED"
  });
  const activeTask = await createTask({
    projectId: project.id,
    title: "Dashboard polish",
    description: "UI tweaks",
    createdById: "user-pm-1",
    budgetHours: 16,
    status: "IN_PROGRESS"
  });

  const entry1 = await createTimeEntry({
    userId: "user-dev-1",
    projectId: project.id,
    taskId: blockedTask.id,
    date: "2025-06-02",
    minutes: 180,
    startedAt: "2025-06-02T09:00:00.000Z",
    endedAt: "2025-06-02T12:00:00.000Z",
    note: "Initial integration attempt",
    source: "MANUAL",
    outOfSchedule: false
  });
  const entry2 = await createTimeEntry({
    userId: "user-eng-1",
    projectId: project.id,
    taskId: activeTask.id,
    date: "2025-06-03",
    minutes: 120,
    startedAt: "2025-06-03T10:00:00.000Z",
    endedAt: "2025-06-03T12:00:00.000Z",
    note: "UI review",
    source: "MANUAL",
    outOfSchedule: false
  });

  await createTimesheet({
    userId: "user-dev-1",
    weekStart: "2025-06-02",
    weekEnd: "2025-06-08",
    status: "APPROVED",
    totalMinutes: entry1.minutes,
    timeEntryIds: [entry1.id],
    approvedAt: DateTime.now().toISO(),
    approvedById: "user-pm-1"
  });
  await createTimesheet({
    userId: "user-eng-1",
    weekStart: "2025-06-02",
    weekEnd: "2025-06-08",
    status: "SUBMITTED",
    totalMinutes: entry2.minutes,
    timeEntryIds: [entry2.id],
    submittedAt: DateTime.now().toISO(),
    submittedById: "user-eng-1"
  });

  return { project };
}

describe("reporting APIs", () => {
  beforeEach(async () => {
    await seedDatabase();
    await setupReportData();
  });

  it("returns vendor performance metrics and CSV export", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const jsonResponse = await request(app)
      .get("/api/reports/vendor-performance")
      .query({ companyId: "company-vertex", from: "2025-06-01", to: "2025-06-10" })
      .set("Cookie", cookie);

    expect(jsonResponse.status).toBe(200);
    const report = jsonResponse.body.report;
    expect(report.vendor.id).toBe("company-vertex");
    expect(report.totals.totalMinutes).toBe(300);
    expect(report.totals.blockedTasks).toBeGreaterThan(0);
    expect(report.tasks.length).toBeGreaterThanOrEqual(2);
    expect(report.contributors.length).toBe(2);

    const csvResponse = await request(app)
      .get("/api/reports/vendor-performance")
      .query({ companyId: "company-vertex", format: "csv" })
      .set("Cookie", cookie);
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers["content-type"]).toContain("text/csv");
    expect(csvResponse.text).toContain("Contributor");
    expect(csvResponse.text).toContain("Dashboard polish");
  });

  it("summarizes timesheets by user and exports CSV", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const jsonResponse = await request(app)
      .get("/api/reports/timesheet-summary")
      .query({ from: "2025-06-01", to: "2025-06-10", groupBy: "user" })
      .set("Cookie", cookie);
    expect(jsonResponse.status).toBe(200);
    const rows = jsonResponse.body.report.rows;
    expect(Array.isArray(rows)).toBe(true);
    const devRow = rows.find((row: { label: string }) => row.label.includes("Dara Singh"));
    expect(devRow?.totalMinutes).toBe(180);
    expect(devRow?.timesheetStatusCounts?.APPROVED).toBe(1);

    const csvResponse = await request(app)
      .get("/api/reports/timesheet-summary")
      .query({ format: "csv", groupBy: "project", from: "2025-06-01", to: "2025-06-10" })
      .set("Cookie", cookie);
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers["content-type"]).toContain("text/csv");
    expect(csvResponse.text).toContain("Minutes Logged");
    expect(csvResponse.text).toContain("Vendor Analytics");
  });

  it("filters users by location and role", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const response = await request(app)
      .get("/api/users")
      .query({ role: "DEVELOPER", country: "GB", q: "4420" })
      .set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.users.length).toBe(1);
    const [user] = response.body.users;
    expect(user.email).toBe("dev@vendor.local");
    expect(user.mobileNumber).toContain("+4420");
  });
});
