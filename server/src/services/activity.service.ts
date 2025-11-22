import { ActivityLog } from "../models/_types";
import { listActivityLogs } from "../data/repositories";

type ActivityQuery = {
  entityId?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
};

export async function fetchActivity(query: ActivityQuery): Promise<ActivityLog[]> {
  const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
  let logs = await listActivityLogs({
    entityId: query.entityId,
    entityType: query.entityType,
    actorId: query.userId,
    startDate: query.startDate,
    endDate: query.endDate
  });
  if (limit && limit > 0) {
    logs = logs.slice(0, limit);
  }
  return logs;
}

