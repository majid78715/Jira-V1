import { promises as fs } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { writeDatabase } from "./db";
import {
  DatabaseSchema,
  User,
  createEmptyDatabaseState,
  Company,
  Profile,
  Role,
  CompanyType
} from "../models/_types";

type SeedUser = {
  id: string;
  email: string;
  role: Role;
  profile: Profile;
  companyId?: string;
  password?: string;
  passwordHash?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  profileStatus?: "ACTIVE" | "PENDING_APPROVAL" | "REJECTED";
  profileComment?: string;
  firstLoginRequired?: boolean;
};

type SeedCompany = {
  id: string;
  name: string;
  type: CompanyType;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function seedDatabase(seedFilePath?: string) {
  const seedPath = seedFilePath ?? path.resolve(__dirname, "../../../db/seed.json");
  console.log("Seeding database from:", seedPath); // DEBUG LOG
  const raw = await fs.readFile(seedPath, "utf-8");
  const payload = JSON.parse(raw) as Partial<DatabaseSchema>;
  const baseline = createEmptyDatabaseState();
  const seedUsers = ((payload.users as SeedUser[]) ?? []).map(normalizeSeedUser);
  const seedCompanies = ((payload.companies as SeedCompany[]) ?? []).map(normalizeSeedCompany);

  const seeded: DatabaseSchema = {
    ...baseline,
    users: seedUsers,
    userPreferences:
      (payload.userPreferences as DatabaseSchema["userPreferences"]) ?? baseline.userPreferences,
    companies: seedCompanies,
    userInvitations:
      (payload.userInvitations as DatabaseSchema["userInvitations"]) ?? baseline.userInvitations,
    profileChangeRequests:
      (payload.profileChangeRequests as DatabaseSchema["profileChangeRequests"]) ??
      baseline.profileChangeRequests,
    projects: (payload.projects as DatabaseSchema["projects"]) ?? baseline.projects,
    tasks: (payload.tasks as DatabaseSchema["tasks"]) ?? baseline.tasks,
    assignments: (payload.assignments as DatabaseSchema["assignments"]) ?? baseline.assignments,
    workflowDefinitions:
      (payload.workflowDefinitions as DatabaseSchema["workflowDefinitions"]) ??
      baseline.workflowDefinitions,
    workflowInstances:
      (payload.workflowInstances as DatabaseSchema["workflowInstances"]) ?? baseline.workflowInstances,
    workflowActions:
      (payload.workflowActions as DatabaseSchema["workflowActions"]) ?? baseline.workflowActions,
    timeEntries: (payload.timeEntries as DatabaseSchema["timeEntries"]) ?? baseline.timeEntries,
    workSchedules: (payload.workSchedules as DatabaseSchema["workSchedules"]) ?? baseline.workSchedules,
    companyHolidays:
      (payload.companyHolidays as DatabaseSchema["companyHolidays"]) ?? baseline.companyHolidays,
    dayOffs: (payload.dayOffs as DatabaseSchema["dayOffs"]) ?? baseline.dayOffs,
    attendanceRecords:
      (payload.attendanceRecords as DatabaseSchema["attendanceRecords"]) ?? baseline.attendanceRecords,
    timesheets: (payload.timesheets as DatabaseSchema["timesheets"]) ?? baseline.timesheets,
    comments: (payload.comments as DatabaseSchema["comments"]) ?? baseline.comments,
    attachments: (payload.attachments as DatabaseSchema["attachments"]) ?? baseline.attachments,
    alerts: (payload.alerts as DatabaseSchema["alerts"]) ?? baseline.alerts,
    notifications: (payload.notifications as DatabaseSchema["notifications"]) ?? baseline.notifications,
    activityLogs: (payload.activityLogs as DatabaseSchema["activityLogs"]) ?? baseline.activityLogs,
    chatSessions: (payload.chatSessions as DatabaseSchema["chatSessions"]) ?? baseline.chatSessions,
    chatMessages: (payload.chatMessages as DatabaseSchema["chatMessages"]) ?? baseline.chatMessages,
    teamChatRooms: (payload.teamChatRooms as DatabaseSchema["teamChatRooms"]) ?? baseline.teamChatRooms,
    teamChatMessages: (payload.teamChatMessages as DatabaseSchema["teamChatMessages"]) ?? baseline.teamChatMessages,
    rolePermissions: (payload.rolePermissions as DatabaseSchema["rolePermissions"]) ?? baseline.rolePermissions
  };
  await writeDatabase(seeded);
  console.log("Database seeded from", seedPath);
}

function normalizeSeedUser(user: SeedUser): User {
  const now = new Date().toISOString();
  const hash = user.passwordHash ?? (user.password ? bcrypt.hashSync(user.password, 10) : null);
  if (!hash) {
    throw new Error(`Seed user ${user.email} missing password.`);
  }
  return {
    id: user.id,
    email: user.email.toLowerCase(),
    role: user.role,
    profile: user.profile,
    companyId: user.companyId,
    passwordHash: hash,
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
    isActive: user.isActive ?? true,
    profileStatus: user.profileStatus ?? "ACTIVE",
    profileComment: user.profileComment,
    firstLoginRequired: user.firstLoginRequired ?? false
  };
}

function normalizeSeedCompany(company: SeedCompany): Company {
  const now = new Date().toISOString();
  return {
    id: company.id,
    name: company.name,
    type: company.type,
    description: company.description,
    isActive: company.isActive ?? true,
    createdAt: company.createdAt ?? now,
    updatedAt: company.updatedAt ?? now
  };
}




