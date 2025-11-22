import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSchema, createEmptyDatabaseState } from "../models/_types";

const ROOT_DIR = path.resolve(__dirname, "../../../");
const DEFAULT_DB_FILE_PATH = path.join(ROOT_DIR, "db", "db.json");
const DB_FILE_PATH = process.env.DB_FILE_PATH ? path.resolve(process.env.DB_FILE_PATH) : DEFAULT_DB_FILE_PATH;
const DB_FILE_DIR = path.dirname(DB_FILE_PATH);
const LOCK_FILE_PATH = `${DB_FILE_PATH}.lock`;
const MAX_LOCK_RETRIES = 40;
const LOCK_RETRY_DELAY_MS = 25;
const STALE_LOCK_AGE_MS = 5000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDatabaseFile() {
  await fs.mkdir(DB_FILE_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE_PATH);
  } catch {
    await fs.writeFile(DB_FILE_PATH, JSON.stringify(createEmptyDatabaseState(), null, 2));
  }
}

async function acquireLock(attempt = 0): Promise<() => Promise<void>> {
  try {
    const handle = await fs.open(LOCK_FILE_PATH, "wx");
    return async () => {
      await handle.close();
      await fs.unlink(LOCK_FILE_PATH).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EEXIST" || err.code === "EPERM") {
      try {
        const stats = await fs.stat(LOCK_FILE_PATH);
        const now = Date.now();
        if (now - stats.mtimeMs > STALE_LOCK_AGE_MS) {
          await fs.unlink(LOCK_FILE_PATH).catch(() => {});
          return acquireLock(0);
        }
      } catch {
        // Ignore stat error
      }

      if (attempt >= MAX_LOCK_RETRIES) {
        throw new Error("Unable to acquire database lock.");
      }
      await delay(LOCK_RETRY_DELAY_MS * (attempt + 1));
      return acquireLock(attempt + 1);
    }
    throw err;
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    return await fn();
  } finally {
    await release();
  }
}

async function readSnapshot(): Promise<DatabaseSchema> {
  await ensureDatabaseFile();
  const raw = await fs.readFile(DB_FILE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
  return normalizeSnapshot(parsed);
}

async function persist(snapshot: DatabaseSchema) {
  await ensureDatabaseFile();
  await fs.writeFile(DB_FILE_PATH, JSON.stringify(normalizeSnapshot(snapshot), null, 2));
}

function normalizeSnapshot(payload: Partial<DatabaseSchema>): DatabaseSchema {
  const baseline = createEmptyDatabaseState();
  const ensureArray = <K extends keyof DatabaseSchema>(key: K): DatabaseSchema[K] => {
    return Array.isArray(payload[key]) ? (payload[key] as DatabaseSchema[K]) : baseline[key];
  };

  return {
    users: ensureArray("users"),
    userPreferences: ensureArray("userPreferences"),
    companies: ensureArray("companies"),
    userInvitations: ensureArray("userInvitations"),
    profileChangeRequests: ensureArray("profileChangeRequests"),
    projects: ensureArray("projects"),
    tasks: ensureArray("tasks"),
    assignments: ensureArray("assignments"),
    workflowDefinitions: ensureArray("workflowDefinitions"),
    workflowInstances: ensureArray("workflowInstances"),
    workflowActions: ensureArray("workflowActions"),
    timeEntries: ensureArray("timeEntries"),
    workSchedules: ensureArray("workSchedules"),
    companyHolidays: ensureArray("companyHolidays"),
    dayOffs: ensureArray("dayOffs"),
    attendanceRecords: ensureArray("attendanceRecords"),
    timesheets: ensureArray("timesheets"),
    comments: ensureArray("comments"),
    attachments: ensureArray("attachments"),
    alerts: ensureArray("alerts"),
    notifications: ensureArray("notifications"),
    activityLogs: ensureArray("activityLogs"),
    chatSessions: ensureArray("chatSessions"),
    chatMessages: ensureArray("chatMessages"),
    teamChatRooms: ensureArray("teamChatRooms"),
    teamChatMessages: ensureArray("teamChatMessages"),
    rolePermissions: ensureArray("rolePermissions"),
    releases: ensureArray("releases"),
    workItemTypes: ensureArray("workItemTypes"),
    workflowSchemes: ensureArray("workflowSchemes"),
    systemSettings: ensureArray("systemSettings")
  };
}

export async function readDatabase(): Promise<DatabaseSchema> {
  return withLock(async () => readSnapshot());
}

export async function writeDatabase(data: DatabaseSchema): Promise<DatabaseSchema> {
  return withLock(async () => {
    await persist(data);
    return data;
  });
}

export async function updateDatabase(
  mutator: (db: DatabaseSchema) => DatabaseSchema | Promise<DatabaseSchema>
): Promise<DatabaseSchema> {
  return withLock(async () => {
    const current = await readSnapshot();
    const updated = await mutator(current);
    await persist(updated);
    return updated;
  });
}



