import path from "node:path";
import request from "supertest";
import { app } from "../src/index";
import { seedDatabase } from "../src/data/seedDatabase";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

function projectPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Immutable Project",
    code: `IMM-${Date.now()}`,
    budgetHours: 20,
    estimatedEffortHours: 20,
    description: "Immutable project baseline",
    ownerId: "user-pm-1",
    projectType: "PRODUCT_FEATURE",
    objectiveOrOkrId: "OKR-SEC-1",
    priority: "HIGH",
    stage: "PLANNING",
    sponsorUserId: "user-vp-1",
    deliveryManagerUserId: "user-eng-1",
    coreTeamUserIds: ["user-eng-1"],
    stakeholderUserIds: ["user-super-admin"],
    vendorCompanyIds: ["company-vertex"],
    primaryVendorId: "company-vertex",
    vendorCompanyId: "company-vertex",
    productManagerIds: ["user-pm-1"],
    projectManagerIds: ["user-vm-1"],
    health: "GREEN",
    riskLevel: "LOW",
    businessUnit: "Platform",
    productModule: "Vendor Hub",
    timeTrackingRequired: true,
    rateModel: "TIME_AND_MATERIAL",
    tags: ["SECURITY"],
    taskWorkflowDefinitionId: "workflow-task-default",
    ...overrides
  };
}

describe("security and validation", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("validates login payloads", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "invalid" });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed.");
  });

  it("prevents updates to approved tasks", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(projectPayload());
    if (projectResponse.status !== 201) {
      console.error("Project creation failed:", projectResponse.status, JSON.stringify(projectResponse.body));
    }
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send(
        {
          itemType: "IMPROVEMENT",
          title: "Immutable Task",
          description: "Should lock after approval",
          budgetHours: 4,
          requiredSkills: ["node"],
          acceptanceCriteria: ["Complete vendor work"],
          dueDate: new Date().toISOString(),
          plannedStartDate: new Date().toISOString(),
          priority: "HIGH",
          isVendorTask: true,
          vendorId: "company-vertex"
        }
      );
    if (taskResponse.status !== 201) {
      console.error("Task creation failed:", taskResponse.status, JSON.stringify(taskResponse.body));
    }
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    await request(app)
      .post(`/api/tasks/${taskId}/estimate`)
      .set("Cookie", pmCookie)
      .send({
        quantity: 4,
        unit: "HOURS",
        notes: "Short engagement"
      })
      .expect(201);

    await request(app)
      .post(`/api/workflows/tasks/${taskId}/actions`)
      .set("Cookie", vmCookie)
      .send({ action: "APPROVE" })
      .expect(200);

    await request(app)
      .post(`/api/tasks/${taskId}/final-approve-and-start`)
      .set("Cookie", pmCookie)
      .send({
        plannedStartDate: new Date().toISOString(),
        note: "Launch!"
      })
      .expect(200);

    const updateResponse = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Cookie", pmCookie)
      .send({ title: "Should Fail" });
    expect(updateResponse.status).toBe(400);
    expect(updateResponse.body.message).toContain("immutable");
  });

  it("rejects unsupported upload types", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const filePath = path.resolve(__dirname, "fixtures/fake.exe");
    const uploadResponse = await request(app)
      .post("/api/files")
      .set("Cookie", pmCookie)
      .attach("file", filePath);
    expect(uploadResponse.status).toBe(400);
    expect(uploadResponse.body.message).toContain("Unsupported");
  });
});
