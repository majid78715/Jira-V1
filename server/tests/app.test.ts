import request from "supertest";
import { DateTime } from "luxon";
import { app } from "../src/index";
import { seedDatabase } from "../src/data/seedDatabase";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

function buildProjectPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Global API Expansion",
    code: "API-EXP",
    budgetHours: 160,
    estimatedEffortHours: 180,
    description: "New integrations for FY25",
    ownerId: "user-pm-1",
    projectType: "PRODUCT_FEATURE",
    objectiveOrOkrId: "OKR-2025-01",
    priority: "HIGH",
    stage: "PLANNING",
    sponsorUserId: "user-vp-1",
    deliveryManagerUserId: "user-eng-1",
    coreTeamUserIds: ["user-eng-1"],
    stakeholderUserIds: ["user-super-admin"],
    vendorCompanyIds: ["company-vertex"],
    primaryVendorId: "company-vertex",
    startDate: "2025-01-01",
    endDate: "2025-06-30",
    health: "GREEN",
    riskLevel: "LOW",
    businessUnit: "Platform",
    productModule: "Vendor Hub",
    timeTrackingRequired: true,
    contractId: "SOW-001",
    rateModel: "TIME_AND_MATERIAL",
    taskWorkflowDefinitionId: "workflow-task-default",
    complianceFlags: ["PII"],
    tags: ["Critical"],
    ...overrides
  };
}

function buildTaskPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Scoped Task",
    description: "Task description",
    budgetHours: 8,
    requiredSkills: ["node"],
    acceptanceCriteria: ["Meets definition of done"],
    dueDate: new Date().toISOString(),
    plannedStartDate: new Date().toISOString(),
    taskType: "TASK",
    priority: "HIGH",
    assigneeUserId: undefined,
    reporterUserId: undefined,
    isVendorTask: true,
    vendorId: "company-vertex",
    estimateStoryPoints: 3,
    dependencyTaskIds: [],
    linkedIssueIds: [],
    epicId: undefined,
    component: undefined,
    sprintId: undefined,
    environment: undefined,
    ...overrides
  };
}

describe("auth and RBAC", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("logs in super admin and returns current user", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "super@humain.local",
      password: "Admin#123"
    });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("super@humain.local");
    const cookie = response.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();

    const meResponse = await request(app).get("/api/auth/me").set("Cookie", cookie as string);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.role).toBe("SUPER_ADMIN");
  });

  it("denies non-admin access to admin routes", async () => {
    const engineerCookie = await login("eng@humain.local", "Builder#123");
    const response = await request(app).get("/api/admin/users").set("Cookie", engineerCookie);
    expect(response.status).toBe(403);
  });

  it("allows super admin to create companies and PM users", async () => {
    const cookie = await login("super@humain.local", "Admin#123");
    const companyResponse = await request(app)
      .post("/api/companies")
      .set("Cookie", cookie)
      .send({
        name: "Atlas Vendors",
        type: "VENDOR",
        description: "Trusted partner"
      });
    expect(companyResponse.status).toBe(201);
    const companyId = companyResponse.body.company.id;

    const userResponse = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookie)
      .send({
        email: "new.pm@humain.local",
        password: "Manager#456",
        role: "PM",
        companyId,
        profile: {
          firstName: "New",
          lastName: "Manager",
          mobileNumber: "+12125550000",
          country: "US",
          city: "New York",
          timeZone: "America/New_York",
          title: "Program Manager"
        }
      });
    expect(userResponse.status).toBe(201);
    expect(userResponse.body.user.email).toBe("new.pm@humain.local");
  });
  it("allows super admins to update their profile directly", async () => {
    const superCookie = await login("super@humain.local", "Admin#123");
    const response = await request(app)
      .post("/api/users/me/profile")
      .set("Cookie", superCookie)
      .send({
        profile: {
          firstName: "Ada",
          lastName: "Steward",
          mobileNumber: "+14155559999",
          country: "US",
          city: "San Francisco",
          timeZone: "America/Los_Angeles",
          title: "Chief of Staff"
        }
      });
    expect(response.status).toBe(200);
    expect(response.body.user.profile.mobileNumber).toBe("+14155559999");

    const meResponse = await request(app).get("/api/auth/me").set("Cookie", superCookie);
    expect(meResponse.body.user.profile.mobileNumber).toBe("+14155559999");
  });

  it("rejects direct profile updates for developers", async () => {
    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const result = await request(app)
      .post("/api/users/me/profile")
      .set("Cookie", devCookie)
      .send({
        profile: {
          firstName: "Dara",
          lastName: "Singh",
          mobileNumber: "+11111111111",
          country: "GB",
          city: "London",
          timeZone: "Europe/London",
          title: "Senior Developer"
        }
      });
    expect(result.status).toBe(403);
  });
});

