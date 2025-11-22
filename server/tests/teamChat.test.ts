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

describe("Team chat API", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it("allows any authenticated user to load rooms and their messages", async () => {
    const cookie = await login("dev@vendor.local", "Dev#1234");
    const roomsResponse = await request(app).get("/api/team-chat/rooms").set("Cookie", cookie);
    expect(roomsResponse.status).toBe(200);
    expect(Array.isArray(roomsResponse.body.rooms)).toBe(true);
    const firstRoom = roomsResponse.body.rooms[0];
    expect(firstRoom?.id).toBeDefined();

    const messagesResponse = await request(app)
      .get(`/api/team-chat/rooms/${firstRoom.id}/messages`)
      .set("Cookie", cookie);
    expect(messagesResponse.status).toBe(200);
    expect(Array.isArray(messagesResponse.body.messages)).toBe(true);
  });

  it("persists new messages in a room", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const rooms = await request(app).get("/api/team-chat/rooms").set("Cookie", cookie);
    const roomId = rooms.body.rooms[0].id;
    const postResponse = await request(app)
      .post(`/api/team-chat/rooms/${roomId}/messages`)
      .set("Cookie", cookie)
      .send({ body: "Team chat integration test" });
    expect(postResponse.status).toBe(201);
    expect(postResponse.body.message?.body).toBe("Team chat integration test");

    const messagesResponse = await request(app)
      .get(`/api/team-chat/rooms/${roomId}/messages`)
      .set("Cookie", cookie);
    expect(messagesResponse.status).toBe(200);
    const bodies = (messagesResponse.body.messages as Array<{ body: string }>).map((msg) => msg.body);
    expect(bodies).toContain("Team chat integration test");
  });

  it("allows users to create and delete custom rooms they own", async () => {
    const cookie = await login("pm@humain.local", "Manager#123");
    const createResponse = await request(app)
      .post("/api/team-chat/rooms")
      .set("Cookie", cookie)
      .send({ name: "Night Ops", topic: "Late coverage" });
    expect(createResponse.status).toBe(201);
    const roomId = createResponse.body.room.id;

    const roomsAfterCreate = await request(app).get("/api/team-chat/rooms").set("Cookie", cookie);
    const roomNames = (roomsAfterCreate.body.rooms as Array<{ name: string }>).map((room) => room.name);
    expect(roomNames).toContain("Night Ops");

    const deleteResponse = await request(app).delete(`/api/team-chat/rooms/${roomId}`).set("Cookie", cookie);
    expect(deleteResponse.status).toBe(204);

    const roomsAfterDelete = await request(app).get("/api/team-chat/rooms").set("Cookie", cookie);
    const remainingIds = (roomsAfterDelete.body.rooms as Array<{ id: string }>).map((room) => room.id);
    expect(remainingIds).not.toContain(roomId);
  });

  it("prevents deleting rooms created by others unless super admin", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const createResponse = await request(app)
      .post("/api/team-chat/rooms")
      .set("Cookie", pmCookie)
      .send({ name: "Build Storm" });
    const roomId = createResponse.body.room.id;

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const deleteAsDev = await request(app).delete(`/api/team-chat/rooms/${roomId}`).set("Cookie", devCookie);
    expect(deleteAsDev.status).toBe(403);

    const superCookie = await login("super@humain.local", "Admin#123");
    const deleteAsSuper = await request(app).delete(`/api/team-chat/rooms/${roomId}`).set("Cookie", superCookie);
    expect(deleteAsSuper.status).toBe(204);
  });

  it("creates reusable direct rooms and restricts access to participants", async () => {
    const pmCookie = await login("pm@humain.local", "Manager#123");
    const directResponse = await request(app)
      .post("/api/team-chat/direct/user-super-admin")
      .set("Cookie", pmCookie);
    expect(directResponse.status).toBe(200);
    expect(directResponse.body.room?.type).toBe("DIRECT");
    expect(directResponse.body.room?.participantIds).toEqual(
      expect.arrayContaining(["user-super-admin", "user-pm-1"])
    );
    const roomId = directResponse.body.room.id;
    const repeatResponse = await request(app)
      .post("/api/team-chat/direct/user-super-admin")
      .set("Cookie", pmCookie);
    expect(repeatResponse.status).toBe(200);
    expect(repeatResponse.body.room.id).toBe(roomId);

    const devCookie = await login("dev@vendor.local", "Dev#1234");
    const forbidden = await request(app).get(`/api/team-chat/rooms/${roomId}/messages`).set("Cookie", devCookie);
    expect(forbidden.status).toBe(403);
  });
});
