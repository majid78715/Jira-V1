import { randomUUID } from "node:crypto";
import { readDatabase, updateDatabase } from "./db";
import {
  DashboardFilterParams,
  ActivityLog,
  Assignment,
  AssignmentStatus,
  Attachment,
  AttachmentEntityType,
  Comment,
  CommentEntityType,
  Company,
  CompanyType,
  Notification,
  Profile,
  ProfileChangeRequest,
  ProfileStatus,
  Project,
  ProjectStatus,
  ProjectPriority,
  ProjectStage,
  ProjectHealth,
  ProjectRiskLevel,
  ProjectType,
  ProjectRateModel,
  PublicCompany,
  PublicInvitation,
  PublicProfileChangeRequest,
  PublicUser,
  PermissionModule,
  RolePermission,
  Role,
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  TaskItemType,
  TaskSprint,
  TaskAssignmentPlanEntry,
  TaskTypeMeta,
  ProjectPackageStatus,
  ProjectPackageReturnTarget,
  User,
  UserDashboardPreferences,
  UserPreferences,
  UserInvitation,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowAction,
  WorkflowStepInstance,
  WorkflowInstanceStatus,
  WorkflowEntityType,
  WorkflowActionType,
  WorkflowStepDefinition,
  WorkflowApproverDynamic,
  WorkflowApproverType,
  WorkSchedule,
  CompanyHoliday,
  DayOff,
  DayOffStatus,
  WorkScheduleSlot,
  AttendanceRecord,
  AttendanceStatus,
  TimeEntry,
  TimeEntrySource,
  Timesheet,
  TimesheetStatus,
  Alert,
  AlertStatus,
  AlertType,
  ChatSession,
  ChatMessage,
  ChatMessageRole,
  CallEventPayload,
  TeamChatRoom,
  TeamChatMessage,
  UserInvitationStatus,
  LeaveType,
  Release,
  ReleaseStatus,
  WorkItemType,
  WorkflowScheme,
  WorkflowState,
  WorkflowTransition,
  RoleDefinition,
  Meeting,
  MeetingStatus,
  MeetingType
} from "../models/_types";
import { nowISO } from "../utils/date";
import { validateCompany, validateProfile } from "../utils/validation";

export type NewUserInput = {
  email: string;
  passwordHash: string;
  role: Role;
  profile: Profile;
  companyId?: string;
  isActive?: boolean;
  profileStatus?: ProfileStatus;
  profileComment?: string;
  firstLoginRequired?: boolean;
  preferences?: UserDashboardPreferences;
  vpUserId?: string;
};

export type UpdateUserInput = Partial<
  Pick<
    User,
    | "email"
    | "role"
    | "isActive"
    | "profile"
    | "companyId"
    | "profileStatus"
    | "profileComment"
    | "passwordHash"
    | "firstLoginRequired"
    | "preferences"
    | "vpUserId"
  >
>;

export type UpsertUserPreferencesInput = {
  userId: string;
  notificationPreferences: UserPreferences["notificationPreferences"];
  workflowPreferences: UserPreferences["workflowPreferences"];
  availabilityPreferences: UserPreferences["availabilityPreferences"];
};

export type NewCompanyInput = {
  name: string;
  type: CompanyType;
  description?: string;
  isActive?: boolean;
  ceoUserId?: string;
  vendorOwnerUserId?: string;
  vendorCeoUserId?: string;
  region?: string;
  timeZone?: string;
  slaConfig?: {
    responseTimeHours?: number;
    resolutionTimeHours?: number;
    notes?: string;
  };
};

export type UpdateCompanyInput = Partial<
  Pick<
    Company,
    | "name"
    | "type"
    | "description"
    | "isActive"
    | "ceoUserId"
    | "vendorOwnerUserId"
    | "vendorCeoUserId"
    | "region"
    | "timeZone"
    | "slaConfig"
  >
>;

const cloneStringArray = (value?: string[]): string[] | undefined => (value ? [...value] : undefined);

const cloneDashboardFilterParams = (params: DashboardFilterParams): DashboardFilterParams => ({
  ...params,
  businessUnitIds: cloneStringArray(params.businessUnitIds),
  productModuleIds: cloneStringArray(params.productModuleIds),
  projectIds: cloneStringArray(params.projectIds),
  vendorIds: cloneStringArray(params.vendorIds),
  productManagerIds: cloneStringArray(params.productManagerIds),
  statusList: params.statusList ? [...params.statusList] : undefined,
  riskLevels: params.riskLevels ? [...params.riskLevels] : undefined,
  healthList: params.healthList ? [...params.healthList] : undefined
});

const normalizeDashboardPreferences = (
  preferences?: UserDashboardPreferences
): UserDashboardPreferences => ({
  savedDashboardViews: (preferences?.savedDashboardViews ?? []).map((view) => ({
    ...view,
    filterParams: cloneDashboardFilterParams(view.filterParams)
  })),
  managedVendorIds: cloneStringArray(preferences?.managedVendorIds),
  preferredCompanyIds: cloneStringArray(preferences?.preferredCompanyIds)
});

const cloneDashboardPreferences = (
  preferences?: UserDashboardPreferences
): UserDashboardPreferences | undefined => {
  if (!preferences) {
    return undefined;
  }
  return normalizeDashboardPreferences(preferences);
};

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  companyId: user.companyId,
  isActive: user.isActive,
  profileStatus: user.profileStatus,
  profileComment: user.profileComment,
  firstLoginRequired: user.firstLoginRequired,
  vpUserId: user.vpUserId,
  profile: user.profile,
  permittedModules: user.permittedModules,
  preferences: cloneDashboardPreferences(user.preferences),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const toPublicCompany = (company: Company): PublicCompany => ({
  ...company
});

export async function listRolePermissions(): Promise<RolePermission[]> {
  const db = await readDatabase();
  return [...db.rolePermissions];
}

export async function getRolePermissionByRole(role: Role): Promise<RolePermission | undefined> {
  const db = await readDatabase();
  return db.rolePermissions.find((entry) => entry.role === role);
}

export async function setRolePermissions(role: Role, modules: PermissionModule[]): Promise<RolePermission> {
  const uniqueModules = Array.from(new Set(modules));
  const timestamp = nowISO();
  let record: RolePermission | undefined;

  await updateDatabase((db) => {
    const existingIndex = db.rolePermissions.findIndex((entry) => entry.role === role);
    const current = existingIndex >= 0 ? db.rolePermissions[existingIndex] : undefined;
    const nextRecord: RolePermission = {
      id: current?.id ?? randomUUID(),
      role,
      modules: uniqueModules,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    if (existingIndex >= 0) {
      db.rolePermissions[existingIndex] = nextRecord;
    } else {
      db.rolePermissions.push(nextRecord);
    }
    record = nextRecord;
    return db;
  });

  return record!;
}
export async function listUsers(): Promise<PublicUser[]> {
  const db = await readDatabase();
  return db.users.map(toPublicUser);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await readDatabase();
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = await readDatabase();
  return db.users.find((user) => user.id === id);
}

export async function createUser(input: NewUserInput): Promise<PublicUser> {
  validateProfile(input.profile);
  if (input.companyId) {
    const company = await getCompanyById(input.companyId);
    if (!company) {
      throw new Error("Company not found.");
    }
  }
  const timestamp = nowISO();
  const dashboardPreferences = normalizeDashboardPreferences(input.preferences);
  const user: User = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    email: input.email.toLowerCase(),
    passwordHash: input.passwordHash,
    role: input.role,
    profile: input.profile,
    companyId: input.companyId,
    isActive: input.isActive ?? true,
    profileStatus: input.profileStatus ?? "ACTIVE",
    profileComment: input.profileComment,
    firstLoginRequired: input.firstLoginRequired ?? false,
    preferences: dashboardPreferences,
    vpUserId: input.vpUserId
  };

  await updateDatabase(async (db) => {
    if (db.users.some((existing) => existing.email === user.email)) {
      throw new Error("User with this email already exists.");
    }
    db.users.push(user);
    return db;
  });

  return toPublicUser(user);
}

export async function updateUser(id: string, update: UpdateUserInput): Promise<PublicUser> {
  if (update.email) {
    update.email = update.email.trim().toLowerCase();
  }
  if (update.profile) {
    validateProfile(update.profile);
  }

  let updatedUser: User | undefined;

  await updateDatabase(async (db) => {
    const userIndex = db.users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      throw new Error("User not found.");
    }
    if (update.email && db.users.some((user, index) => index !== userIndex && user.email === update.email)) {
      throw new Error("User with this email already exists.");
    }
    const existingUser = db.users[userIndex];
    const mergedPreferences =
      update.preferences !== undefined
        ? normalizeDashboardPreferences(update.preferences)
        : existingUser.preferences ?? normalizeDashboardPreferences();
    const merged: User = {
      ...existingUser,
      ...update,
      profile: update.profile ?? existingUser.profile,
      preferences: mergedPreferences,
      updatedAt: nowISO()
    };
    db.users[userIndex] = merged;
    updatedUser = merged;
    return db;
  });

  if (!updatedUser) {
    throw new Error("Unable to update user.");
  }

  return toPublicUser(updatedUser);
}

export async function deleteUserCascade(userId: string, deletedById: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      throw new Error("User not found.");
    }

    db.users.splice(index, 1);
    const timestamp = nowISO();
    const replaceUser = <T extends string | undefined>(value: T): T => {
      if (value && value === userId) {
        return (deletedById as T);
      }
      return value;
    };

    const removeUserFromList = (values: string[] | undefined): string[] => (values || []).filter((value) => value !== userId);

    db.userPreferences = db.userPreferences.filter((preference) => preference.userId !== userId);
    db.workSchedules = db.workSchedules.filter((schedule) => schedule.userId !== userId);

    db.profileChangeRequests = db.profileChangeRequests
      .filter((request) => request.userId !== userId)
      .map((request) => {
        let mutated = false;
        if (request.requestedById === userId) {
          request.requestedById = deletedById;
          mutated = true;
        }
        if (request.reviewedById === userId) {
          request.reviewedById = deletedById;
          mutated = true;
        }
        return mutated ? { ...request, updatedAt: timestamp } : request;
      });

    db.notifications = db.notifications.filter((notification) => notification.userId !== userId);

    db.dayOffs = db.dayOffs
      .filter((dayOff) => dayOff.userId !== userId)
      .map((dayOff) => {
        const shouldUpdate =
          dayOff.requestedById === userId ||
          dayOff.submittedById === userId ||
          dayOff.approvedById === userId ||
          dayOff.rejectedById === userId ||
          dayOff.cancelledById === userId ||
          dayOff.backupContactUserId === userId;
        if (!shouldUpdate) {
          return dayOff;
        }
        return {
          ...dayOff,
          requestedById: replaceUser(dayOff.requestedById)!,
          submittedById: replaceUser(dayOff.submittedById),
          approvedById: replaceUser(dayOff.approvedById),
          rejectedById: replaceUser(dayOff.rejectedById),
          cancelledById: replaceUser(dayOff.cancelledById),
          backupContactUserId: dayOff.backupContactUserId === userId ? undefined : dayOff.backupContactUserId,
          updatedAt: timestamp
        };
      });

    db.attendanceRecords = db.attendanceRecords.filter((record) => record.userId !== userId);
    db.timeEntries = db.timeEntries.filter((entry) => entry.userId !== userId);

    db.timesheets = db.timesheets
      .filter((sheet) => sheet.userId !== userId)
      .map((sheet) => {
        const shouldUpdate =
          sheet.submittedById === userId || sheet.approvedById === userId || sheet.rejectedById === userId;
        if (!shouldUpdate) {
          return sheet;
        }
        return {
          ...sheet,
          submittedById: replaceUser(sheet.submittedById),
          approvedById: replaceUser(sheet.approvedById),
          rejectedById: replaceUser(sheet.rejectedById),
          updatedAt: timestamp
        };
      });

    db.assignments = db.assignments
      .filter((assignment) => assignment.developerId !== userId)
      .map((assignment) => {
        const shouldUpdate =
          assignment.requestedById === userId || assignment.approvedById === userId || assignment.canceledById === userId;
        if (!shouldUpdate) {
          return assignment;
        }
        return {
          ...assignment,
          requestedById: replaceUser(assignment.requestedById)!,
          approvedById: replaceUser(assignment.approvedById),
          canceledById: replaceUser(assignment.canceledById),
          updatedAt: timestamp
        };
      });

    db.projects = db.projects.map((project) => {
      let mutated = false;
      let ownerId = project.ownerId;
      let sponsorUserId = project.sponsorUserId;
      let deliveryManagerUserId = project.deliveryManagerUserId;
      const coreTeamUserIds = removeUserFromList(project.coreTeamUserIds);
      const stakeholderUserIds = removeUserFromList(project.stakeholderUserIds);
      const ownerIds = removeUserFromList(project.ownerIds);
      const deliveryManagerUserIds = removeUserFromList(project.deliveryManagerUserIds);

      if (ownerId === userId) {
        ownerId = deletedById;
        mutated = true;
      }
      if (sponsorUserId === userId) {
        sponsorUserId = deletedById;
        mutated = true;
      }
      if (deliveryManagerUserId === userId) {
        deliveryManagerUserId = deletedById;
        mutated = true;
      }
      if (coreTeamUserIds.length !== (project.coreTeamUserIds?.length ?? 0)) {
        mutated = true;
      }
      if (stakeholderUserIds.length !== (project.stakeholderUserIds?.length ?? 0)) {
        mutated = true;
      }
      if (ownerIds.length !== (project.ownerIds?.length ?? 0)) {
        mutated = true;
      }
      if (deliveryManagerUserIds.length !== (project.deliveryManagerUserIds?.length ?? 0)) {
        mutated = true;
      }

      if (!mutated) {
        return project;
      }

      return {
        ...project,
        ownerId,
        sponsorUserId,
        deliveryManagerUserId,
        coreTeamUserIds,
        stakeholderUserIds,
        ownerIds,
        deliveryManagerUserIds,
        updatedAt: timestamp
      };
    });

    db.tasks = db.tasks.map((task) => {
      let mutated = false;
      let createdById = task.createdById;
      let reporterUserId = task.reporterUserId;
      let assigneeUserId = task.assigneeUserId;

      if (createdById === userId) {
        createdById = deletedById;
        mutated = true;
      }
      if (reporterUserId === userId) {
        reporterUserId = deletedById;
        mutated = true;
      }
      if (assigneeUserId === userId) {
        assigneeUserId = undefined;
        mutated = true;
      }

      if (!mutated) {
        return task;
      }

      return {
        ...task,
        createdById,
        reporterUserId,
        assigneeUserId,
        updatedAt: timestamp
      };
    });

    db.userInvitations = db.userInvitations
      .filter((invitation) => invitation.acceptedUserId !== userId)
      .map((invitation) => {
        if (invitation.invitedById !== userId) {
          return invitation;
        }
        return { ...invitation, invitedById: deletedById, updatedAt: timestamp };
      });

    db.alerts = db.alerts
      .filter((alert) => alert.userId !== userId)
      .map((alert) => {
        if (alert.resolvedById !== userId) {
          return alert;
        }
        return { ...alert, resolvedById: deletedById, updatedAt: timestamp };
      });

    db.comments = db.comments.filter((comment) => comment.authorId !== userId);
    db.attachments = db.attachments.filter((attachment) => attachment.uploaderId !== userId);

    db.workflowActions = db.workflowActions.map((action) => {
      if (action.actorId !== userId) {
        return action;
      }
      return { ...action, actorId: deletedById, updatedAt: timestamp };
    });

    db.activityLogs = db.activityLogs.map((log) => {
      if (log.actorId !== userId) {
        return log;
      }
      return { ...log, actorId: deletedById, updatedAt: timestamp };
    });

    const removedSessionIds = new Set<string>();
    db.chatSessions = db.chatSessions.filter((session) => {
      if (session.userId === userId) {
        removedSessionIds.add(session.id);
        return false;
      }
      return true;
    });
    db.chatMessages = db.chatMessages.filter(
      (message) => message.userId !== userId && !removedSessionIds.has(message.sessionId)
    );

    const removedRoomIds = new Set<string>();
    db.teamChatRooms = db.teamChatRooms
      .map((room) => {
        let mutated = false;
        const participantIds = room.participantIds ? removeUserFromList(room.participantIds) : room.participantIds;
        if (participantIds && room.participantIds && participantIds.length !== room.participantIds.length) {
          mutated = true;
        }
        const createdById = room.createdById === userId ? deletedById : room.createdById;
        if (createdById !== room.createdById) {
          mutated = true;
        }
        if (!mutated) {
          return room;
        }
        return { ...room, participantIds, createdById, updatedAt: timestamp };
      })
      .filter((room) => {
        const participantCount = room.participantIds?.length ?? 0;
        if (participantCount === 0 || (room.type === "DIRECT" && participantCount < 2)) {
          removedRoomIds.add(room.id);
          return false;
        }
        return true;
      });
    db.teamChatMessages = db.teamChatMessages.filter(
      (message) => message.authorId !== userId && !removedRoomIds.has(message.roomId)
    );

    return db;
  });
}

