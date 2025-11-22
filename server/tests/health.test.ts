import request from "supertest";
import { app } from "../src/index";

describe("health endpoint", () => {
  it("returns ok true", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
