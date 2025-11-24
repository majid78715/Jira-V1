import request from "supertest";
import { app } from "../src/index";
import { runAutomation } from "../src/services/automation.service";
import { seedDatabase } from "../src/data/seedDatabase";
import {
  createProject,
  createTask,
  createTimeEntry,
  listAlerts as listAlertsRepo
} from "../src/data/repositories";

const AUTOMATION_NOW = "2025-06-05T12:00:00.000Z";
const DEVELOPER_ID = "user-dev-1";
const ENGINEER_ID = "user-eng-1";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

async function logTime(userId: string, date: string, minutes = 60) {
  const startHour = 9;
  const endHour = startHour + Math.max(1, Math.round(minutes / 60));
  const start = `${date}T${String(startHour).padStart(2, "0")}:00:00.000Z`;
  const end = `${date}T${String(endHour).padStart(2, "0")}:00:00.000Z`;
  await createTimeEntry({
    userId,
    projectId: "project-temp",
    taskId: "task-temp",
    date,
    minutes,
    startedAt: start,
    endedAt: end,
    note: "",
    source: "MANUAL",
    outOfSchedule: false
  });
}

function automationProjectPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Atlas Rollout",
    code: `ATL-${Date.now()}`,
    description: "Automation project",
    ownerId: "user-pm-1",
    projectType: "PRODUCT_FEATURE",
    objectiveOrOkrId: "OKR-AUTO",
    priority: "HIGH",
    stage: "PLANNING",
    sponsorUserId: "user-vp-1",
    deliveryManagerUserId: "user-eng-1",
    coreTeamUserIds: [],
    stakeholderUserIds: [],
    vendorCompanyIds: [],
    budgetHours: 1,
    estimatedEffortHours: 1,
    timeTrackingRequired: true,
    status: "ACTIVE",
    health: "GREEN",
    riskLevel: "LOW",
    businessUnit: "Automation",
    productModule: "Engine",
    tags: [],
    rateModel: "TIME_AND_MATERIAL",
    taskWorkflowDefinitionId: "workflow-task-default",
    ...overrides
  };
}

describe("automation rules and alerts", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("creates and resolves missing daily log alerts based on developer activity", async () => {
    await logTime(DEVELOPER_ID, "2025-06-02");
    await logTime(DEVELOPER_ID, "2025-06-03");

    const result = await runAutomation({ now: AUTOMATION_NOW });
    expect(result.countsByType.MISSING_DAILY_LOG).toBeGreaterThan(0);

    let alerts = await listAlertsRepo({ statuses: ["OPEN"], types: ["MISSING_DAILY_LOG"] });
    const devAlert = alerts.find((alert) => alert.userId === DEVELOPER_ID);
    expect(devAlert?.metadata?.date).toBe("2025-06-04");

    await logTime(DEVELOPER_ID, "2025-06-04");
    const rerun = await runAutomation({ now: AUTOMATION_NOW });
    expect(rerun.resolvedAlerts).toBeGreaterThan(0);

    alerts = await listAlertsRepo({ statuses: ["OPEN"], types: ["MISSING_DAILY_LOG"] });
    expect(alerts.some((alert) => alert.userId === DEVELOPER_ID)).toBe(false);
  });

  it("triggers over budget alerts when project hours exceed the budget", async () => {
    const project = await createProject(automationProjectPayload({ code: "ATL-1" }));

    await createTimeEntry({
      userId: DEVELOPER_ID,
      projectId: project.id,
      taskId: "task-budget",
      date: "2025-06-03",
      minutes: 90,
      startedAt: "2025-06-03T09:00:00.000Z",
      endedAt: "2025-06-03T10:30:00.000Z",
      source: "MANUAL",
      outOfSchedule: false
    });
    await createTimeEntry({
      userId: DEVELOPER_ID,
      projectId: project.id,
      taskId: "task-budget-2",
      date: "2025-06-04",
      minutes: 60,
      startedAt: "2025-06-04T09:00:00.000Z",
      endedAt: "2025-06-04T10:00:00.000Z",
      source: "MANUAL",
      outOfSchedule: false
    });

    const result = await runAutomation({ now: AUTOMATION_NOW });
    expect(result.countsByType.OVER_BUDGET).toBe(1);

    const overBudgetAlerts = await listAlertsRepo({ statuses: ["OPEN"], types: ["OVER_BUDGET"] });
    expect(overBudgetAlerts[0]?.projectId).toBe(project.id);
  });

  it("creates overdue task alerts for assigned work", async () => {
    const project = await createProject(automationProjectPayload({ code: "ATL-OVERDUE" }));
    await createTask({
      projectId: project.id,
      title: "Overdue Automation Task",
      description: "Should trigger overdue alert",
      createdById: "user-pm-1",
      reporterUserId: "user-pm-1",
      taskType: "TASK",
      priority: "HIGH",
      budgetHours: 4,
      estimateStoryPoints: 2,
      requiredSkills: ["node"],
      acceptanceCriteria: ["Complete overdue logic"],
      dependencyTaskIds: [],
      linkedIssueIds: [],
      epicId: undefined,
      component: undefined,
      sprintId: undefined,
      environment: undefined,
      dueDate: "2025-06-01",
      plannedStartDate: "2025-05-20",
      assigneeUserId: DEVELOPER_ID,
      isVendorTask: false
    });

    const result = await runAutomation({ now: AUTOMATION_NOW });
    expect(result.countsByType.TASK_OVERDUE).toBeGreaterThanOrEqual(1);

    const overdueAlerts = await listAlertsRepo({ statuses: ["OPEN"], types: ["TASK_OVERDUE"] });
    const projectAlerts = overdueAlerts.filter((a) => a.projectId === project.id);
    expect(projectAlerts.length).toBe(1);
    expect(projectAlerts[0]?.projectId).toBe(project.id);
  });

  it("lists and resolves alerts via the API", async () => {
    const cookie = await login("super@humain.local", "Admin#123");
    await logTime(DEVELOPER_ID, "2025-06-02");
    await logTime(DEVELOPER_ID, "2025-06-03");
    await logTime(ENGINEER_ID, "2025-06-03");
    await runAutomation({ now: AUTOMATION_NOW });

    const listResponse = await request(app).get("/api/alerts?status=OPEN").set("Cookie", cookie);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.alerts)).toBe(true);
    expect(listResponse.body.summary.open).toBeGreaterThan(0);

    const alertId = listResponse.body.alerts[0].id as string;
    const resolveResponse = await request(app)
      .post(`/api/alerts/${alertId}/resolve`)
      .set("Cookie", cookie);
    expect(resolveResponse.status).toBe(200);
    expect(resolveResponse.body.alert.status).toBe("RESOLVED");

    const listAfterResolve = await request(app).get("/api/alerts?status=OPEN").set("Cookie", cookie);
    expect(listAfterResolve.body.summary.open).toBe(listResponse.body.summary.open - 1);
  });
});