export async function getUserPreferencesByUserId(userId: string): Promise<UserPreferences | undefined> {
  const db = await readDatabase();
  const match = db.userPreferences.find((entry) => entry.userId === userId);
  return match ? { ...match } : undefined;
}

export async function upsertUserPreferences(input: UpsertUserPreferencesInput): Promise<UserPreferences> {
  const timestamp = nowISO();
  let stored: UserPreferences | undefined;
  await updateDatabase(async (db) => {
    const index = db.userPreferences.findIndex((entry) => entry.userId === input.userId);
    if (index === -1) {
      const created: UserPreferences = {
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...input
      };
      db.userPreferences.push(created);
      stored = created;
    } else {
      const updated: UserPreferences = {
        ...db.userPreferences[index],
        ...input,
        updatedAt: timestamp
      };
      db.userPreferences[index] = updated;
      stored = updated;
    }
    return db;
  });

  if (!stored) {
    throw new Error("Unable to store user preferences.");
  }

  return { ...stored };
}

export async function listCompanies(): Promise<PublicCompany[]> {
  const db = await readDatabase();
  return db.companies.map(toPublicCompany);
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
  const db = await readDatabase();
  return db.companies.find((company) => company.id === id);
}

export async function createCompany(input: NewCompanyInput): Promise<PublicCompany> {
  validateCompany(input);
  const timestamp = nowISO();
  const company: Company = {
    id: randomUUID(),
    name: input.name.trim(),
    type: input.type,
    description: input.description,
    isActive: input.isActive ?? true,
    ceoUserId: input.ceoUserId,
    vendorOwnerUserId: input.vendorOwnerUserId,
    vendorCeoUserId: input.vendorCeoUserId,
    region: input.region,
    timeZone: input.timeZone,
    slaConfig: input.slaConfig ? { ...input.slaConfig } : undefined,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await updateDatabase(async (db) => {
    db.companies.push(company);
    return db;
  });

  return toPublicCompany(company);
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<PublicCompany> {
  if (input.name) {
    input.name = input.name.trim();
  }

  validateCompany(input, true);

  let stored: Company | undefined;
  await updateDatabase(async (db) => {
    const index = db.companies.findIndex((company) => company.id === id);
    if (index === -1) {
      throw new Error("Company not found.");
    }
    const updated: Company = {
      ...db.companies[index],
      ...input,
      updatedAt: nowISO()
    };
    db.companies[index] = updated;
    stored = updated;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update company.");
  }

  return toPublicCompany(stored);
}

export async function deleteCompany(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.companies.findIndex((company) => company.id === id);
    if (index === -1) {
      throw new Error("Company not found.");
    }

    const linkedUsers = db.users.filter((user) => user.companyId === id);
    const dependencies: string[] = [];
    if (db.userInvitations.some((invitation) => invitation.companyId === id)) {
      dependencies.push("invitations");
    }
    // Projects are now cleaned up instead of blocking deletion
    if (db.workSchedules.some((schedule) => schedule.companyId === id)) {
      dependencies.push("work schedules");
    }
    if (db.companyHolidays.some((holiday) => holiday.companyId === id)) {
      dependencies.push("company holidays");
    }
    if (db.alerts.some((alert) => alert.companyId === id)) {
      dependencies.push("alerts");
    }

    if (dependencies.length > 0) {
      throw new Error(`Cannot delete company with linked ${dependencies.join(", ")}.`);
    }

    const timestamp = nowISO();

    // Unlink users
    if (linkedUsers.length > 0) {
      db.users = db.users.map((user) =>
        user.companyId === id ? { ...user, companyId: undefined, updatedAt: timestamp } : user
      );
    }

    // Unlink projects
    db.projects = db.projects.map((project) => {
      let mutated = false;
      let primaryVendorId = project.primaryVendorId;
      let vendorCompanyIds = project.vendorCompanyIds;
      let additionalVendorIds = project.additionalVendorIds;

      if (primaryVendorId === id) {
        primaryVendorId = undefined;
        mutated = true;
      }
      if (vendorCompanyIds?.includes(id)) {
        vendorCompanyIds = vendorCompanyIds.filter((vid) => vid !== id);
        mutated = true;
      }
      if (additionalVendorIds?.includes(id)) {
        additionalVendorIds = additionalVendorIds.filter((vid) => vid !== id);
        mutated = true;
      }

      if (!mutated) {
        return project;
      }

      return {
        ...project,
        primaryVendorId,
        vendorCompanyIds,
        additionalVendorIds,
        updatedAt: timestamp
      };
    });

    db.companies.splice(index, 1);
    return db;
  });
}

type CreateInvitationInput = {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  companyId?: string;
  invitedById: string;
};

export async function listUsersByRole(role: Role, companyId?: string): Promise<PublicUser[]> {
  const db = await readDatabase();
  return db.users
    .filter((user) => user.role === role && user.isActive && (!companyId || user.companyId === companyId))
    .map(toPublicUser);
}

export async function listUserInvitations(
  options: {
    role?: Role;
    companyId?: string;
    email?: string;
    invitedById?: string;
    status?: UserInvitationStatus;
  } = {}
): Promise<PublicInvitation[]> {
  const db = await readDatabase();
  return db.userInvitations
    .filter((invite) => {
      if (options.role && invite.role !== options.role) {
        return false;
      }
      if (options.companyId && invite.companyId !== options.companyId) {
        return false;
      }
      if (options.email && invite.email !== options.email.toLowerCase()) {
        return false;
      }
      if (options.invitedById && invite.invitedById !== options.invitedById) {
        return false;
      }
      if (options.status && invite.status !== options.status) {
        return false;
      }
      return true;
    })
    .map((invitation) => ({ ...invitation }));
}

export async function createUserInvitation(input: CreateInvitationInput): Promise<PublicInvitation> {
  const timestamp = nowISO();
  const invitation: UserInvitation = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    email: input.email.toLowerCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: input.role,
    companyId: input.companyId,
    invitedById: input.invitedById,
    token: randomUUID(),
    status: "SENT"
  };

  await updateDatabase(async (db) => {
    if (db.users.some((user) => user.email === invitation.email)) {
      throw new Error("User already exists with this email.");
    }
    if (db.userInvitations.some((inv) => inv.email === invitation.email && inv.status === "SENT")) {
      throw new Error("An invitation has already been sent to this email.");
    }
    db.userInvitations.push(invitation);
    return db;
  });

  await recordActivity(input.invitedById, "INVITE_CREATED", `Invited ${invitation.email} as ${invitation.role}`, {
    invitationId: invitation.id
  });

  return { ...invitation };
}

export async function createAcceptedInvitation(
  input: CreateInvitationInput & { acceptedUserId: string }
): Promise<PublicInvitation> {
  const timestamp = nowISO();
  const invitation: UserInvitation = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    email: input.email.toLowerCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: input.role,
    companyId: input.companyId,
    invitedById: input.invitedById,
    token: randomUUID(),
    status: "ACCEPTED",
    acceptedUserId: input.acceptedUserId
  };

  await updateDatabase(async (db) => {
    db.userInvitations.push(invitation);
    return db;
  });

  await recordActivity(input.invitedById, "INVITE_CREATED", `Created accepted invitation for ${invitation.email}`, {
    invitationId: invitation.id
  });

  return { ...invitation };
}

export async function getInvitationByToken(token: string): Promise<UserInvitation | undefined> {
  const db = await readDatabase();
  return db.userInvitations.find((invitation) => invitation.token === token);
}

export async function getInvitationById(id: string): Promise<UserInvitation | undefined> {
  const db = await readDatabase();
  return db.userInvitations.find((invitation) => invitation.id === id);
}

export async function markInvitationAccepted(invitationId: string, userId: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.userInvitations.findIndex((invitation) => invitation.id === invitationId);
    if (index === -1) {
      throw new Error("Invitation not found.");
    }
    db.userInvitations[index] = {
      ...db.userInvitations[index],
      status: "ACCEPTED",
      acceptedUserId: userId,
      updatedAt: nowISO()
    };
    return db;
  });
}

export async function markInvitationCancelled(invitationId: string): Promise<PublicInvitation> {
  let updated: UserInvitation | undefined;
  await updateDatabase(async (db) => {
    const index = db.userInvitations.findIndex((invitation) => invitation.id === invitationId);
    if (index === -1) {
      throw new Error("Invitation not found.");
    }
    const current = db.userInvitations[index];
    if (current.status !== "SENT") {
      throw new Error("Only pending invitations can be cancelled.");
    }
    updated = {
      ...current,
      status: "CANCELLED",
      updatedAt: nowISO()
    };
    db.userInvitations[index] = updated!;
    return db;
  });
  return { ...updated! };
}

export async function markInvitationsAcceptedByEmail(email: string, userId: string): Promise<void> {
  await updateDatabase(async (db) => {
    const targetIndex = db.userInvitations.findIndex(
      (invitation) => invitation.email === email.toLowerCase() && invitation.status === "SENT"
    );
    if (targetIndex === -1) {
      return db;
    }
    db.userInvitations[targetIndex] = {
      ...db.userInvitations[targetIndex],
      status: "ACCEPTED",
      acceptedUserId: userId,
      updatedAt: nowISO()
    };
    return db;
  });
}

type CreateProfileChangeRequestInput = {
  userId: string;
  requestedById: string;
  profile: Profile;
};

export async function listPendingProfiles(): Promise<PublicUser[]> {
  const db = await readDatabase();
  return db.users.filter((user) => user.profileStatus === "PENDING_APPROVAL").map(toPublicUser);
}