describe("vendor onboarding flow", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("allows PM -> VM -> Dev onboarding end to end", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const vmInvite = await request(app)
      .post("/api/invitations/project-manager")
      .set("Cookie", pmCookie)
      .send({
        email: "vm.new@humain.local",
        firstName: "Veronica",
        lastName: "Mason",
        companyId: "company-humain"
      });
    expect(vmInvite.status).toBe(201);
    const vmToken = vmInvite.body.invitation.token as string;

    const vmAccept = await request(app).post("/api/auth/accept-invitation").send({
      token: vmToken,
      password: "Vendor#123",
      profile: {
        firstName: "Veronica",
        lastName: "Mason",
        mobileNumber: "+12125550111",
        country: "US",
        city: "Austin",
        timeZone: "America/Chicago",
        title: "Vendor Lead"
      }
    });
    expect(vmAccept.status).toBe(201);
    const vendorManagerId = vmAccept.body.user.id;

    const pendingAfterInvite = await request(app)
      .get("/api/users/pending-profiles")
      .set("Cookie", pmCookie);
    expect(pendingAfterInvite.body.users.some((u: { id: string }) => u.id === vendorManagerId)).toBe(true);

    const approveVmResponse = await request(app)
      .post(`/api/users/${vendorManagerId}/approve-profile`)
      .set("Cookie", pmCookie)
      .send({ comment: "Approved" });
    expect(approveVmResponse.status).toBe(200);

    const vmCookie = await login("vm.new@humain.local", "Vendor#123");
    const devInvite = await request(app)
      .post("/api/invitations/developer")
      .set("Cookie", vmCookie)
      .send({
        email: "dev.new@humain.local",
        firstName: "Devon",
        lastName: "Rivera"
      });
    expect(devInvite.status).toBe(201);
    const devToken = devInvite.body.invitation.token as string;

    const devAccept = await request(app).post("/api/auth/accept-invitation").send({
      token: devToken,
      password: "Dev#1234",
      profile: {
        firstName: "Devon",
        lastName: "Rivera",
        mobileNumber: "+44800123123",
        country: "GB",
        city: "London",
        timeZone: "Europe/London",
        title: "Senior Developer"
      }
    });
    expect(devAccept.status).toBe(201);
    const developerId = devAccept.body.user.id;

    await request(app)
      .post(`/api/users/${developerId}/approve-profile`)
      .set("Cookie", pmCookie)
      .send({ comment: "Welcome aboard" })
      .expect(200);

    const devCookie = await login("dev.new@humain.local", "Dev#1234");
    const changeRequest = await request(app)
      .post("/api/profile-change-requests")
      .set("Cookie", devCookie)
      .send({
        profile: {
          firstName: "Devon",
          lastName: "Rivera",
          mobileNumber: "+44800123123",
          country: "GB",
          city: "Manchester",
          timeZone: "Europe/London",
          title: "Lead Developer"
        }
      });
    expect(changeRequest.status).toBe(201);
    const requestId = changeRequest.body.request.id;

    const pendingRequests = await request(app)
      .get("/api/profile-change-requests")
      .set("Cookie", pmCookie);
    expect(pendingRequests.body.requests.some((req: { id: string }) => req.id === requestId)).toBe(true);

    await request(app)
      .post(`/api/profile-change-requests/${requestId}/approve`)
      .set("Cookie", pmCookie)
      .send({ comment: "Looks good" })
      .expect(200);
  });
});

