import { DateTime } from "luxon";
import { createNotification, listNotifications } from "../data/repositories";
import { DigestPayload, buildMonthlyDigestPayloads, buildWeeklyDigestPayloads } from "../services/digest.service";

const ORG_TIMEZONE = process.env.ORG_TIMEZONE || "America/Los_Angeles";
const DIGEST_INTERVAL_MS = Number(process.env.DIGEST_INTERVAL_MS ?? 15 * 60 * 1000);

let timer: NodeJS.Timeout | null = null;
let running = false;
let weeklyMarker: string | null = null;
let monthlyMarker: string | null = null;

type NotificationCache = Map<string, Awaited<ReturnType<typeof listNotifications>>>;

export function startDigestScheduler() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    void evaluateDigestWindows();
  }, DIGEST_INTERVAL_MS);
  void evaluateDigestWindows();
}

async function evaluateDigestWindows() {
  if (running) {
    return;
  }
  running = true;
  try {
    const now = DateTime.now().setZone(ORG_TIMEZONE);
    if (!now.isValid) {
      return;
    }
    if (shouldRunWeekly(now)) {
      const period = resolveWeeklyPeriod(now);
      weeklyMarker = period.periodStart;
      await dispatchDigests(await buildWeeklyDigestPayloads(period.periodStart, period.periodEnd));
    }
    if (shouldRunMonthly(now)) {
      const period = resolveMonthlyPeriod(now);
      monthlyMarker = period.periodStart;
      await dispatchDigests(await buildMonthlyDigestPayloads(period.periodStart, period.periodEnd));
    }
  } catch (error) {
    console.error("[DigestScheduler] run failed", error);
  } finally {
    running = false;
  }
}

function shouldRunWeekly(now: DateTime): boolean {
  if (now.weekday !== 1) {
    return false;
  }
  if (now.hour < 8 || now.hour > 10) {
    return false;
  }
  const period = resolveWeeklyPeriod(now);
  return weeklyMarker !== period.periodStart;
}

function shouldRunMonthly(now: DateTime): boolean {
  if (now.day !== 1) {
    return false;
  }
  if (now.hour < 8 || now.hour > 10) {
    return false;
  }
  const period = resolveMonthlyPeriod(now);
  return monthlyMarker !== period.periodStart;
}

function resolveWeeklyPeriod(now: DateTime): { periodStart: string; periodEnd: string } {
  const startOfWeek = now.startOf("week");
  const periodEnd = startOfWeek.minus({ days: 1 });
  const periodStart = periodEnd.minus({ days: 6 });
  return {
    periodStart: periodStart.toISODate() ?? now.toISODate()!,
    periodEnd: periodEnd.toISODate() ?? now.toISODate()!
  };
}

function resolveMonthlyPeriod(now: DateTime): { periodStart: string; periodEnd: string } {
  const startOfMonth = now.startOf("month");
  const previousMonthEnd = startOfMonth.minus({ days: 1 });
  const previousMonthStart = previousMonthEnd.startOf("month");
  return {
    periodStart: previousMonthStart.toISODate() ?? startOfMonth.toISODate()!,
    periodEnd: previousMonthEnd.toISODate() ?? startOfMonth.toISODate()!
  };
}

async function dispatchDigests(payloads: DigestPayload[]) {
  if (!payloads.length) {
    return;
  }
  const cache: NotificationCache = new Map();
  for (const payload of payloads) {
    const alreadySent = await hasDigest(payload, cache);
    if (alreadySent) {
      continue;
    }
    await createNotification({
      userId: payload.userId,
      message: payload.message,
      type: payload.type,
      metadata: payload.metadata
    });
    // Placeholder: email delivery would be triggered here if SMTP is configured.
  }
}

async function hasDigest(payload: DigestPayload, cache: NotificationCache): Promise<boolean> {
  const cacheKey = `${payload.userId}:${payload.type}`;
  let history = cache.get(cacheKey);
  if (!history) {
    history = await listNotifications({ userId: payload.userId, type: payload.type, limit: 50 });
    cache.set(cacheKey, history);
  }
  return history.some((notification) => {
    const meta = notification.metadata as { periodStart?: string; digestType?: string } | undefined;
    return (
      meta?.periodStart === payload.metadata.periodStart &&
      meta?.digestType === payload.metadata.digestType
    );
  });
}
