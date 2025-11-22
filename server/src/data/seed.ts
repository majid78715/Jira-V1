import { seedDatabase } from "./seedDatabase";

seedDatabase().catch((error) => {
  console.error("Failed to seed database:", error);
  process.exit(1);
});
