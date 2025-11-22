import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createRateLimiter } from "../src/middleware/rateLimit";

type MockResponse = Response & {
  statusCode: number;
  payload?: unknown;
  headers: Record<string, string>;
};

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    json(payload: unknown) {
      this.payload = payload;
      return payload;
    }
  } as MockResponse;
}

function createRequest(ip = "127.0.0.1"): Request {
  return {
    ip,
    baseUrl: "/api/test",
    path: "/limit"
  } as Request;
}

describe("rate limiter middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("limits repeated requests within the window", () => {
    const limiter = createRateLimiter({
      windowMs: 1_000,
      max: 1,
      keyGenerator: () => "test-key",
      skip: () => false
    });
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({ message: expect.any(String) });
    expect(res.headers["Retry-After"]).toBeDefined();

    vi.advanceTimersByTime(1_000);
    const nextAttempt = createResponse();
    limiter(req, nextAttempt, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
