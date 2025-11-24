import { test, expect, request as playwrightRequest, APIRequestContext } from "@playwright/test";
import { seedDatabase } from "../../src/data/seedDatabase";
import { startTestServer } from "./testServer";

function e2eProjectPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "E2E Delivery",
    description: "Cross-functional delivery project",
    productManagerIds: ["user-pm-1"],
    vendorCompanyId: "company-vertex",
    projectManagerIds: ["user-vm-1"],
    plannedStartDate: new Date().toISOString(),
    plannedEndDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    budgetBucket: 80,
    coreTeamUserIds: ["user-eng-1"],
    taskWorkflowDefinitionId: "workflow-task-default",
    ...overrides
  };
}

test.describe("invite to alerts journey", () => {
  let baseURL: string;
  let stopServer: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    const server = await startTestServer();
    baseURL = server.baseURL;
    stopServer = server.stop;
  });

  test.afterAll(async () => {
    if (stopServer) {
      await stopServer();
    }
  });

  test.beforeEach(async () => {
    await seedDatabase();
  });

  test("invite -> workflow -> timesheet -> alerts", async () => {
    const contexts: APIRequestContext[] = [];
    const createContext = async () => {
      const ctx = await playwrightRequest.newContext({ baseURL });
      contexts.push(ctx);
      return ctx;
    };

    const disposeContexts = async () => {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    };

    try {
      const pm = await createContext();
      await login(pm, "pm@humain.local", "Manager#123");

      const vendorEmail = `vm.flow.${Date.now()}@vendor.local`;
      const vendorPassword = "Vendor#12345";
      const vendorInviteResponse = await pm.post("/api/invitations/project-manager", {
        data: {
          email: vendorEmail,
          firstName: "Valerie",
          lastName: "Flow",
          companyId: "company-vertex"
        }
      });
      expect(vendorInviteResponse.ok()).toBeTruthy();
      const vendorInvite = await vendorInviteResponse.json();
      const vendorToken = vendorInvite.invitation.token as string;

      const unauthenticated = await createContext();
      const vendorAcceptResponse = await unauthenticated.post("/api/auth/accept-invitation", {
        data: {
          token: vendorToken,
          password: vendorPassword,
          profile: {
            firstName: "Valerie",
            lastName: "Flow",
            mobileNumber: "+14155559999",
            country: "US",
            city: "Austin",
            timeZone: "America/Chicago",
            title: "Vendor Lead"
          }
        }
      });
      expect(vendorAcceptResponse.ok()).toBeTruthy();
      const vendorUser = await vendorAcceptResponse.json();
      const vendorId = vendorUser.user.id as string;

      await pm.post(`/api/users/${vendorId}/approve-profile`, {
        data: { comment: "Welcome aboard" }
      });

      const vendor = await createContext();
      await login(vendor, vendorEmail, vendorPassword);

      const developerEmail = `dev.flow.${Date.now()}@vendor.local`;
      const developerInviteResponse = await vendor.post("/api/invitations/developer", {
        data: {
          email: developerEmail,
          firstName: "Devon",
          lastName: "Walker"
        }
      });
      expect(developerInviteResponse.ok()).toBeTruthy();
      const developerInvite = await developerInviteResponse.json();
      const developerPassword = developerInvite.tempPassword;
      const developerId = developerInvite.user.id;

      const developer = await createContext();
      const developerLoginResponse = await login(developer, developerEmail, developerPassword);

      const newDeveloperPassword = "NewDeveloperPassword#123";
      const changePasswordResponse = await developer.post("/api/auth/change-password-first-login", {
        data: {
          currentPassword: developerPassword,
          newPassword: newDeveloperPassword,
          confirmNewPassword: newDeveloperPassword
        }
      });
      expect(changePasswordResponse.ok()).toBeTruthy();

      const projectResponse = await pm.post("/api/projects", {
        data: e2eProjectPayload({
          projectManagerIds: [vendorId]
        })
      });
      expect(projectResponse.ok()).toBeTruthy();
      const project = await projectResponse.json();
      const projectId = project.project.id as string;

      const taskResponse = await vendor.post(`/api/projects/${projectId}/tasks`, {
        data: {
          itemType: "IMPROVEMENT",
          title: "Initial Discovery",
          improvementFields: { description: "Discovery and onboarding task" },
          estimatedHours: 16,
          plannedCompletionDate: new Date().toISOString(),
          plannedStartDate: new Date().toISOString()
        }
      });
      expect(taskResponse.ok()).toBeTruthy();
      const task = await taskResponse.json();
      const taskId = task.task.id as string;

      const assignmentResponse = await vendor.post("/api/assignments", {
        data: {
          taskId,
          developerId,
          note: "Assigning Devon for prototype work."
        }
      });
      expect(assignmentResponse.ok()).toBeTruthy();
      const assignmentPayload = await assignmentResponse.json();
      const assignmentId = assignmentPayload.assignment.id as string;

      const today = new Date();
      let baseDate = new Date(today);
      if (today.getDay() === 0) baseDate = new Date(today.getTime() + 24 * 3600 * 1000);
      if (today.getDay() === 6) baseDate = new Date(today.getTime() + 48 * 3600 * 1000);

      const currentDay = baseDate.getDay();
      const diff = baseDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
      const monday = new Date(baseDate.setDate(diff));
      const weekStartKey = monday.toISOString().substring(0, 10);

      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateKey = d.toISOString().substring(0, 10);
        
        const timeEntryResponse = await developer.post("/api/time-entries", {
          data: {
            projectId,
            taskId,
            date: dateKey,
            startTime: "09:00",
            endTime: "17:00",
            note: "Daily work"
          }
        });
        expect(timeEntryResponse.ok()).toBeTruthy();
      }

      const generateResponse = await developer.post("/api/timesheets/generate", {
        data: { weekStart: weekStartKey }
      });
      expect(generateResponse.status()).toBe(201);
      const generated = await generateResponse.json();
      const timesheetId = generated.timesheet.id as string;

      const submitResponse = await developer.post(`/api/timesheets/${timesheetId}/submit`);
      expect(submitResponse.ok()).toBeTruthy();

      const approveTimesheetResponse = await pm.post(`/api/timesheets/${timesheetId}/approve`);
      expect(approveTimesheetResponse.ok()).toBeTruthy();

      const superAdmin = await createContext();
      await login(superAdmin, "super@humain.local", "Admin#123");
      const automationResponse = await superAdmin.post("/api/admin/run-automation");
      expect(automationResponse.ok()).toBeTruthy();
      const automationResult = await automationResponse.json();
      expect(automationResult.result).toBeDefined();

      const alertsResponse = await pm.get("/api/alerts");
      expect(alertsResponse.ok()).toBeTruthy();
      const alerts = await alertsResponse.json();
      expect(alerts.summary).toBeDefined();
      expect(Array.isArray(alerts.alerts)).toBeTruthy();
    } finally {
      await disposeContexts();
    }
  });
});

async function login(context: APIRequestContext, email: string, password: string) {
  const response = await context.post("/api/auth/login", { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
