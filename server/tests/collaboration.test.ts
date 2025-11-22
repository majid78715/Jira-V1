import request from "supertest";
import { app } from "../src/index";
import { seedDatabase } from "../src/data/seedDatabase";
import { createTimesheet, updateTimesheet } from "../src/data/repositories";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

describe("collaboration flows", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("returns notifications for profile approvals and timesheet approvals", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    await request(app)
      .post("/api/users/user-dev-1/approve-profile")
      .set("Cookie", pmCookie)
      .send({ comment: "Welcome aboard" })
      .expect(200);

    const timesheet = await createTimesheet({
      userId: "user-dev-1",
      weekStart: "2025-06-02",
      weekEnd: "2025-06-08",
      totalMinutes: 120,
      timeEntryIds: [],
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      submittedById: "user-dev-1"
    });

    await request(app)
      .post(`/api/timesheets/${timesheet.id}/approve`)
      .set("Cookie", pmCookie)
      .expect(200);

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const notificationsResponse = await request(app).get("/api/notifications").set("Cookie", devCookie);
    expect(notificationsResponse.status).toBe(200);
    const notifications = notificationsResponse.body.notifications as Array<{ type: string }>;
    expect(notifications.some((notification) => notification.type === "PROFILE_APPROVED")).toBe(true);
    expect(notifications.some((notification) => notification.type === "TIMESHEET_APPROVED")).toBe(true);
  });

  it("persists comments, attachments, and activity for timesheets", async () => {
    const timesheet = await createTimesheet({
      userId: "user-dev-1",
      weekStart: "2025-06-09",
      weekEnd: "2025-06-15",
      totalMinutes: 60,
      timeEntryIds: [],
      status: "APPROVED"
    });
    await updateTimesheet(timesheet.id, { status: "APPROVED" });

    const devCookie = await login("dev@vendor.local", "Dev#1234");

    const uploadResponse = await request(app)
      .post("/api/files")
      .set("Cookie", devCookie)
      .field("entityId", timesheet.id)
      .field("entityType", "TIMESHEET")
      .attach("file", Buffer.from("Timesheet backup"), "timesheet.txt");
    expect(uploadResponse.status).toBe(201);
    const attachmentId = uploadResponse.body.attachment.id as string;

    await request(app)
      .post("/api/comments")
      .set("Cookie", devCookie)
      .send({
        entityId: timesheet.id,
        entityType: "TIMESHEET",
        body: "Timesheet ready for audit."
      })
      .expect(201);

    const commentsResponse = await request(app)
      .get(`/api/comments?entityId=${timesheet.id}&entityType=TIMESHEET`)
      .set("Cookie", devCookie)
      .expect(200);
    expect(commentsResponse.body.comments.length).toBeGreaterThan(0);

    const attachmentsResponse = await request(app)
      .get(`/api/attachments?entityId=${timesheet.id}&entityType=TIMESHEET`)
      .set("Cookie", devCookie)
      .expect(200);
    expect(attachmentsResponse.body.attachments.some((attachment: { id: string }) => attachment.id === attachmentId)).toBe(
      true
    );

    const activityResponse = await request(app)
      .get(`/api/activity?entityId=${timesheet.id}&entityType=TIMESHEET`)
      .set("Cookie", devCookie)
      .expect(200);
    expect(activityResponse.body.activity.length).toBeGreaterThan(0);
  });
});