describe("user settings flows", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("lets a user read and update their preferences", async () => {
    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const fetchResponse = await request(app).get("/api/users/user-vm-1/preferences").set("Cookie", vmCookie);
    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body.preferences.notificationPreferences.dailyDigestEmail).toBe(true);

    const updateResponse = await request(app)
      .post("/api/users/user-vm-1/preferences")
      .set("Cookie", vmCookie)
      .send({
        notificationPreferences: { taskAssignmentEmail: false },
        workflowPreferences: { autoCaptureFocusBlocks: true },
        availabilityPreferences: {
          meetingHoursStart: "10:00",
          meetingHoursEnd: "18:00",
          protectFocusTime: true
        }
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.preferences.notificationPreferences.taskAssignmentEmail).toBe(false);
    expect(updateResponse.body.preferences.workflowPreferences.autoCaptureFocusBlocks).toBe(true);
    expect(updateResponse.body.preferences.availabilityPreferences.protectFocusTime).toBe(true);
  });

  it("prevents unauthorized preference updates for other users", async () => {
    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const response = await request(app)
      .post("/api/users/user-vm-1/preferences")
      .set("Cookie", devCookie)
      .send({
        notificationPreferences: { dailyDigestEmail: false }
      });
    expect(response.status).toBe(403);
  });

  it("allows a user to change their password from settings", async () => {
    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const changeResponse = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", devCookie)
      .send({
        currentPassword: "Dev#1234",
        newPassword: "Dev#5678",
        confirmNewPassword: "Dev#5678"
      });
    expect(changeResponse.status).toBe(200);

    const loginWithNewPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "dev@vendor.local", password: "Dev#5678" });
    expect(loginWithNewPassword.status).toBe(200);
  });
});

describe("schedules and time off", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("stores personal schedules with the user's profile timezone", async () => {
    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const scheduleResponse = await request(app)
      .post("/api/schedule/user-vm-1")
      .set("Cookie", vmCookie)
      .send({
        slots: [
          { day: 1, start: "10:00", end: "18:00" },
          { day: 2, start: "10:00", end: "18:00" }
        ]
      });
    expect(scheduleResponse.status).toBe(201);
    expect(scheduleResponse.body.schedule.timeZone).toBe("America/Chicago");
    const fetchResponse = await request(app).get("/api/schedule/user-vm-1").set("Cookie", vmCookie);
    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body.schedule.slots).toHaveLength(2);
  });

  it("allows day off requests and approvals", async () => {
    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const requestResponse = await request(app)
      .post("/api/dayoffs")
      .set("Cookie", devCookie)
      .send({ date: "2025-06-02", reason: "Trip" });
    expect(requestResponse.status).toBe(201);
    const requestId = requestResponse.body.request.id;

    const pmCookie = await login("pm@humain.local", "Manager#123");
    const pendingResponse = await request(app).get("/api/dayoffs?scope=pending").set("Cookie", pmCookie);
    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body.dayOffs.some((item: { id: string }) => item.id === requestId)).toBe(true);

    await request(app)
      .patch(`/api/dayoffs/${requestId}`)
      .set("Cookie", pmCookie)
      .send({ action: "APPROVE" })
      .expect(200);

    const mineResponse = await request(app).get("/api/dayoffs").set("Cookie", devCookie);
    expect(mineResponse.body.dayOffs.some((item: { status: string }) => item.status === "APPROVED")).toBe(true);
  });
});

