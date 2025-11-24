import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.resolve(__dirname, "../db/test-db.json");

if (!process.env.DB_FILE_PATH) {
  process.env.DB_FILE_PATH = testDbPath;
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    sequence: {
      concurrent: false
    }
  }
});
