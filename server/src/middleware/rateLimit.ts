import { Request, RequestHandler } from "express";

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
};

type RateLimitCounter = {
  count: number;
  expiresAt: number;
};

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const hits = new Map<string, RateLimitCounter>();
  let lastCleanup = Date.now();

  function getKey(req: Request) {
    if (options.keyGenerator) {
      return options.keyGenerator(req);
    }
    const ip = req.ip || req.socket.remoteAddress || "global";
    return `${ip}:${req.baseUrl}${req.path}`;
  }

  function cleanup(now: number) {
    if (now - lastCleanup < options.windowMs) {
      return;
    }
    for (const [key, counter] of hits) {
      if (counter.expiresAt <= now) {
        hits.delete(key);
      }
    }
    lastCleanup = now;
  }

  return (req, res, next) => {
    if (options.skip?.(req)) {
      return next();
    }

    const now = Date.now();
    cleanup(now);
    const key = getKey(req);
    const counter = hits.get(key);

    if (!counter || counter.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + options.windowMs });
      return next();
    }

    if (counter.count >= options.max) {
      const retryAfter = Math.max(1, Math.ceil((counter.expiresAt - now) / 1000));
      res.setHeader("Retry-After", `${retryAfter}`);
      return res.status(429).json({
        message: options.message ?? "Too many requests. Try again later."
      });
    }

    counter.count += 1;
    hits.set(key, counter);
    return next();
  };
}