export async function createProfileChangeRequest(
  input: CreateProfileChangeRequestInput
): Promise<PublicProfileChangeRequest> {
  validateProfile(input.profile);
  const timestamp = nowISO();
  const request: ProfileChangeRequest = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    requestedById: input.requestedById,
    profile: input.profile,
    status: "PENDING"
  };

  await updateDatabase(async (db) => {
    db.profileChangeRequests.push(request);
    return db;
  });

  await recordActivity(input.requestedById, "PROFILE_CHANGE_REQUESTED", "Submitted profile change request", {
    requestId: request.id
  });

  return request;
}

export async function listProfileChangeRequests(status?: "PENDING" | "APPROVED" | "REJECTED"): Promise<
  PublicProfileChangeRequest[]
> {
  const db = await readDatabase();
  return db.profileChangeRequests
    .filter((request) => (status ? request.status === status : true))
    .map((request) => ({ ...request }));
}

export async function getProfileChangeRequestById(id: string): Promise<ProfileChangeRequest | undefined> {
  const db = await readDatabase();
  return db.profileChangeRequests.find((request) => request.id === id);
}

export async function updateProfileChangeRequest(
  id: string,
  update: Partial<Pick<ProfileChangeRequest, "status" | "reviewedById" | "reviewedAt" | "decisionComment">>
): Promise<PublicProfileChangeRequest> {
  let stored: ProfileChangeRequest | undefined;
  await updateDatabase(async (db) => {
    const index = db.profileChangeRequests.findIndex((request) => request.id === id);
    if (index === -1) {
      throw new Error("Profile change request not found.");
    }
    db.profileChangeRequests[index] = {
      ...db.profileChangeRequests[index],
      ...update,
      updatedAt: nowISO()
    };
    stored = db.profileChangeRequests[index];
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update profile change request.");
  }

  return { ...stored };
}

export async function recordActivity(
  actorId: string,
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
  entityId?: string,
  entityType?: string
): Promise<ActivityLog> {
  const log: ActivityLog = {
    id: randomUUID(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    actorId,
    action,
    entityId,
    entityType,
    message,
    metadata
  };
  await updateDatabase(async (db) => {
    db.activityLogs.push(log);
    return db;
  });
  return log;
}

export async function sendNotifications(
  userIds: string[],
  message: string,
  type: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!userIds.length) {
    return;
  }
  const timestamp = nowISO();
  const notifications: Notification[] = userIds.map((userId) => ({
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId,
    message,
    type,
    read: false,
    metadata
  }));

  await updateDatabase(async (db) => {
    db.notifications.push(...notifications);
    return db;
  });
}

export type NewNotificationInput = {
  userId: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
};

export async function createNotification(input: NewNotificationInput): Promise<Notification> {
  const timestamp = nowISO();
  const notification: Notification = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    message: input.message,
    type: input.type,
    read: false,
    metadata: input.metadata
  };

  await updateDatabase(async (db) => {
    db.notifications.push(notification);
    return db;
  });

  return { ...notification };
}

type NotificationFilters = {
  userId?: string;
  read?: boolean;
  type?: string;
  limit?: number;
};