describe("projects and assignments", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("lets PM create projects, VM add tasks, and Dev see approved assignments", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app).post("/api/projects").set("Cookie", pmCookie).send(buildProjectPayload());
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send({
        title: "Build Adapter",
        description: "Implement ERP adapter",
        budgetHours: 40,
        requiredSkills: ["node", "sap"],
        dueDate: new Date().toISOString()
      });
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    const developersResponse = await request(app).get("/api/team/developers").set("Cookie", vmCookie);
    const developer = developersResponse.body.users.find((user: { email: string }) => user.email === "dev@vendor.local");
    expect(developer).toBeDefined();

    const assignmentResponse = await request(app)
      .post("/api/assignments")
      .set("Cookie", vmCookie)
      .send({
        taskId,
        developerId: developer.id,
        note: "Need Dara to lead this integration."
      });
    expect(assignmentResponse.status).toBe(201);
    const assignmentId = assignmentResponse.body.assignment.id;

    const pendingResponse = await request(app)
      .get("/api/assignments?scope=pending")
      .set("Cookie", pmCookie);
    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body.assignments.some((assignment: { id: string }) => assignment.id === assignmentId)).toBe(true);

    await request(app).post(`/api/assignments/${assignmentId}/approve`).set("Cookie", pmCookie).expect(200);

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const myAssignments = await request(app).get("/api/assignments").set("Cookie", devCookie);
    expect(myAssignments.status).toBe(200);
    expect(myAssignments.body.assignments.some((assignment: { taskId: string }) => assignment.taskId === taskId)).toBe(true);
    expect(myAssignments.body.tasks.some((task: { id: string }) => task.id === taskId)).toBe(true);
  });
});

describe("task estimation workflow", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("walks an estimate through project manager review and PM approval", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(buildProjectPayload({ name: "Workflow Project", code: "WF-100" }));
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send(buildTaskPayload({ title: "Scoped Workflow Task", description: "Task requiring workflow approvals", budgetHours: 24 }));
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    const estimateResponse = await request(app)
      .post(`/api/tasks/${taskId}/estimate`)
      .set("Cookie", pmCookie)
      .send({
        quantity: 16,
        unit: "HOURS",
        notes: "Initial vendor estimate",
        confidence: "MEDIUM"
      });
    expect(estimateResponse.status).toBe(201);

    await request(app)
      .post(`/api/workflows/tasks/${taskId}/actions`)
      .set("Cookie", vmCookie)
      .send({ action: "APPROVE" })
      .expect(200);

    const finalResponse = await request(app)
      .post(`/api/tasks/${taskId}/final-approve-and-start`)
      .set("Cookie", pmCookie)
      .send({
        plannedStartDate: "2025-05-27T09:00:00",
        note: "Ready to begin"
      });
    expect(finalResponse.status).toBe(200);
    expect(finalResponse.body.task.status).toBe("SELECTED");
    expect(finalResponse.body.task.expectedCompletionDate).toBe("2025-05-28T11:30:00.000Z");
  });

  it("enforces workflow comment requirements for configured steps", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(buildProjectPayload({ name: "Workflow Comments Project", code: "WF-200" }));
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send(
        buildTaskPayload({
          title: "Workflow Comment Task",
          description: "Task requiring workflow comment enforcement",
          budgetHours: 16
        })
      );
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    const estimateResponse = await request(app)
      .post(`/api/tasks/${taskId}/estimate`)
      .set("Cookie", pmCookie)
      .send({
        quantity: 12,
        unit: "HOURS",
        notes: "Test estimate",
        confidence: "MEDIUM"
      });
    expect(estimateResponse.status).toBe(201);

    const sendBackResponse = await request(app)
      .post(`/api/workflows/tasks/${taskId}/actions`)
      .set("Cookie", vmCookie)
      .send({ action: "SEND_BACK" });
    expect(sendBackResponse.status).toBe(400);
    expect(sendBackResponse.body.error.message).toContain("Comment is required");

    const sendBackWithComment = await request(app)
      .post(`/api/workflows/tasks/${taskId}/actions`)
      .set("Cookie", vmCookie)
      .send({ action: "SEND_BACK", comment: "Need more data." });
    expect(sendBackWithComment.status).toBe(200);
  });
});

