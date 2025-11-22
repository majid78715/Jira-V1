import path from "node:path";
import { promises as fs } from "node:fs";
import { afterAll } from "vitest";

const testDbPath = process.env.DB_FILE_PATH ?? path.resolve(__dirname, "../../db/test-db.json");
const testDbLockPath = `${testDbPath}.lock`;

afterAll(async () => {
  await Promise.all([
    fs.rm(testDbPath, { force: true }),
    fs.rm(testDbLockPath, { force: true })
  ]);
});