export async function listNotifications(filters: NotificationFilters = {}): Promise<Notification[]> {
  const db = await readDatabase();
  let results = db.notifications
    .filter((notification) => {
      if (filters.userId && notification.userId !== filters.userId) {
        return false;
      }
      if (typeof filters.read === "boolean" && notification.read !== filters.read) {
        return false;
      }
      if (filters.type && notification.type !== filters.type) {
        return false;
      }
      return true;
    })
    .map((notification) => ({ ...notification }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (filters.limit && filters.limit > 0) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

export async function markNotificationRead(id: string, userId: string): Promise<Notification> {
  let stored: Notification | undefined;
  await updateDatabase(async (db) => {
    const index = db.notifications.findIndex((notification) => notification.id === id && notification.userId === userId);
    if (index === -1) {
      throw new Error("Notification not found.");
    }
    const updated: Notification = {
      ...db.notifications[index],
      read: true,
      updatedAt: nowISO()
    };
    db.notifications[index] = updated;
    stored = updated;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update notification.");
  }

  return { ...stored };
}

type ListAlertFilters = {
  statuses?: AlertStatus[];
  types?: AlertType[];
  userId?: string;
  projectId?: string;
  companyId?: string;
  search?: string;
};

export async function listAlerts(filters: ListAlertFilters = {}): Promise<Alert[]> {
  const statuses = filters.statuses?.length ? new Set(filters.statuses) : null;
  const types = filters.types?.length ? new Set(filters.types) : null;
  const search = filters.search?.trim().toLowerCase();
  const db = await readDatabase();
  return db.alerts
    .filter((alert) => {
      if (statuses && !statuses.has(alert.status)) {
        return false;
      }
      if (types && !types.has(alert.type)) {
        return false;
      }
      if (filters.userId && alert.userId !== filters.userId) {
        return false;
      }
      if (filters.projectId && alert.projectId !== filters.projectId) {
        return false;
      }
      if (filters.companyId && alert.companyId !== filters.companyId) {
        return false;
      }
      if (search && !alert.message.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    })
    .map((alert) => ({ ...alert }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAlertById(id: string): Promise<Alert | undefined> {
  const db = await readDatabase();
  const match = db.alerts.find((alert) => alert.id === id);
  return match ? { ...match } : undefined;
}

export async function findAlertByFingerprint(fingerprint: string): Promise<Alert | undefined> {
  const db = await readDatabase();
  const match = db.alerts.find((alert) => alert.fingerprint === fingerprint);
  return match ? { ...match } : undefined;
}

export type NewAlertInput = {
  type: AlertType;
  message: string;
  fingerprint: string;
  status?: AlertStatus;
  metadata?: Record<string, unknown>;
  entityId?: string;
  entityType?: string;
  userId?: string;
  projectId?: string;
  companyId?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
};

export async function createAlert(input: NewAlertInput): Promise<Alert> {
  const timestamp = nowISO();
  const alert: Alert = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    type: input.type,
    message: input.message,
    fingerprint: input.fingerprint,
    status: input.status ?? "OPEN",
    metadata: input.metadata,
    entityId: input.entityId,
    entityType: input.entityType,
    userId: input.userId,
    projectId: input.projectId,
    companyId: input.companyId,
    severity: input.severity
  };
  await updateDatabase((db) => {
    db.alerts.push(alert);
    return db;
  });
  return alert;
}

export type UpdateAlertInput = Partial<
  Pick<
    Alert,
    | "status"
    | "message"
    | "metadata"
    | "entityId"
    | "entityType"
    | "userId"
    | "projectId"
    | "companyId"
    | "resolvedAt"
    | "resolvedById"
    | "severity"
  >
>;

export async function updateAlert(id: string, payload: UpdateAlertInput): Promise<Alert> {
  let stored: Alert | undefined;
  await updateDatabase(async (db) => {
    const index = db.alerts.findIndex((alert) => alert.id === id);
    if (index === -1) {
      throw new Error("Alert not found.");
    }
    const merged: Alert = {
      ...db.alerts[index],
      ...payload,
      updatedAt: nowISO()
    };
    db.alerts[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update alert.");
  }

  return { ...stored };
}

export async function resolveAlert(id: string, resolvedById: string): Promise<Alert> {
  const timestamp = nowISO();
  return updateAlert(id, {
    status: "RESOLVED",
    resolvedAt: timestamp,
    resolvedById
  });
}

export type NewProjectInput = {
  name: string;
  code: string;
  description?: string;
  ownerId: string;
  ownerIds: string[];
  projectType: ProjectType;
  objectiveOrOkrId?: string;
  priority: ProjectPriority;
  stage: ProjectStage;
  sponsorUserId: string;
  deliveryManagerUserId?: string;
  deliveryManagerUserIds: string[];
  coreTeamUserIds: string[];
  stakeholderUserIds: string[];
  vendorCompanyIds?: string[];
  primaryVendorId?: string;
  additionalVendorIds?: string[];
  budgetHours: number;
  estimatedEffortHours?: number;
  approvedBudgetAmount?: number;
  approvedBudgetCurrency?: string;
  timeTrackingRequired: boolean;
  status?: ProjectStatus;
  health: ProjectHealth;
  riskLevel: ProjectRiskLevel;
  riskSummary?: string;
  complianceFlags?: string[];
  businessUnit: string;
  productModule: string;
  tags?: string[];
  contractId?: string;
  rateModel: ProjectRateModel;
  rateCardReference?: string;
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  taskWorkflowDefinitionId: string;
  isDraft?: boolean;
  packageStatus?: ProjectPackageStatus;
  packageSentBackTo?: ProjectPackageReturnTarget;
  packageSentBackReason?: string;
};

export type UpdateProjectInput = Partial<
  Pick<
    Project,
    | "name"
    | "code"
    | "description"
    | "ownerId"
    | "ownerIds"
    | "projectType"
    | "objectiveOrOkrId"
    | "priority"
    | "stage"
    | "sponsorUserId"
    | "deliveryManagerUserId"
    | "deliveryManagerUserIds"
    | "coreTeamUserIds"
    | "stakeholderUserIds"
    | "vendorCompanyIds"
    | "primaryVendorId"
    | "additionalVendorIds"
    | "budgetHours"
    | "estimatedEffortHours"
    | "approvedBudgetAmount"
    | "approvedBudgetCurrency"
    | "timeTrackingRequired"
    | "status"
    | "health"
    | "riskLevel"
    | "riskSummary"
    | "complianceFlags"
    | "businessUnit"
    | "productModule"
    | "tags"
    | "contractId"
    | "rateModel"
    | "rateCardReference"
    | "startDate"
    | "endDate"
    | "actualStartDate"
    | "actualEndDate"
    | "taskWorkflowDefinitionId"
    | "isDraft"
    | "packageStatus"
    | "packageSentBackTo"
    | "packageSentBackReason"
  >
>;

export async function listProjects(): Promise<Project[]> {
  const db = await readDatabase();
  return db.projects.map((project) => ({ ...project }));
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const db = await readDatabase();
  return db.projects.find((project) => project.id === id);
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const timestamp = nowISO();
  const additionalVendorIds = Array.from(new Set(input.additionalVendorIds ?? [])).filter(Boolean);
  const vendorCompanyIds = Array.from(
    new Set([...(input.vendorCompanyIds ?? []), ...(input.primaryVendorId ? [input.primaryVendorId] : []), ...additionalVendorIds])
  );
  const coreTeamUserIds = Array.from(new Set(input.coreTeamUserIds ?? [])).filter(Boolean);
  const stakeholderUserIds = Array.from(new Set(input.stakeholderUserIds ?? [])).filter(Boolean);
  const complianceFlags = Array.from(new Set(input.complianceFlags ?? [])).filter(Boolean);
  const tags = Array.from(new Set(input.tags ?? [])).filter(Boolean);
  const estimatedEffortHours = input.estimatedEffortHours ?? input.budgetHours;
  const project: Project = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name.trim(),
    code: input.code.trim(),
    description: input.description?.trim(),
    ownerId: input.ownerId,
    ownerIds: input.ownerIds,
    projectType: input.projectType,
    objectiveOrOkrId: input.objectiveOrOkrId?.trim(),
    priority: input.priority,
    stage: input.stage,
    sponsorUserId: input.sponsorUserId,
    deliveryManagerUserId: input.deliveryManagerUserId,
    deliveryManagerUserIds: input.deliveryManagerUserIds,
    coreTeamUserIds,
    stakeholderUserIds,
    vendorCompanyIds,
    primaryVendorId: input.primaryVendorId,
    additionalVendorIds,
    budgetHours: input.budgetHours,
    estimatedEffortHours,
    approvedBudgetAmount: input.approvedBudgetAmount,
    approvedBudgetCurrency: input.approvedBudgetCurrency,
    timeTrackingRequired: input.timeTrackingRequired,
    status: input.status ?? "PROPOSED",
    health: input.health,
    riskLevel: input.riskLevel,
    riskSummary: input.riskSummary?.trim(),
    complianceFlags,
    businessUnit: input.businessUnit,
    productModule: input.productModule,
    tags,
    contractId: input.contractId?.trim(),
    rateModel: input.rateModel,
    rateCardReference: input.rateCardReference?.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    actualStartDate: input.actualStartDate,
    actualEndDate: input.actualEndDate,
    taskWorkflowDefinitionId: input.taskWorkflowDefinitionId,
    isDraft: input.isDraft ?? false,
    packageStatus: input.packageStatus ?? "PM_DRAFT",
    packageSentBackTo: input.packageSentBackTo,
    packageSentBackReason: input.packageSentBackReason
  };

  await updateDatabase(async (db) => {
    const normalizedCode = project.code.toLowerCase();
    if (db.projects.some((existing) => existing.code.toLowerCase() === normalizedCode)) {
      throw new Error("Project code already exists.");
    }
    db.projects.push(project);
    return db;
  });

  return { ...project };
}

export async function updateProject(id: string, update: UpdateProjectInput): Promise<Project> {
  let stored: Project | undefined;
  await updateDatabase(async (db) => {
    const index = db.projects.findIndex((project) => project.id === id);
    if (index === -1) {
      throw new Error("Project not found.");
    }
    if (update.code) {
      const normalizedCode = update.code.trim().toLowerCase();
      if (db.projects.some((project, idx) => idx !== index && project.code.toLowerCase() === normalizedCode)) {
        throw new Error("Project code already exists.");
      }
      update.code = update.code.trim();
    }
    const normalizedVendorCompanyIds = update.vendorCompanyIds
      ? Array.from(new Set(update.vendorCompanyIds)).filter(Boolean)
      : undefined;
    const normalizedAdditionalVendors = update.additionalVendorIds
      ? Array.from(new Set(update.additionalVendorIds)).filter(Boolean)
      : undefined;
    const normalizedCoreTeam = update.coreTeamUserIds
      ? Array.from(new Set(update.coreTeamUserIds)).filter(Boolean)
      : undefined;
    const normalizedStakeholders = update.stakeholderUserIds
      ? Array.from(new Set(update.stakeholderUserIds)).filter(Boolean)
      : undefined;
    const normalizedCompliance = update.complianceFlags
      ? Array.from(new Set(update.complianceFlags)).filter(Boolean)
      : undefined;
    const normalizedTags = update.tags ? Array.from(new Set(update.tags)).filter(Boolean) : undefined;
    const normalizedOwnerIds = update.ownerIds ? Array.from(new Set(update.ownerIds)).filter(Boolean) : undefined;
    const normalizedDeliveryManagerUserIds = update.deliveryManagerUserIds
      ? Array.from(new Set(update.deliveryManagerUserIds)).filter(Boolean)
      : undefined;
    const base = db.projects[index];
    const nextPrimaryVendor = update.primaryVendorId ?? base.primaryVendorId;
    const mergedVendorIds = Array.from(
      new Set([
        ...(normalizedVendorCompanyIds ?? base.vendorCompanyIds),
        ...(nextPrimaryVendor ? [nextPrimaryVendor] : []),
        ...(normalizedAdditionalVendors ?? base.additionalVendorIds)
      ])
    ).filter(Boolean);
    const merged: Project = {
      ...base,
      ...update,
      description: update.description !== undefined ? update.description?.trim() : base.description,
      objectiveOrOkrId: update.objectiveOrOkrId !== undefined ? update.objectiveOrOkrId?.trim() : base.objectiveOrOkrId,
      riskSummary: update.riskSummary !== undefined ? update.riskSummary?.trim() : base.riskSummary,
      contractId: update.contractId !== undefined ? update.contractId?.trim() : base.contractId,
      rateCardReference:
        update.rateCardReference !== undefined ? update.rateCardReference?.trim() : base.rateCardReference,
      vendorCompanyIds: mergedVendorIds,
      primaryVendorId: nextPrimaryVendor,
      additionalVendorIds: normalizedAdditionalVendors ?? base.additionalVendorIds,
      coreTeamUserIds: normalizedCoreTeam ?? base.coreTeamUserIds,
      stakeholderUserIds: normalizedStakeholders ?? base.stakeholderUserIds,
      complianceFlags: normalizedCompliance ?? base.complianceFlags,
      tags: normalizedTags ?? base.tags,
      ownerIds: normalizedOwnerIds ?? base.ownerIds,
      deliveryManagerUserIds: normalizedDeliveryManagerUserIds ?? base.deliveryManagerUserIds,
      updatedAt: nowISO()
    };
    if (update.budgetHours !== undefined && update.estimatedEffortHours === undefined) {
      merged.estimatedEffortHours = update.budgetHours;
    }
    db.projects[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update project.");
  }

  return { ...stored };
}

export async function deleteProject(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.projects.findIndex((project) => project.id === id);
    if (index === -1) {
      throw new Error("Project not found.");
    }
    db.projects.splice(index, 1);
    return db;
  });
}

export type NewTaskInput = {
  projectId: string;
  title: string;
  description?: string;
  createdById: string;
  reporterUserId?: string;
  itemType: TaskItemType;
  taskType: TaskType;
  priority: TaskPriority;
  budgetHours: number;
  estimateStoryPoints?: number;
  requiredSkills?: string[];
  acceptanceCriteria?: string[];
  dependencyTaskIds?: string[];
  linkedIssueIds?: string[];
  epicId?: string;
  component?: string;
  sprintId?: string;
  sprint?: TaskSprint;
  environment?: string;
  plannedStartDate?: string;
  dueDate?: string;
  assigneeUserId?: string;
  isVendorTask?: boolean;
  vendorId?: string;
  status?: TaskStatus;
  estimationHours?: number;
  costAmount?: number;
  assignmentPlan?: TaskAssignmentPlanEntry[];
  typeMeta?: TaskTypeMeta;
  parentId?: string;
  releaseId?: string;
};

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "status"
    | "budgetHours"
    | "taskType"
    | "priority"
    | "dueDate"
    | "requiredSkills"
    | "acceptanceCriteria"
    | "dependencyTaskIds"
    | "linkedIssueIds"
    | "epicId"
    | "component"
    | "sprintId"
    | "sprint"
    | "environment"
    | "assigneeUserId"
    | "reporterUserId"
    | "isVendorTask"
    | "vendorId"
    | "estimateStoryPoints"
    | "estimation"
    | "estimationHours"
    | "costAmount"
    | "assignmentPlan"
    | "typeMeta"
    | "itemType"
    | "plannedStartDate"
    | "expectedCompletionDate"
    | "workflowInstanceId"
    | "parentId"
    | "releaseId"
  >
>;

export async function listProjectTasks(projectId: string): Promise<Task[]> {
  const db = await readDatabase();
  return db.tasks.filter((task) => task.projectId === projectId).map((task) => ({ ...task }));
}

export async function listTasksByIds(taskIds: string[]): Promise<Task[]> {
  if (!taskIds.length) {
    return [];
  }
  const lookup = new Set(taskIds);
  const db = await readDatabase();
  return db.tasks.filter((task) => lookup.has(task.id)).map((task) => ({ ...task }));
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const db = await readDatabase();
  return db.tasks.find((task) => task.id === id);
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const timestamp = nowISO();
  const requiredSkills = Array.from(new Set(input.requiredSkills ?? []))
    .map((skill) => skill.trim())
    .filter(Boolean);
  const acceptanceCriteria = Array.from(new Set(input.acceptanceCriteria ?? []))
    .map((item) => item.trim())
    .filter(Boolean);
  const dependencyTaskIds = Array.from(new Set(input.dependencyTaskIds ?? [])).filter(Boolean);
  const linkedIssueIds = Array.from(new Set(input.linkedIssueIds ?? [])).filter(Boolean);
  const task: Task = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: input.projectId,
    itemType: input.itemType,
    taskType: input.taskType,
    title: input.title.trim(),
    description: input.description?.trim(),
    createdById: input.createdById,
    reporterUserId: input.reporterUserId ?? input.createdById,
    assigneeUserId: input.assigneeUserId,
    isVendorTask: Boolean(input.isVendorTask),
    vendorId: input.vendorId,
    status: input.status ?? "BACKLOG",
    priority: input.priority,
    budgetHours: input.budgetHours,
    estimateStoryPoints: input.estimateStoryPoints,
    dueDate: input.dueDate,
    plannedStartDate: input.plannedStartDate,
    requiredSkills,
    acceptanceCriteria,
    dependencyTaskIds,
    linkedIssueIds,
    epicId: input.epicId,
    component: input.component?.trim(),
    sprintId: input.sprintId,
    sprint: input.sprint,
    environment: input.environment?.trim(),
    estimationHours: input.estimationHours,
    costAmount: input.costAmount,
    assignmentPlan: input.assignmentPlan ?? [],
    typeMeta: input.typeMeta,
    parentId: input.parentId,
    releaseId: input.releaseId
  };

  await updateDatabase(async (db) => {
    db.tasks.push(task);
    return db;
  });

  return { ...task };
}

export async function updateTask(id: string, update: UpdateTaskInput): Promise<Task> {
  let stored: Task | undefined;
  await updateDatabase(async (db) => {
    const index = db.tasks.findIndex((task) => task.id === id);
    if (index === -1) {
      throw new Error("Task not found.");
    }
    const normalizedRequiredSkills = update.requiredSkills
      ? Array.from(new Set(update.requiredSkills)).map((skill) => skill.trim()).filter(Boolean)
      : undefined;
    const normalizedAcceptance = update.acceptanceCriteria
      ? Array.from(new Set(update.acceptanceCriteria)).map((item) => item.trim()).filter(Boolean)
      : undefined;
    const normalizedDependencies = update.dependencyTaskIds
      ? Array.from(new Set(update.dependencyTaskIds)).filter(Boolean)
      : undefined;
    const normalizedLinkedIssues = update.linkedIssueIds
      ? Array.from(new Set(update.linkedIssueIds)).filter(Boolean)
      : undefined;
    const merged: Task = {
      ...db.tasks[index],
      ...update,
      title: update.title !== undefined ? update.title.trim() : db.tasks[index].title,
      description: update.description !== undefined ? update.description?.trim() : db.tasks[index].description,
      component: update.component !== undefined ? update.component?.trim() : db.tasks[index].component,
      environment: update.environment !== undefined ? update.environment?.trim() : db.tasks[index].environment,
      requiredSkills: normalizedRequiredSkills ?? db.tasks[index].requiredSkills,
      acceptanceCriteria: normalizedAcceptance ?? db.tasks[index].acceptanceCriteria,
      dependencyTaskIds: normalizedDependencies ?? db.tasks[index].dependencyTaskIds,
      linkedIssueIds: normalizedLinkedIssues ?? db.tasks[index].linkedIssueIds,
      updatedAt: nowISO()
    };
    merged.assignmentPlan = update.assignmentPlan ?? db.tasks[index].assignmentPlan;
    merged.typeMeta = update.typeMeta ?? db.tasks[index].typeMeta;
    merged.sprint = update.sprint ?? db.tasks[index].sprint;
    merged.itemType = update.itemType ?? db.tasks[index].itemType;
    merged.estimationHours = update.estimationHours ?? db.tasks[index].estimationHours;
    merged.costAmount = update.costAmount ?? db.tasks[index].costAmount;
    db.tasks[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update task.");
  }

  return { ...stored };
}

export async function deleteTask(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.tasks.findIndex((task) => task.id === id);
    if (index === -1) {
      throw new Error("Task not found.");
    }
    db.tasks.splice(index, 1);
    return db;
  });
}

export type NewAssignmentInput = {
  taskId: string;
  developerId: string;
  requestedById: string;
  requestedMessage?: string;
  status?: AssignmentStatus;
  approvedById?: string;
  approvedAt?: string;
};

export type UpdateAssignmentInput = Partial<
  Pick<
    Assignment,
    | "status"
    | "approvedById"
    | "approvedAt"
    | "canceledById"
    | "canceledAt"
    | "cancelReason"
    | "completedAt"
    | "completionNote"
    | "requestedMessage"
  >
>;

type AssignmentFilters = {
  status?: AssignmentStatus;
  developerId?: string;
  requestedById?: string;
  taskId?: string;
  excludeStatuses?: AssignmentStatus[];
};

export async function listAssignments(filters: AssignmentFilters = {}): Promise<Assignment[]> {
  const db = await readDatabase();
  return db.assignments
    .filter((assignment) => {
      if (filters.status && assignment.status !== filters.status) {
        return false;
      }
      if (filters.excludeStatuses?.length && filters.excludeStatuses.includes(assignment.status)) {
        return false;
      }
      if (filters.developerId && assignment.developerId !== filters.developerId) {
        return false;
      }
      if (filters.requestedById && assignment.requestedById !== filters.requestedById) {
        return false;
      }
      if (filters.taskId && assignment.taskId !== filters.taskId) {
        return false;
      }
      return true;
    })
    .map((assignment) => ({ ...assignment }));
}

export async function getAssignmentById(id: string): Promise<Assignment | undefined> {
  const db = await readDatabase();
  return db.assignments.find((assignment) => assignment.id === id);
}

export async function createAssignment(input: NewAssignmentInput): Promise<Assignment> {
  const timestamp = nowISO();
  const assignment: Assignment = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    taskId: input.taskId,
    developerId: input.developerId,
    requestedById: input.requestedById,
    requestedMessage: input.requestedMessage,
    status: input.status ?? "PENDING",
    approvedById: input.approvedById,
    approvedAt: input.approvedAt,
    cancelReason: undefined
  };

  await updateDatabase(async (db) => {
    db.assignments.push(assignment);
    return db;
  });

  return { ...assignment };
}

export async function updateAssignment(id: string, update: UpdateAssignmentInput): Promise<Assignment> {
  let stored: Assignment | undefined;
  await updateDatabase(async (db) => {
    const index = db.assignments.findIndex((assignment) => assignment.id === id);
    if (index === -1) {
      throw new Error("Assignment not found.");
    }
    const merged: Assignment = {
      ...db.assignments[index],
      ...update,
      updatedAt: nowISO()
    };
    db.assignments[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update assignment.");
  }

  return { ...stored };
}

export type NewCommentInput = {
  entityId: string;
  entityType: CommentEntityType;
  authorId: string;
  body: string;
  attachmentIds?: string[];
};

type CommentFilters = {
  entityId?: string;
  entityType?: CommentEntityType;
};

export async function listComments(filters: CommentFilters = {}): Promise<Comment[]> {
  const db = await readDatabase();
  return db.comments
    .filter((comment) => {
      if (filters.entityId && comment.entityId !== filters.entityId) {
        return false;
      }
      if (filters.entityType && comment.entityType !== filters.entityType) {
        return false;
      }
      return true;
    })
    .map((comment) => ({ ...comment }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createComment(input: NewCommentInput): Promise<Comment> {
  const timestamp = nowISO();
  const comment: Comment = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    entityId: input.entityId,
    entityType: input.entityType,
    authorId: input.authorId,
    body: input.body.trim(),
    attachmentIds: input.attachmentIds ?? []
  };

  await updateDatabase(async (db) => {
    db.comments.push(comment);
    return db;
  });

  return { ...comment };
}

export type NewTaskCommentInput = {
  taskId: string;
  authorId: string;
  body: string;
  attachmentIds?: string[];
};

export async function listTaskComments(taskId: string): Promise<Comment[]> {
  return listComments({ entityId: taskId, entityType: "TASK" });
}

export async function createTaskComment(input: NewTaskCommentInput): Promise<Comment> {
  return createComment({
    entityId: input.taskId,
    entityType: "TASK",
    authorId: input.authorId,
    body: input.body,
    attachmentIds: input.attachmentIds
  });
}

export type NewAttachmentInput = {
  entityId?: string;
  entityType?: AttachmentEntityType;
  uploaderId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

type AttachmentFilters = {
  entityId?: string;
  entityType?: AttachmentEntityType;
  uploaderId?: string;
};

export async function listAttachments(filters: AttachmentFilters = {}): Promise<Attachment[]> {
  const db = await readDatabase();
  return db.attachments
    .filter((attachment) => {
      if (filters.entityId && attachment.entityId !== filters.entityId) {
        return false;
      }
      if (filters.entityType && attachment.entityType !== filters.entityType) {
        return false;
      }
      if (filters.uploaderId && attachment.uploaderId !== filters.uploaderId) {
        return false;
      }
      return true;
    })
    .map((attachment) => ({ ...attachment }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAttachment(input: NewAttachmentInput): Promise<Attachment> {
  const timestamp = nowISO();
  const attachment: Attachment = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    entityId: input.entityId,
    entityType: input.entityType,
    uploaderId: input.uploaderId,
    fileName: input.fileName,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size,
    url: input.url
  };

  await updateDatabase(async (db) => {
    db.attachments.push(attachment);
    return db;
  });

  return { ...attachment };
}

type ActivityLogFilters = {
  entityId?: string;
  entityType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
};

export async function listActivityLogs(filters: ActivityLogFilters = {}): Promise<ActivityLog[]> {
  const db = await readDatabase();
  return db.activityLogs
    .filter((log) => {
      if (filters.entityId && log.entityId !== filters.entityId) {
        return false;
      }
      if (filters.entityType && log.entityType !== filters.entityType) {
        return false;
      }
      if (filters.actorId && log.actorId !== filters.actorId) {
        return false;
      }
      if (filters.startDate && log.createdAt < filters.startDate) {
        return false;
      }
      if (filters.endDate && log.createdAt > filters.endDate) {
        return false;
      }
      return true;
    })
    .map((log) => ({ ...log }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listActivityLogsForEntity(entityId: string, entityType?: string): Promise<ActivityLog[]> {
  return listActivityLogs({ entityId, entityType });
}

type WorkflowStepDefinitionInput = Omit<WorkflowStepDefinition, "id" | "order" | "actions" | "assigneeRole"> & {
  id?: string;
  order?: number;
  actions?: WorkflowActionType[];
  assigneeRole?: Role;
};

export type NewWorkflowDefinitionInput = {
  entityType: WorkflowEntityType;
  name: string;
  description?: string;
  isActive?: boolean;
  steps: WorkflowStepDefinitionInput[];
};

export type UpdateWorkflowDefinitionInput = Partial<Pick<WorkflowDefinition, "name" | "description" | "isActive">> & {
  steps?: WorkflowStepDefinitionInput[];
};

const workflowActions: WorkflowActionType[] = ["APPROVE", "REJECT", "SEND_BACK", "REQUEST_CHANGE"];

const dynamicApproverRoleMap: Record<WorkflowApproverDynamic, Role> = {
  ENGINEERING_TEAM: "ENGINEER",
  TASK_PROJECT_MANAGER: "PROJECT_MANAGER",
  TASK_PM: "PM",
  TASK_ASSIGNED_DEVELOPER: "DEVELOPER"
};

const cloneDefinition = (definition: WorkflowDefinition): WorkflowDefinition => ({
  ...definition,
  steps: definition.steps.map((step) => ({ ...step }))
});

const cloneInstance = (instance: WorkflowInstance): WorkflowInstance => ({
  ...instance,
  steps: instance.steps.map((step) => ({ ...step }))
});

function resolveAssigneeRole(
  approverType: WorkflowApproverType,
  approverRole?: Role,
  dynamicApproverType?: WorkflowApproverDynamic
): Role {
  if (approverType === "ROLE") {
    if (!approverRole) {
      throw new Error("Workflow step requires an approver role.");
    }
    return approverRole;
  }
  if (!dynamicApproverType) {
    throw new Error("Workflow step requires a dynamic approver type.");
  }
  const mapped = dynamicApproverRoleMap[dynamicApproverType];
  if (!mapped) {
    throw new Error("Unsupported dynamic approver type.");
  }
  return mapped;
}

function normalizeWorkflowSteps(stepInputs: WorkflowStepDefinitionInput[]): WorkflowStepDefinition[] {
  if (!stepInputs.length) {
    throw new Error("Workflow definition requires at least one step.");
  }
  return stepInputs
    .map((step, index) => {
      if (!step.name?.trim()) {
        throw new Error("Workflow step requires a name.");
      }
      const actions = step.actions?.filter((action) => workflowActions.includes(action)) ?? workflowActions;
      if (!actions.length) {
        throw new Error("Workflow step requires at least one supported action.");
      }
      const approverType: WorkflowApproverType =
        step.approverType ??
        (step.dynamicApproverType ? "DYNAMIC" : "ROLE");
      let approverRole = step.approverRole ?? step.assigneeRole;
      let dynamicApproverType = step.dynamicApproverType;
      if (approverType === "DYNAMIC" && !dynamicApproverType) {
        dynamicApproverType = "ENGINEERING_TEAM";
      }
      if (approverType === "ROLE" && !approverRole) {
        throw new Error("Workflow step requires an approver role.");
      }
      const assigneeRole = resolveAssigneeRole(approverType, approverRole, dynamicApproverType);
      const requiresCommentOnReject = step.requiresCommentOnReject ?? false;
      const requiresCommentOnSendBack = step.requiresCommentOnSendBack ?? false;
      return {
        id: step.id ?? randomUUID(),
        name: step.name.trim(),
        description: step.description?.trim(),
        assigneeRole,
        approverType,
        approverRole: approverType === "ROLE" ? assigneeRole : undefined,
        dynamicApproverType: approverType === "DYNAMIC" ? dynamicApproverType : undefined,
        requiresCommentOnReject,
        requiresCommentOnSendBack,
        order: step.order ?? index + 1,
        actions
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((step, idx) => ({ ...step, order: idx + 1 }));
}

export async function listWorkflowDefinitions(entityType?: WorkflowEntityType): Promise<WorkflowDefinition[]> {
  const db = await readDatabase();
  return db.workflowDefinitions
    .filter((definition) => (entityType ? definition.entityType === entityType : true))
    .map((definition) => cloneDefinition(definition));
}

export async function getWorkflowDefinitionById(id: string): Promise<WorkflowDefinition | undefined> {
  const db = await readDatabase();
  const definition = db.workflowDefinitions.find((item) => item.id === id);
  return definition ? cloneDefinition(definition) : undefined;
}

export async function getActiveWorkflowDefinition(
  entityType: WorkflowEntityType
): Promise<WorkflowDefinition | undefined> {
  const db = await readDatabase();
  const definition = db.workflowDefinitions
    .filter((item) => item.entityType === entityType && item.isActive)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  return definition ? cloneDefinition(definition) : undefined;
}

export async function createWorkflowDefinition(input: NewWorkflowDefinitionInput): Promise<WorkflowDefinition> {
  const timestamp = nowISO();
  const definition: WorkflowDefinition = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    entityType: input.entityType,
    name: input.name.trim(),
    description: input.description?.trim(),
    isActive: input.isActive ?? true,
    steps: normalizeWorkflowSteps(input.steps)
  };

  await updateDatabase(async (db) => {
    if (definition.isActive) {
      db.workflowDefinitions = db.workflowDefinitions.map((existing) =>
        existing.entityType === definition.entityType
          ? { ...existing, isActive: false, updatedAt: timestamp }
          : existing
      );
    }
    db.workflowDefinitions.push(definition);
    return db;
  });

  return cloneDefinition(definition);
}

export async function updateWorkflowDefinition(
  id: string,
  update: UpdateWorkflowDefinitionInput
): Promise<WorkflowDefinition> {
  let stored: WorkflowDefinition | undefined;
  await updateDatabase(async (db) => {
    const index = db.workflowDefinitions.findIndex((definition) => definition.id === id);
    if (index === -1) {
      throw new Error("Workflow definition not found.");
    }
    const nextSteps = update.steps ? normalizeWorkflowSteps(update.steps) : db.workflowDefinitions[index].steps;
    if (update.isActive) {
      db.workflowDefinitions = db.workflowDefinitions.map((definition, idx) =>
        idx === index
          ? definition
          : definition.entityType === db.workflowDefinitions[index].entityType
            ? { ...definition, isActive: false, updatedAt: nowISO() }
            : definition
      );
    }
    const merged: WorkflowDefinition = {
      ...db.workflowDefinitions[index],
      ...update,
      steps: nextSteps,
      updatedAt: nowISO()
    };
    db.workflowDefinitions[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update workflow definition.");
  }

  return cloneDefinition(stored);
}

export async function deleteWorkflowDefinition(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.workflowDefinitions.findIndex((definition) => definition.id === id);
    if (index === -1) {
      throw new Error("Workflow definition not found.");
    }
    db.workflowDefinitions.splice(index, 1);
    return db;
  });
}

export async function getWorkflowInstanceByEntity(
  entityType: WorkflowEntityType,
  entityId: string
): Promise<WorkflowInstance | undefined> {
  const db = await readDatabase();
  const instance = db.workflowInstances.find(
    (item) => item.entityType === entityType && item.entityId === entityId
  );
  return instance ? cloneInstance(instance) : undefined;
}

export async function getWorkflowInstanceById(id: string): Promise<WorkflowInstance | undefined> {
  const db = await readDatabase();
  const instance = db.workflowInstances.find((item) => item.id === id);
  return instance ? cloneInstance(instance) : undefined;
}

export type CreateWorkflowInstanceInput = {
  definitionId: string;
  entityId: string;
  entityType: WorkflowEntityType;
  status?: WorkflowInstanceStatus;
  currentStepId?: string;
  steps: WorkflowStepInstance[];
  context?: Record<string, unknown>;
};

export type UpdateWorkflowInstanceInput = Partial<
  Pick<WorkflowInstance, "status" | "currentStepId" | "steps" | "context">
>;

export async function createWorkflowInstance(input: CreateWorkflowInstanceInput): Promise<WorkflowInstance> {
  const timestamp = nowISO();
  const instance: WorkflowInstance = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    definitionId: input.definitionId,
    entityId: input.entityId,
    entityType: input.entityType,
    status: input.status ?? "NOT_STARTED",
    currentStepId: input.currentStepId,
    context: input.context,
    steps: input.steps.map((step) => ({ ...step }))
  };

  await updateDatabase(async (db) => {
    db.workflowInstances.push(instance);
    return db;
  });

  return cloneInstance(instance);
}

export async function updateWorkflowInstance(
  id: string,
  update: UpdateWorkflowInstanceInput
): Promise<WorkflowInstance> {
  let stored: WorkflowInstance | undefined;
  await updateDatabase(async (db) => {
    const index = db.workflowInstances.findIndex((instance) => instance.id === id);
    if (index === -1) {
      throw new Error("Workflow instance not found.");
    }
    const merged: WorkflowInstance = {
      ...db.workflowInstances[index],
      ...update,
      steps: update.steps ? update.steps.map((step) => ({ ...step })) : db.workflowInstances[index].steps,
      updatedAt: nowISO()
    };
    db.workflowInstances[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update workflow instance.");
  }

  return cloneInstance(stored);
}

export type NewWorkflowActionInput = {
  instanceId: string;
  stepId: string;
  actorId: string;
  action: WorkflowActionType;
  comment?: string;
  metadata?: Record<string, unknown>;
};

export async function createWorkflowAction(input: NewWorkflowActionInput): Promise<WorkflowAction> {
  const timestamp = nowISO();
  const action: WorkflowAction = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    instanceId: input.instanceId,
    stepId: input.stepId,
    actorId: input.actorId,
    action: input.action,
    comment: input.comment?.trim(),
    metadata: input.metadata
  };

  await updateDatabase(async (db) => {
    db.workflowActions.push(action);
    return db;
  });

  return { ...action };
}

export async function listWorkflowActions(instanceId: string): Promise<WorkflowAction[]> {
  const db = await readDatabase();
  return db.workflowActions.filter((action) => action.instanceId === instanceId).map((action) => ({ ...action }));
}

export async function getWorkScheduleByUserId(userId: string): Promise<WorkSchedule | undefined> {
  const db = await readDatabase();
  const match = db.workSchedules.find((schedule) => schedule.userId === userId);
  return match ? { ...match, slots: match.slots.map((slot) => ({ ...slot })) } : undefined;
}

export type UpsertWorkScheduleInput = {
  userId: string;
  timeZone: string;
  slots: WorkScheduleSlot[];
  name?: string;
};

export async function upsertWorkSchedule(input: UpsertWorkScheduleInput): Promise<WorkSchedule> {
  let stored: WorkSchedule | undefined;
  await updateDatabase(async (db) => {
    const index = db.workSchedules.findIndex((schedule) => schedule.userId === input.userId);
    if (index === -1) {
      const schedule: WorkSchedule = {
        id: randomUUID(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        name: input.name ?? "Personal Schedule",
        timeZone: input.timeZone,
        userId: input.userId,
        slots: input.slots.map((slot) => ({ ...slot }))
      };
      db.workSchedules.push(schedule);
      stored = schedule;
    } else {
      const updated: WorkSchedule = {
        ...db.workSchedules[index],
        name: input.name ?? db.workSchedules[index].name,
        timeZone: input.timeZone,
        slots: input.slots.map((slot) => ({ ...slot })),
        updatedAt: nowISO()
      };
      db.workSchedules[index] = updated;
      stored = updated;
    }
    return db;
  });

  if (!stored) {
    throw new Error("Unable to store work schedule.");
  }

  return { ...stored, slots: stored.slots.map((slot) => ({ ...slot })) };
}

export async function findWorkScheduleForUser(userId?: string, companyId?: string): Promise<WorkSchedule | undefined> {
  const db = await readDatabase();
  const match =
    (userId ? db.workSchedules.find((schedule) => schedule.userId === userId) : undefined) ??
    (companyId
      ? db.workSchedules.find((schedule) => schedule.companyId === companyId && !schedule.userId)
      : undefined) ??
    db.workSchedules.find((schedule) => !schedule.userId && !schedule.companyId);

  return match
    ? {
        ...match,
        slots: match.slots.map((slot) => ({ ...slot }))
      }
    : undefined;
}

type CompanyHolidayFilters = {
  companyId?: string;
  vendorId?: string;
};

export async function listCompanyHolidays(filters: CompanyHolidayFilters = {}): Promise<CompanyHoliday[]> {
  const db = await readDatabase();
  return db.companyHolidays
    .filter((holiday) => {
      if (filters.vendorId && holiday.vendorId !== filters.vendorId) {
        return false;
      }
      if (filters.companyId && holiday.companyId && holiday.companyId !== filters.companyId) {
        return false;
      }
      return true;
    })
    .map((holiday) => ({ ...holiday }));
}

export type UpdateCompanyHolidayInput = Partial<
  Pick<
    CompanyHoliday,
    | "name"
    | "calendarName"
    | "date"
    | "vendorId"
    | "isFullDay"
    | "partialStartTimeUtc"
    | "partialEndTimeUtc"
    | "recurrenceRule"
    | "countryCode"
    | "companyId"
  >
>;

export type NewCompanyHolidayInput = {
  companyId?: string;
  vendorId?: string;
  calendarName: string;
  date: string;
  name: string;
  isFullDay?: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  recurrenceRule?: string;
  countryCode?: string;
};

export async function createCompanyHoliday(input: NewCompanyHolidayInput): Promise<CompanyHoliday> {
  const timestamp = nowISO();
  const holiday: CompanyHoliday = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    companyId: input.companyId,
    vendorId: input.vendorId,
    calendarName: input.calendarName.trim(),
    date: input.date,
    name: input.name.trim(),
    isFullDay: input.isFullDay ?? true,
    partialStartTimeUtc: input.partialStartTimeUtc,
    partialEndTimeUtc: input.partialEndTimeUtc,
    recurrenceRule: input.recurrenceRule,
    countryCode: input.countryCode
  };

  await updateDatabase(async (db) => {
    db.companyHolidays.push(holiday);
    return db;
  });

  return { ...holiday };
}

export async function updateCompanyHoliday(
  id: string,
  input: UpdateCompanyHolidayInput
): Promise<CompanyHoliday> {
  let stored: CompanyHoliday | undefined;

  await updateDatabase(async (db) => {
    const index = db.companyHolidays.findIndex((holiday) => holiday.id === id);
    if (index === -1) {
      throw new Error("Company holiday not found.");
    }

    const existing = db.companyHolidays[index];
    const updated: CompanyHoliday = {
      ...existing,
      ...input,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      calendarName: input.calendarName !== undefined ? input.calendarName.trim() : existing.calendarName,
      updatedAt: nowISO()
    };

    db.companyHolidays[index] = updated;
    stored = updated;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update company holiday.");
  }

  return { ...stored };
}

export async function deleteCompanyHoliday(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.companyHolidays.findIndex((holiday) => holiday.id === id);
    if (index === -1) {
      throw new Error("Company holiday not found.");
    }
    db.companyHolidays.splice(index, 1);
    return db;
  });
}

export type NewDayOffInput = {
  userId: string;
  requestedById: string;
  date: string;
  leaveType: LeaveType;
  isPartialDay: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  totalRequestedHours: number;
  reason?: string;
  projectImpactNote?: string;
  contactDetails?: string;
  backupContactUserId?: string;
  attachmentIds?: string[];
  status?: DayOffStatus;
  submittedById?: string;
  submittedAt?: string;
};

export async function createDayOffRequest(input: NewDayOffInput): Promise<DayOff> {
  const timestamp = nowISO();
  const status: DayOffStatus = input.status ?? "SUBMITTED";
  const request: DayOff = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    requestedById: input.requestedById,
    date: input.date,
    leaveType: input.leaveType,
    isPartialDay: input.isPartialDay,
    partialStartTimeUtc: input.partialStartTimeUtc,
    partialEndTimeUtc: input.partialEndTimeUtc,
    totalRequestedHours: input.totalRequestedHours,
    reason: input.reason?.trim(),
    projectImpactNote: input.projectImpactNote?.trim(),
    contactDetails: input.contactDetails?.trim(),
    backupContactUserId: input.backupContactUserId,
    attachmentIds: input.attachmentIds ?? [],
    status,
    submittedAt: status === "SUBMITTED" ? input.submittedAt ?? timestamp : input.submittedAt,
    submittedById: status === "SUBMITTED" ? input.submittedById ?? input.requestedById : input.submittedById
  };

  await updateDatabase(async (db) => {
    db.dayOffs.push(request);
    return db;
  });

  return { ...request };
}

export async function getDayOffById(id: string): Promise<DayOff | undefined> {
  const db = await readDatabase();
  const entry = db.dayOffs.find((dayOff) => dayOff.id === id);
  return entry ? { ...entry } : undefined;
}

export type UpdateDayOffInput = Partial<
  Pick<
    DayOff,
    | "date"
    | "leaveType"
    | "isPartialDay"
    | "partialStartTimeUtc"
    | "partialEndTimeUtc"
    | "totalRequestedHours"
    | "reason"
    | "projectImpactNote"
    | "contactDetails"
    | "backupContactUserId"
    | "attachmentIds"
    | "status"
    | "submittedAt"
    | "submittedById"
    | "approvedById"
    | "approvedAt"
    | "rejectedAt"
    | "rejectedById"
    | "decisionComment"
    | "cancelledAt"
    | "cancelledById"
  >
>;

export async function updateDayOff(id: string, update: UpdateDayOffInput): Promise<DayOff> {
  let stored: DayOff | undefined;
  await updateDatabase(async (db) => {
    const index = db.dayOffs.findIndex((dayOff) => dayOff.id === id);
    if (index === -1) {
      throw new Error("Day off request not found.");
    }
    const merged: DayOff = {
      ...db.dayOffs[index],
      ...update,
      updatedAt: nowISO()
    };
    db.dayOffs[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update day off request.");
  }

  return { ...stored };
}

type ListDayOffFilters = {
  userId?: string;
  userIds?: string[];
  companyId?: string;
  statuses?: DayOffStatus[];
  leaveTypes?: LeaveType[];
  startDate?: string;
  endDate?: string;
};

export async function listDayOffs(filters: ListDayOffFilters = {}): Promise<DayOff[]> {
  const db = await readDatabase();
  const userMap = new Map(db.users.map((user) => [user.id, user]));
  return db.dayOffs
    .filter((dayOff) => {
      if (filters.userId && dayOff.userId !== filters.userId) {
        return false;
      }
      if (filters.userIds && filters.userIds.length && !filters.userIds.includes(dayOff.userId)) {
        return false;
      }
      if (filters.companyId) {
        const user = userMap.get(dayOff.userId);
        if (!user || user.companyId !== filters.companyId) {
          return false;
        }
      }
      if (filters.statuses?.length && !filters.statuses.includes(dayOff.status)) {
        return false;
      }
      if (filters.leaveTypes?.length && !filters.leaveTypes.includes(dayOff.leaveType)) {
        return false;
      }
      if (filters.startDate && dayOff.date < filters.startDate) {
        return false;
      }
      if (filters.endDate && dayOff.date > filters.endDate) {
        return false;
      }
      return true;
    })
    .map((dayOff) => ({ ...dayOff }));
}

export async function listDayOffsForUser(userId: string): Promise<DayOff[]> {
  return listDayOffs({ userId, statuses: ["APPROVED"] });
}

export type NewTimeEntryInput = {
  userId: string;
  projectId: string;
  taskId: string;
  date: string;
  minutes: number;
  startedAt: string;
  endedAt: string;
  note?: string;
  source: TimeEntrySource;
  outOfSchedule: boolean;
  workTypeCode?: string;
  billable?: boolean;
  location?: string;
  costRate?: number;
  costAmount?: number;
};

export async function createTimeEntry(input: NewTimeEntryInput): Promise<TimeEntry> {
  const timestamp = nowISO();
  const entry: TimeEntry = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    projectId: input.projectId,
    taskId: input.taskId,
    date: input.date,
    minutes: input.minutes,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    note: input.note?.trim(),
    source: input.source,
    outOfSchedule: input.outOfSchedule,
    timesheetId: undefined,
    isLocked: false,
    workTypeCode: input.workTypeCode?.trim(),
    billable: input.billable ?? false,
    location: input.location?.trim(),
    costRate: input.costRate,
    costAmount: input.costAmount
  };

  await updateDatabase(async (db) => {
    db.timeEntries.push(entry);
    return db;
  });

  return { ...entry };
}

export type UpdateTimeEntryInput = Partial<
  Pick<
    TimeEntry,
    | "projectId"
    | "taskId"
    | "date"
    | "minutes"
    | "startedAt"
    | "endedAt"
    | "note"
    | "outOfSchedule"
    | "workTypeCode"
    | "billable"
    | "location"
    | "costRate"
    | "costAmount"
  >
>;

export async function updateTimeEntry(id: string, update: UpdateTimeEntryInput): Promise<TimeEntry> {
  let stored: TimeEntry | undefined;
  await updateDatabase(async (db) => {
    const index = db.timeEntries.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new Error("Time entry not found.");
    }
    const merged: TimeEntry = {
      ...db.timeEntries[index],
      ...update,
      note: update.note !== undefined ? update.note?.trim() : db.timeEntries[index].note,
      updatedAt: nowISO()
    };
    db.timeEntries[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update time entry.");
  }

  return { ...stored };
}

type TimeEntryFilters = {
  userId?: string;
  date?: string;
  projectId?: string;
  taskId?: string;
  startDate?: string;
  endDate?: string;
};

export async function listTimeEntries(filters: TimeEntryFilters = {}): Promise<TimeEntry[]> {
  const db = await readDatabase();
  return db.timeEntries
    .filter((entry) => {
      if (filters.userId && entry.userId !== filters.userId) {
        return false;
      }
      if (filters.date && entry.date !== filters.date) {
        return false;
      }
      if (filters.projectId && entry.projectId !== filters.projectId) {
        return false;
      }
      if (filters.taskId && entry.taskId !== filters.taskId) {
        return false;
      }
      if (filters.startDate && entry.date < filters.startDate) {
        return false;
      }
      if (filters.endDate && entry.date > filters.endDate) {
        return false;
      }
      return true;
    })
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | undefined> {
  const db = await readDatabase();
  const match = db.timeEntries.find((entry) => entry.id === id);
  return match ? { ...match } : undefined;
}

export async function listTimeEntriesByIds(entryIds: string[]): Promise<TimeEntry[]> {
  if (!entryIds.length) {
    return [];
  }
  const lookup = new Set(entryIds);
  const db = await readDatabase();
  return db.timeEntries.filter((entry) => lookup.has(entry.id)).map((entry) => ({ ...entry }));
}

export type NewTimesheetInput = {
  userId: string;
  weekStart: string;
  weekEnd: string;
  status?: TimesheetStatus;
  totalMinutes: number;
  timeEntryIds: string[];
  submittedAt?: string;
  submittedById?: string;
  approvedAt?: string;
  approvedById?: string;
  rejectedAt?: string;
  rejectedById?: string;
  rejectionComment?: string;
};

export async function createTimesheet(input: NewTimesheetInput): Promise<Timesheet> {
  const timestamp = nowISO();
  const uniqueEntryIds = Array.from(new Set(input.timeEntryIds));
  const timesheet: Timesheet = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    status: input.status ?? "DRAFT",
    totalMinutes: input.totalMinutes,
    timeEntryIds: uniqueEntryIds,
    submittedAt: input.submittedAt,
    submittedById: input.submittedById,
    approvedAt: input.approvedAt,
    approvedById: input.approvedById,
    rejectedAt: input.rejectedAt,
    rejectedById: input.rejectedById,
    rejectionComment: input.rejectionComment
  };

  await updateDatabase(async (db) => {
    db.timesheets.push(timesheet);
    if (uniqueEntryIds.length) {
      const entrySet = new Set(uniqueEntryIds);
      db.timeEntries = db.timeEntries.map((entry) => {
        if (!entrySet.has(entry.id)) {
          return entry;
        }
        return {
          ...entry,
          timesheetId: timesheet.id
        };
      });
    }
    return db;
  });

  return { ...timesheet };
}

export type UpdateTimesheetInput = Partial<
  Pick<
    Timesheet,
    | "weekStart"
    | "weekEnd"
    | "status"
    | "totalMinutes"
    | "timeEntryIds"
    | "submittedAt"
    | "submittedById"
    | "approvedAt"
    | "approvedById"
    | "rejectedAt"
    | "rejectedById"
    | "rejectionComment"
  >
>;

export async function updateTimesheet(id: string, update: UpdateTimesheetInput): Promise<Timesheet> {
  let stored: Timesheet | undefined;
  await updateDatabase(async (db) => {
    const index = db.timesheets.findIndex((sheet) => sheet.id === id);
    if (index === -1) {
      throw new Error("Timesheet not found.");
    }
    const previous = db.timesheets[index];
    const uniqueEntryIds = update.timeEntryIds ? Array.from(new Set(update.timeEntryIds)) : previous.timeEntryIds;
    const merged: Timesheet = {
      ...previous,
      ...update,
      timeEntryIds: uniqueEntryIds,
      updatedAt: nowISO()
    };
    db.timesheets[index] = merged;

    if (update.timeEntryIds) {
      const nextSet = new Set(uniqueEntryIds);
      db.timeEntries = db.timeEntries.map((entry) => {
        if (entry.timesheetId === id && !nextSet.has(entry.id)) {
          return { ...entry, timesheetId: undefined };
        }
        if (nextSet.has(entry.id)) {
          return { ...entry, timesheetId: id };
        }
        return entry;
      });
    }

    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update timesheet.");
  }

  return { ...stored };
}

export async function getTimesheetById(id: string): Promise<Timesheet | undefined> {
  const db = await readDatabase();
  const match = db.timesheets.find((sheet) => sheet.id === id);
  return match ? { ...match } : undefined;
}

export async function findTimesheetByUserAndWeek(userId: string, weekStart: string): Promise<Timesheet | undefined> {
  const db = await readDatabase();
  const match = db.timesheets.find((sheet) => sheet.userId === userId && sheet.weekStart === weekStart);
  return match ? { ...match } : undefined;
}

type TimesheetFilters = {
  userId?: string;
  weekStart?: string;
  statuses?: TimesheetStatus[];
};

export async function listTimesheets(filters: TimesheetFilters = {}): Promise<Timesheet[]> {
  const statuses = filters.statuses ? new Set(filters.statuses) : null;
  const db = await readDatabase();
  return db.timesheets
    .filter((sheet) => {
      if (filters.userId && sheet.userId !== filters.userId) {
        return false;
      }
      if (filters.weekStart && sheet.weekStart !== filters.weekStart) {
        return false;
      }
      if (statuses && !statuses.has(sheet.status)) {
        return false;
      }
      return true;
    })
    .map((sheet) => ({ ...sheet }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export async function lockTimeEntries(entryIds: string[], timesheetId: string): Promise<void> {
  if (!entryIds.length) {
    return;
  }
  const entrySet = new Set(entryIds);
  const timestamp = nowISO();
  await updateDatabase(async (db) => {
    db.timeEntries = db.timeEntries.map((entry) => {
      if (!entrySet.has(entry.id)) {
        return entry;
      }
      return {
        ...entry,
        timesheetId: timesheetId,
        isLocked: true,
        updatedAt: timestamp
      };
    });
    return db;
  });
}

export async function unlockTimeEntries(entryIds: string[]): Promise<void> {
  if (!entryIds.length) {
    return;
  }
  const entrySet = new Set(entryIds);
  await updateDatabase(async (db) => {
    db.timeEntries = db.timeEntries.map((entry) => {
      if (!entrySet.has(entry.id)) {
        return entry;
      }
      return {
        ...entry,
        isLocked: false,
        updatedAt: nowISO()
      };
    });
    return db;
  });
}

export type NewAttendanceRecordInput = {
  userId: string;
  date: string;
  clockIn: string;
  outOfSchedule: boolean;
};

export type UpdateAttendanceRecordInput = Partial<
  Pick<AttendanceRecord, "clockOut" | "minutesWorked" | "status" | "outOfSchedule">
>;

export async function createAttendanceRecord(input: NewAttendanceRecordInput): Promise<AttendanceRecord> {
  const timestamp = nowISO();
  const record: AttendanceRecord = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    date: input.date,
    clockIn: input.clockIn,
    status: "OPEN",
    outOfSchedule: input.outOfSchedule
  };

  await updateDatabase(async (db) => {
    db.attendanceRecords.push(record);
    return db;
  });

  return { ...record };
}

export async function updateAttendanceRecord(
  id: string,
  update: UpdateAttendanceRecordInput
): Promise<AttendanceRecord> {
  let stored: AttendanceRecord | undefined;
  await updateDatabase(async (db) => {
    const index = db.attendanceRecords.findIndex((record) => record.id === id);
    if (index === -1) {
      throw new Error("Attendance record not found.");
    }
    const merged: AttendanceRecord = {
      ...db.attendanceRecords[index],
      ...update,
      updatedAt: nowISO()
    };
    db.attendanceRecords[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update attendance record.");
  }

  return { ...stored };
}

type AttendanceFilters = {
  userId?: string;
  status?: AttendanceStatus;
  date?: string;
};

export async function listAttendanceRecords(filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> {
  const db = await readDatabase();
  return db.attendanceRecords
    .filter((record) => {
      if (filters.userId && record.userId !== filters.userId) {
        return false;
      }
      if (filters.status && record.status !== filters.status) {
        return false;
      }
      if (filters.date && record.date !== filters.date) {
        return false;
      }
      return true;
    })
    .map((record) => ({ ...record }))
    .sort((a, b) => (a.clockIn < b.clockIn ? 1 : -1));
}

export async function getAttendanceRecordById(id: string): Promise<AttendanceRecord | undefined> {
  const db = await readDatabase();
  const match = db.attendanceRecords.find((record) => record.id === id);
  return match ? { ...match } : undefined;
}

const normalizeChips = (chips?: string[]) =>
  Array.from(new Set((chips ?? []).map((chip) => chip.trim()).filter((chip) => chip.length > 0)));

export type NewChatSessionInput = {
  userId: string;
  title?: string;
  contextChips?: string[];
};

export type UpdateChatSessionInput = Partial<
  Pick<ChatSession, "title" | "contextChips" | "lastMessageAt" | "lastMessagePreview">
>;

export async function createChatSession(input: NewChatSessionInput): Promise<ChatSession> {
  const timestamp = nowISO();
  const session: ChatSession = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId: input.userId,
    title: input.title?.trim() || "Workspace Copilot",
    contextChips: normalizeChips(input.contextChips),
    lastMessageAt: undefined,
    lastMessagePreview: undefined
  };

  await updateDatabase(async (db) => {
    db.chatSessions.push(session);
    return db;
  });

  return { ...session };
}

export async function updateChatSession(id: string, update: UpdateChatSessionInput): Promise<ChatSession> {
  let stored: ChatSession | undefined;
  await updateDatabase(async (db) => {
    const index = db.chatSessions.findIndex((session) => session.id === id);
    if (index === -1) {
      throw new Error("Chat session not found.");
    }
    const merged: ChatSession = {
      ...db.chatSessions[index],
      ...update,
      contextChips: update.contextChips
        ? normalizeChips(update.contextChips)
        : db.chatSessions[index].contextChips,
      updatedAt: nowISO()
    };
    db.chatSessions[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update chat session.");
  }

  return { ...stored };
}

export async function listChatSessionsForUser(userId: string): Promise<ChatSession[]> {
  const db = await readDatabase();
  return db.chatSessions
    .filter((session) => session.userId === userId)
    .map((session) => ({ ...session }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getChatSessionById(id: string): Promise<ChatSession | undefined> {
  const db = await readDatabase();
  const match = db.chatSessions.find((session) => session.id === id);
  return match ? { ...match } : undefined;
}

export async function listChatMessagesForSession(sessionId: string): Promise<ChatMessage[]> {
  const db = await readDatabase();
  return db.chatMessages
    .filter((msg) => msg.sessionId === sessionId)
    .map((msg) => ({ ...msg }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type NewChatMessageInput = {
  sessionId: string;
  userId: string;
  role: ChatMessageRole;
  body: string;
  metadata?: Record<string, unknown>;
  tokens?: number;
  messageType?: "TEXT" | "CALL_EVENT";
  payload?: CallEventPayload;
};

export async function createChatMessage(input: NewChatMessageInput): Promise<ChatMessage> {
  const timestamp = nowISO();
  const message: ChatMessage = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    sessionId: input.sessionId,
    userId: input.userId,
    role: input.role,
    body: input.body,
    tokens: input.tokens,
    metadata: input.metadata ? { ...input.metadata } : undefined,
    messageType: input.messageType ?? "TEXT",
    payload: input.payload ? { ...input.payload } : undefined
  };

  await updateDatabase(async (db) => {
    db.chatMessages.push(message);
    const sessionIndex = db.chatSessions.findIndex((session) => session.id === input.sessionId);
    if (sessionIndex !== -1) {
      const preview = input.body.length > 200 ? `${input.body.slice(0, 197)}...` : input.body;
      db.chatSessions[sessionIndex] = {
        ...db.chatSessions[sessionIndex],
        lastMessageAt: timestamp,
        lastMessagePreview: preview,
        updatedAt: timestamp
      };
    }
    return db;
  });

  return { ...message };
}

export async function listTeamChatMessages(
  roomId: string,
  options: { limit?: number; direction?: "asc" | "desc" } = {}
): Promise<TeamChatMessage[]> {
  const { limit = 50, direction = "asc" } = options;
  const db = await readDatabase();
  let messages = db.teamChatMessages
    .filter((msg) => msg.roomId === roomId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (direction === "desc") {
    messages.reverse();
  }

  if (limit > 0) {
    if (direction === "asc") {
      messages = messages.slice(-limit);
    } else {
      messages = messages.slice(0, limit);
    }
  }

  return messages;
}

export type NewTeamChatMessageInput = {
  roomId: string;
  authorId: string;
  body: string;
  mentions?: string[];
  messageType?: "TEXT" | "CALL_EVENT";
  payload?: CallEventPayload;
};

export async function createTeamChatMessage(input: NewTeamChatMessageInput): Promise<TeamChatMessage> {
  const timestamp = nowISO();
  const message: TeamChatMessage = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    roomId: input.roomId,
    authorId: input.authorId,
    body: input.body,
    mentions: input.mentions,
    messageType: input.messageType,
    payload: input.payload
  };

  await updateDatabase(async (db) => {
    db.teamChatMessages.push(message);
    const roomIndex = db.teamChatRooms.findIndex((room) => room.id === input.roomId);
    if (roomIndex !== -1) {
      const preview = input.body.length > 200 ? `${input.body.slice(0, 197)}...` : input.body;
      db.teamChatRooms[roomIndex] = {
        ...db.teamChatRooms[roomIndex],
        lastMessageAt: timestamp,
        lastMessagePreview: preview,
        updatedAt: timestamp
      };
    }
    return db;
  });

  return { ...message };
}

export type NewTeamChatRoomInput = {
  name: string;
  description?: string;
  topic?: string;
  createdById: string;
  type?: "GROUP" | "DIRECT";
  participantIds?: string[];
};

export async function createTeamChatRoom(input: NewTeamChatRoomInput): Promise<TeamChatRoom> {
  const timestamp = nowISO();
  const room: TeamChatRoom = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name,
    description: input.description,
    topic: input.topic,
    createdById: input.createdById,
    type: input.type || "GROUP",
    participantIds: input.participantIds
  };

  await updateDatabase(async (db) => {
    db.teamChatRooms.push(room);
    return db;
  });

  return { ...room };
}

export async function listTeamChatRooms(): Promise<TeamChatRoom[]> {
  const db = await readDatabase();
  return db.teamChatRooms.map((room) => ({ ...room }));
}

export async function getTeamChatRoomById(id: string): Promise<TeamChatRoom | undefined> {
  const db = await readDatabase();
  const room = db.teamChatRooms.find((r) => r.id === id);
  return room ? { ...room } : undefined;
}

export async function deleteTeamChatRoom(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.teamChatRooms.findIndex((r) => r.id === id);
    if (index !== -1) {
      db.teamChatRooms.splice(index, 1);
      // Also delete messages
      db.teamChatMessages = db.teamChatMessages.filter((m) => m.roomId !== id);
    }
    return db;
  });
}

export async function findDirectTeamChatRoom(userId1: string, userId2: string): Promise<TeamChatRoom | undefined> {
  const db = await readDatabase();
  return db.teamChatRooms.find((room) => {
    if (room.type !== "DIRECT") return false;
    if (!room.participantIds || room.participantIds.length !== 2) return false;
    return room.participantIds.includes(userId1) && room.participantIds.includes(userId2);
  });
}

export type NewReleaseInput = {
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  releaseDate?: string;
  status?: ReleaseStatus;
};

export type UpdateReleaseInput = Partial<Pick<Release, "name" | "description" | "startDate" | "releaseDate" | "status">>;

export async function listReleases(projectId: string): Promise<Release[]> {
  const db = await readDatabase();
  return db.releases.filter((release) => release.projectId === projectId).map((release) => ({ ...release }));
}

export async function getReleaseById(id: string): Promise<Release | undefined> {
  const db = await readDatabase();
  return db.releases.find((release) => release.id === id);
}

export async function createRelease(input: NewReleaseInput): Promise<Release> {
  const timestamp = nowISO();
  const release: Release = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: input.projectId,
    name: input.name.trim(),
    description: input.description?.trim(),
    startDate: input.startDate,
    releaseDate: input.releaseDate,
    status: input.status ?? "UNRELEASED"
  };

  await updateDatabase(async (db) => {
    if (
      db.releases.some(
        (existing) =>
          existing.projectId === release.projectId && existing.name.toLowerCase() === release.name.toLowerCase()
      )
    ) {
      throw new Error("Release with this name already exists in the project.");
    }
    db.releases.push(release);
    return db;
  });

  return { ...release };
}

export async function updateRelease(id: string, update: UpdateReleaseInput): Promise<Release> {
  let stored: Release | undefined;
  await updateDatabase(async (db) => {
    const index = db.releases.findIndex((release) => release.id === id);
    if (index === -1) {
      throw new Error("Release not found.");
    }
    const existing = db.releases[index];
    if (update.name) {
      const normalizedName = update.name.trim().toLowerCase();
      if (
        db.releases.some(
          (r, idx) =>
            idx !== index && r.projectId === existing.projectId && r.name.toLowerCase() === normalizedName
        )
      ) {
        throw new Error("Release with this name already exists in the project.");
      }
    }

    const merged: Release = {
      ...existing,
      ...update,
      name: update.name ? update.name.trim() : existing.name,
      description: update.description !== undefined ? update.description?.trim() : existing.description,
      updatedAt: nowISO()
    };
    db.releases[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update release.");
  }

  return { ...stored };
}

export async function deleteRelease(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.releases.findIndex((release) => release.id === id);
    if (index === -1) {
      throw new Error("Release not found.");
    }
    
    // Check for linked tasks
    if (db.tasks.some((task) => task.workItemTypeId === id)) {
      throw new Error("Cannot delete release with linked tasks.");
    }

    db.releases.splice(index, 1);
    return db;
  });
}

export type NewWorkItemTypeInput = {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  projectId?: string;
  workflowSchemeId?: string;
  fieldConfig?: Record<string, unknown>;
};

export type UpdateWorkItemTypeInput = Partial<NewWorkItemTypeInput>;

export async function listWorkItemTypes(projectId?: string): Promise<WorkItemType[]> {
  const db = await readDatabase();
  return db.workItemTypes
    .filter((type) => !type.projectId || type.projectId === projectId)
    .map((type) => ({ ...type }));
}

export async function getWorkItemTypeById(id: string): Promise<WorkItemType | undefined> {
  const db = await readDatabase();
  return db.workItemTypes.find((type) => type.id === id);
}

export async function createWorkItemType(input: NewWorkItemTypeInput): Promise<WorkItemType> {
  const timestamp = nowISO();
  const type: WorkItemType = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name.trim(),
    description: input.description?.trim(),
    icon: input.icon,
    color: input.color,
    projectId: input.projectId,
    workflowSchemeId: input.workflowSchemeId,
    fieldConfig: input.fieldConfig
  };

  await updateDatabase(async (db) => {
    if (
      db.workItemTypes.some(
        (existing) =>
          existing.projectId === type.projectId && existing.name.toLowerCase() === type.name.toLowerCase()
      )
    ) {
      throw new Error("Work item type with this name already exists.");
    }
    db.workItemTypes.push(type);
    return db;
  });

  return { ...type };
}

export async function updateWorkItemType(id: string, update: UpdateWorkItemTypeInput): Promise<WorkItemType> {
  let stored: WorkItemType | undefined;
  await updateDatabase(async (db) => {
    const index = db.workItemTypes.findIndex((type) => type.id === id);
    if (index === -1) {
      throw new Error("Work item type not found.");
    }
    const existing = db.workItemTypes[index];
    if (update.name) {
      const normalizedName = update.name.trim().toLowerCase();
      if (
        db.workItemTypes.some(
          (t, idx) =>
            idx !== index && t.projectId === existing.projectId && t.name.toLowerCase() === normalizedName
        )
      ) {
        throw new Error("Work item type with this name already exists.");
      }
    }

    const merged: WorkItemType = {
      ...existing,
      ...update,
      name: update.name ? update.name.trim() : existing.name,
      description: update.description !== undefined ? update.description?.trim() : existing.description,
      updatedAt: nowISO()
    };
    db.workItemTypes[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update work item type.");
  }

  return { ...stored };
}

export async function deleteWorkItemType(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.workItemTypes.findIndex((type) => type.id === id);
    if (index === -1) {
      throw new Error("Work item type not found.");
    }
    
    if (db.tasks.some((task) => task.workItemTypeId === id)) {
      throw new Error("Cannot delete work item type with linked tasks.");
    }

    db.workItemTypes.splice(index, 1);
    return db;
  });
}

export type NewWorkflowSchemeInput = {
  name: string;
  description?: string;
  projectId?: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
};

export type UpdateWorkflowSchemeInput = Partial<NewWorkflowSchemeInput>;

export async function listWorkflowSchemes(projectId?: string): Promise<WorkflowScheme[]> {
  const db = await readDatabase();
  return db.workflowSchemes
    .filter((scheme) => !scheme.projectId || scheme.projectId === projectId)
    .map((scheme) => ({ ...scheme }));
}

export async function getWorkflowSchemeById(id: string): Promise<WorkflowScheme | undefined> {
  const db = await readDatabase();
  return db.workflowSchemes.find((scheme) => scheme.id === id);
}

export async function createWorkflowScheme(input: NewWorkflowSchemeInput): Promise<WorkflowScheme> {
  const timestamp = nowISO();
  const scheme: WorkflowScheme = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name.trim(),
    description: input.description?.trim(),
    projectId: input.projectId,
    states: input.states,
    transitions: input.transitions
  };

  await updateDatabase(async (db) => {
    if (
      db.workflowSchemes.some(
        (existing) =>
          existing.projectId === scheme.projectId && existing.name.toLowerCase() === scheme.name.toLowerCase()
      )
    ) {
      throw new Error("Workflow scheme with this name already exists.");
    }
    db.workflowSchemes.push(scheme);
    return db;
  });

  return { ...scheme };
}

export async function updateWorkflowScheme(id: string, update: UpdateWorkflowSchemeInput): Promise<WorkflowScheme> {
  let stored: WorkflowScheme | undefined;
  await updateDatabase(async (db) => {
    const index = db.workflowSchemes.findIndex((scheme) => scheme.id === id);
    if (index === -1) {
      throw new Error("Workflow scheme not found.");
    }
    const existing = db.workflowSchemes[index];
    if (update.name) {
      const normalizedName = update.name.trim().toLowerCase();
      if (
        db.workflowSchemes.some(
          (s, idx) =>
            idx !== index && s.projectId === existing.projectId && s.name.toLowerCase() === normalizedName
        )
      ) {
        throw new Error("Workflow scheme with this name already exists.");
      }
    }

    const merged: WorkflowScheme = {
      ...existing,
      ...update,
      name: update.name ? update.name.trim() : existing.name,
      description: update.description !== undefined ? update.description?.trim() : existing.description,
      updatedAt: nowISO()
    };
    db.workflowSchemes[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update workflow scheme.");
  }

  return { ...stored };
}

export async function deleteWorkflowScheme(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.workflowSchemes.findIndex((scheme) => scheme.id === id);
    if (index === -1) {
      throw new Error("Workflow scheme not found.");
    }
    
    if (db.workItemTypes.some((type) => type.workflowSchemeId === id)) {
      throw new Error("Cannot delete workflow scheme linked to work item types.");
    }

    db.workflowSchemes.splice(index, 1);
    return db;
  });
}

export async function getSystemSetting<T>(key: string): Promise<T | undefined> {
  const db = await readDatabase();
  const setting = db.systemSettings.find((s) => s.key === key);
  return setting?.value as T | undefined;
}

export async function updateSystemSetting<T>(key: string, value: T): Promise<void> {
  const timestamp = nowISO();
  await updateDatabase(async (db) => {
    const index = db.systemSettings.findIndex((s) => s.key === key);
    if (index >= 0) {
      db.systemSettings[index] = {
        ...db.systemSettings[index],
        value,
        updatedAt: timestamp
      };
    } else {
      db.systemSettings.push({
        id: randomUUID(),
        key,
        value,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
    return db;
  });
}

export async function listRoles(): Promise<RoleDefinition[]> {
  const db = await readDatabase();
  return [...db.roles];
}

export async function createRole(name: string, description?: string): Promise<RoleDefinition> {
  const timestamp = nowISO();
  const role: RoleDefinition = {
    id: randomUUID(),
    name: name.trim().toUpperCase().replace(/\s+/g, "_"),
    description: description?.trim(),
    isSystem: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await updateDatabase(async (db) => {
    if (db.roles.some((r) => r.name === role.name)) {
      throw new Error("Role already exists.");
    }
    db.roles.push(role);
    return db;
  });

  return role;
}

export async function deleteRoleByName(name: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.roles.findIndex((r) => r.name === name);
    if (index === -1) {
      throw new Error("Role not found.");
    }
    if (db.roles[index].isSystem) {
      throw new Error("Cannot delete system role.");
    }
    
    // Remove role definition
    db.roles.splice(index, 1);

    // Remove associated permissions
    const permIndex = db.rolePermissions.findIndex((rp) => rp.role === name);
    if (permIndex !== -1) {
      db.rolePermissions.splice(permIndex, 1);
    }

    return db;
  });
}

export type NewMeetingInput = {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  organizerId: string;
  participantIds: string[];
  externalParticipants?: string[];
  location?: string;
  type: MeetingType;
  linkedChatRoomId?: string;
  projectId?: string;
  taskId?: string;
  allDay?: boolean;
};

export type UpdateMeetingInput = Partial<
  Pick<
    Meeting,
    | "title"
    | "description"
    | "startTime"
    | "endTime"
    | "participantIds"
    | "externalParticipants"
    | "location"
    | "type"
    | "status"
    | "linkedChatRoomId"
    | "projectId"
    | "taskId"
    | "allDay"
  >
>;

export async function listMeetings(filters: {
  userId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<Meeting[]> {
  const db = await readDatabase();
  return db.meetings
    .filter((meeting) => {
      if (filters.userId && meeting.organizerId !== filters.userId && !meeting.participantIds.includes(filters.userId)) {
        return false;
      }
      if (filters.projectId && meeting.projectId !== filters.projectId) {
        return false;
      }
      if (filters.startDate && meeting.endTime < filters.startDate) {
        return false;
      }
      if (filters.endDate && meeting.startTime > filters.endDate) {
        return false;
      }
      return true;
    })
    .map((meeting) => ({ ...meeting }));
}

export async function getMeetingById(id: string): Promise<Meeting | undefined> {
  const db = await readDatabase();
  return db.meetings.find((meeting) => meeting.id === id);
}

export async function createMeeting(input: NewMeetingInput): Promise<Meeting> {
  const timestamp = nowISO();
  const meeting: Meeting = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    title: input.title.trim(),
    description: input.description?.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    organizerId: input.organizerId,
    participantIds: input.participantIds,
    externalParticipants: input.externalParticipants,
    location: input.location,
    type: input.type,
    status: "SCHEDULED",
    linkedChatRoomId: input.linkedChatRoomId,
    projectId: input.projectId,
    taskId: input.taskId,
    allDay: input.allDay ?? false
  };

  await updateDatabase(async (db) => {
    db.meetings.push(meeting);
    return db;
  });

  return { ...meeting };
}

export async function updateMeeting(id: string, update: UpdateMeetingInput): Promise<Meeting> {
  let stored: Meeting | undefined;
  await updateDatabase(async (db) => {
    const index = db.meetings.findIndex((meeting) => meeting.id === id);
    if (index === -1) {
      throw new Error("Meeting not found.");
    }
    const merged: Meeting = {
      ...db.meetings[index],
      ...update,
      updatedAt: nowISO()
    };
    db.meetings[index] = merged;
    stored = merged;
    return db;
  });

  if (!stored) {
    throw new Error("Unable to update meeting.");
  }

  return { ...stored };
}

export async function deleteMeeting(id: string): Promise<void> {
  await updateDatabase(async (db) => {
    const index = db.meetings.findIndex((meeting) => meeting.id === id);
    if (index === -1) {
      throw new Error("Meeting not found.");
    }
    db.meetings.splice(index, 1);
    return db;
  });
}