describe("attendance and time tracking", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("lets a developer clock in/out and fetch aggregates", async () => {
    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const clockIn = await request(app).post("/api/attendance/clock-in").set("Cookie", devCookie);
    expect(clockIn.status).toBe(201);
    expect(clockIn.body.record.status).toBe("OPEN");

    const clockOut = await request(app).post("/api/attendance/clock-out").set("Cookie", devCookie);
    expect(clockOut.status).toBe(200);
    expect(clockOut.body.record.status).toBe("COMPLETED");
    expect(clockOut.body.record.minutesWorked).toBeGreaterThan(0);

    const summary = await request(app).get("/api/attendance").set("Cookie", devCookie);
    expect(summary.status).toBe(200);
    expect(summary.body.aggregates.todayMinutes).toBeGreaterThan(0);
    expect(summary.body.schedule).toBeDefined();
  });

  it("persists manual time entries tied to assignments", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(buildProjectPayload({ name: "Attendance Project", code: `ATT-${Date.now()}` }));
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send(buildTaskPayload({ title: "Attendance Task", description: "Work for attendance test", budgetHours: 8 }));
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    const developers = await request(app).get("/api/team/developers").set("Cookie", vmCookie);
    const developer = developers.body.users.find((user: { email: string }) => user.email === "dev@vendor.local");
    expect(developer).toBeDefined();

    const assignmentResponse = await request(app)
      .post("/api/assignments")
      .set("Cookie", vmCookie)
      .send({
        taskId,
        developerId: developer.id,
        note: "Need Dara to log time"
      });
    expect(assignmentResponse.status).toBe(201);
    const assignmentId = assignmentResponse.body.assignment.id;

    await request(app).post(`/api/assignments/${assignmentId}/approve`).set("Cookie", pmCookie).expect(200);

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const today = DateTime.now().setZone("Europe/London").toISODate()!;
    const entryResponse = await request(app)
      .post("/api/time-entries")
      .set("Cookie", devCookie)
      .send({
        projectId,
        taskId,
        date: today,
        startTime: "09:00",
        endTime: "10:30",
        note: "Kickoff"
      });
    expect(entryResponse.status).toBe(201);
    const entryId = entryResponse.body.entry.id;
    expect(entryResponse.body.entry.minutes).toBe(90);

    const listResponse = await request(app).get("/api/time-entries").set("Cookie", devCookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.entries.some((entry: { id: string }) => entry.id === entryId)).toBe(true);
    expect(listResponse.body.availableTaskIds).toContain(taskId);
    expect(listResponse.body.aggregates.todayMinutes).toBeGreaterThan(0);

    const updateResponse = await request(app)
      .patch(`/api/time-entries/${entryId}`)
      .set("Cookie", devCookie)
      .send({
        endTime: "11:00",
        note: "Extended debugging"
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.entry.minutes).toBe(120);
    expect(updateResponse.body.entry.note).toBe("Extended debugging");
  });
});

