import request from "supertest";
import { DateTime } from "luxon";
import { app } from "../src/index";
import { seedDatabase } from "../src/data/seedDatabase";
import { updateDatabase } from "../src/data/db";
import { createProject, createTask } from "../src/data/repositories";

async function login(email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  const cookie = response.headers["set-cookie"]?.[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

describe("AI chat assistant", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("summarizes blocked work and persists chat history", async () => {
    const project = await createProject({
      name: "AI Ops",
      code: "AI-OPS",
      ownerId: "user-pm-1",
      budgetHours: 120,
      vendorCompanyIds: ["company-vertex"],
      status: "ACTIVE",
      taskWorkflowDefinitionId: "workflow-task-default"
    });
    const task = await createTask({
      projectId: project.id,
      title: "Stalled integration",
      description: "Waiting on vendor",
      createdById: "user-pm-1",
      budgetHours: 16,
      status: "BLOCKED"
    });
    await updateDatabase(async (db) => {
      db.tasks = db.tasks.map((existing) =>
        existing.id === task.id ? { ...existing, updatedAt: DateTime.now().minus({ days: 4 }).toISO() } : existing
      );
      return db;
    });

    const cookie = await login("pm@humain.local", "Manager#123");
    const response = await request(app)
      .post("/api/ai-chat/message")
      .set("Cookie", cookie)
      .send({ message: "Show me tasks blocked 3+ days" });

    expect(response.status).toBe(201);
    expect(response.body.session?.id).toBeDefined();
    expect(response.body.context?.blockedTasks?.length).toBeGreaterThan(0);
    const messages = response.body.messages as Array<{ role: string; body: string }>;
    expect(messages?.length).toBeGreaterThanOrEqual(2);
    const assistantMessage = messages[messages.length - 1];
    expect(assistantMessage.role).toBe("ASSISTANT");
    expect(assistantMessage.body).toContain("blocked");

    const sessions = await request(app).get("/api/ai-chat/sessions").set("Cookie", cookie);
    expect(sessions.status).toBe(200);
    expect(sessions.body.sessions?.length).toBe(1);

    const transcript = await request(app)
      .get(`/api/ai-chat/sessions/${response.body.session.id}`)
      .set("Cookie", cookie);
    expect(transcript.status).toBe(200);
    expect(transcript.body.messages?.length).toBe(messages.length);
  });

  it("rejects privileged mutation requests and documents guardrail", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const response = await request(app)
      .post("/api/ai-chat/message")
      .set("Cookie", cookie)
      .send({ message: "Please approve that vendor and change their role" });

    expect(response.status).toBe(201);
    const guardrailMessages = (response.body.messages as Array<{ body: string }>) ?? [];
    const assistantMessage = guardrailMessages[guardrailMessages.length - 1];
    expect(assistantMessage?.body).toContain("can't change roles");
    expect(response.body.guardrailTriggered).toBe(true);
  });
});