describe("timesheets", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("generates, submits, and routes approvals while locking entries after approval", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(buildProjectPayload({ name: "Timesheet Project", code: `TS-${Date.now()}` }));
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", vmCookie)
      .send(buildTaskPayload({ title: "Timesheet Task", description: "Log hours for timesheets", budgetHours: 12 }));
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    const developers = await request(app).get("/api/team/developers").set("Cookie", vmCookie);
    const developer = developers.body.users.find((user: { email: string }) => user.email === "dev@vendor.local");
    expect(developer).toBeDefined();

    const assignmentResponse = await request(app)
      .post("/api/assignments")
      .set("Cookie", vmCookie)
      .send({
        taskId,
        developerId: developer.id,
        note: "Need weekly submission"
      });
    expect(assignmentResponse.status).toBe(201);
    await request(app).post(`/api/assignments/${assignmentResponse.body.assignment.id}/approve`).set("Cookie", pmCookie);

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const today = DateTime.now().setZone("Europe/London").toISODate()!;
    const entryResponse = await request(app)
      .post("/api/time-entries")
      .set("Cookie", devCookie)
      .send({
        projectId,
        taskId,
        date: today,
        startTime: "10:00",
        endTime: "12:00",
        note: "Feature work"
      });
    expect(entryResponse.status).toBe(201);
    const entryId = entryResponse.body.entry.id;

    const generateResponse = await request(app)
      .post("/api/timesheets/generate")
      .set("Cookie", devCookie)
      .send({ weekStart: today });
    expect([200, 201]).toContain(generateResponse.status);
    const timesheetId = generateResponse.body.timesheet.id;
    expect(generateResponse.body.timesheet.timeEntryIds).toContain(entryId);

    const overviewResponse = await request(app)
      .get(`/api/timesheets?weekStart=${today}`)
      .set("Cookie", devCookie);
    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.timesheet.id).toBe(timesheetId);
    expect(Array.isArray(overviewResponse.body.entries)).toBe(true);

    const submitResponse = await request(app).post(`/api/timesheets/${timesheetId}/submit`).set("Cookie", devCookie);
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.timesheet.status).toBe("SUBMITTED");

    const queueResponse = await request(app).get("/api/timesheets?scope=approvals").set("Cookie", pmCookie);
    expect(queueResponse.status).toBe(200);
    expect(queueResponse.body.timesheets.some((sheet: { id: string }) => sheet.id === timesheetId)).toBe(true);

    const rejectMissingComment = await request(app)
      .post(`/api/timesheets/${timesheetId}/reject`)
      .set("Cookie", pmCookie)
      .send({});
    expect(rejectMissingComment.status).toBe(400);

    const rejectResponse = await request(app)
      .post(`/api/timesheets/${timesheetId}/reject`)
      .set("Cookie", pmCookie)
      .send({ comment: "Need more detail" });
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.timesheet.status).toBe("REJECTED");
    expect(rejectResponse.body.timesheet.rejectionComment).toContain("Need more detail");

    const regenerateResponse = await request(app)
      .post("/api/timesheets/generate")
      .set("Cookie", devCookie)
      .send({ weekStart: today });
    expect(regenerateResponse.status).toBe(200);
    expect(regenerateResponse.body.timesheet.status).toBe("DRAFT");

    await request(app).post(`/api/timesheets/${timesheetId}/submit`).set("Cookie", devCookie).expect(200);

    const approveResponse = await request(app)
      .post(`/api/timesheets/${timesheetId}/approve`)
      .set("Cookie", pmCookie);
    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.timesheet.status).toBe("APPROVED");

    const lockedResponse = await request(app)
      .patch(`/api/time-entries/${entryId}`)
      .set("Cookie", devCookie)
      .send({ note: "should fail" });
    expect(lockedResponse.status).toBe(400);
    expect(lockedResponse.body.message).toMatch(/locked/i);
  });
});

describe("calendars and exports", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  async function setupCalendarData() {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const vmCookie = await login("vm@vendor.local", "Vendor#123");
    const devCookie = await login("dev@vendor.local", "Dev#1234");

    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Cookie", pmCookie)
      .send(
        buildProjectPayload({
          name: "Calendar Project",
          code: `CAL-${Date.now()}`,
          startDate: "2025-06-01",
          endDate: "2025-07-01",
          status: "ACTIVE"
        })
      );
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const taskResponse = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set("Cookie", pmCookie)
      .send(
        buildTaskPayload({
          title: "Calendar Ready Task",
          description: "Calendar friendly work",
          budgetHours: 16,
          requiredSkills: ["react"],
          dueDate: "2025-06-10T00:00:00.000Z",
          isVendorTask: false,
          vendorId: undefined
        })
      );
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.task.id;

    await request(app)
      .post(`/api/tasks/${taskId}/estimate`)
      .set("Cookie", pmCookie)
      .send({
        quantity: 16,
        unit: "HOURS",
        notes: "Calendar estimate"
      })
      .expect(201);

    await request(app)
      .post(`/api/workflows/tasks/${taskId}/actions`)
      .set("Cookie", vmCookie)
      .send({ action: "APPROVE" })
      .expect(200);

    const plannedStartDate = "2025-06-02T09:00:00.000Z";
    const finalResponse = await request(app)
      .post(`/api/tasks/${taskId}/final-approve-and-start`)
      .set("Cookie", pmCookie)
      .send({
        plannedStartDate,
        note: "Calendar launch"
      });
    expect(finalResponse.status).toBe(200);
    const expectedCompletionDate: string = finalResponse.body.task.expectedCompletionDate;

    const developers = await request(app).get("/api/team/developers").set("Cookie", vmCookie);
    const developer = developers.body.users.find((user: { email: string }) => user.email === "dev@vendor.local");
    expect(developer).toBeDefined();
    const developerId = developer.id;

    const assignmentResponse = await request(app)
      .post("/api/assignments")
      .set("Cookie", vmCookie)
      .send({
        taskId,
        developerId,
        note: "Calendar build"
      });
    expect(assignmentResponse.status).toBe(201);
    const assignmentId = assignmentResponse.body.assignment.id;
    await request(app).post(`/api/assignments/${assignmentId}/approve`).set("Cookie", pmCookie).expect(200);

    const dayOffDate = "2025-06-05";
    const dayOffResponse = await request(app)
      .post("/api/dayoffs")
      .set("Cookie", devCookie)
      .send({
        date: dayOffDate,
        reason: "Recharge"
      });
    expect(dayOffResponse.status).toBe(201);
    await request(app)
      .patch(`/api/dayoffs/${dayOffResponse.body.request.id}`)
      .set("Cookie", pmCookie)
      .send({ action: "APPROVE" })
      .expect(200);

    await request(app)
      .post("/api/company-holidays")
      .set("Cookie", pmCookie)
      .send({
        name: "Vendor Summit",
        date: "2025-06-04",
        companyId: "company-vertex"
      })
      .expect(201);

    return {
      pmCookie,
      vmCookie,
      devCookie,
      projectId,
      taskId,
      developerId,
      plannedStartDate,
      expectedCompletionDate,
      dayOffDate
    };
  }

  it("builds a merged user calendar and ICS feed", async () => {
    const fixture = await setupCalendarData();
    const calendarResponse = await request(app)
      .get(`/api/calendar/user/${fixture.developerId}`)
      .set("Cookie", fixture.devCookie);
    expect(calendarResponse.status).toBe(200);
    expect(calendarResponse.body.scope).toBe("user");
    const events = calendarResponse.body.events as Array<Record<string, string>>;
    expect(Array.isArray(events)).toBe(true);

    const assignmentEvent = events.find(
      (event) => event.type === "ASSIGNMENT" && event.taskId === fixture.taskId
    );
    expect(assignmentEvent).toBeTruthy();
    const expectedStart = fixture.plannedStartDate.slice(0, 10);
    const expectedEnd = DateTime.fromISO(fixture.expectedCompletionDate).toISODate();
    expect(assignmentEvent?.startDate).toBe(expectedStart);
    expect(assignmentEvent?.endDate).toBe(expectedEnd);

    const milestoneEvent = events.find(
      (event) => event.type === "MILESTONE" && event.taskId === fixture.taskId
    );
    expect(milestoneEvent?.startDate).toBe(expectedEnd);

    const dayOffEvent = events.find(
      (event) => event.type === "DAY_OFF" && event.userId === fixture.developerId
    );
    expect(dayOffEvent?.startDate).toBe(fixture.dayOffDate);

    const holidayEvent = events.find((event) => event.type === "HOLIDAY" && event.title === "Vendor Summit");
    expect(holidayEvent).toBeDefined();

    const icsResponse = await request(app)
      .get(`/api/export/ics/user/${fixture.developerId}`)
      .set("Cookie", fixture.devCookie);
    expect(icsResponse.status).toBe(200);
    expect(icsResponse.headers["content-type"]).toContain("text/calendar");
    expect(icsResponse.text).toContain("BEGIN:VCALENDAR");
    expect(icsResponse.text).toContain("Vendor Summit");
    expect(icsResponse.text).toContain(DateTime.fromISO(fixture.expectedCompletionDate).toFormat("yyyyMMdd"));
  });

  it("aggregates project-level calendar events", async () => {
    const fixture = await setupCalendarData();
    const response = await request(app)
      .get(`/api/calendar/project/${fixture.projectId}`)
      .set("Cookie", fixture.pmCookie);
    expect(response.status).toBe(200);
    const events = response.body.events as Array<Record<string, string>>;
    expect(events.some((event) => event.type === "ASSIGNMENT" && event.taskId === fixture.taskId)).toBe(true);
    expect(events.some((event) => event.type === "DAY_OFF" && event.userId === fixture.developerId)).toBe(true);
    expect(events.some((event) => event.type === "HOLIDAY" && event.title === "Vendor Summit")).toBe(true);
    expect(
      response.body.users.some((user: { id: string }) => user.id === fixture.developerId)
    ).toBe(true);
  });
});
