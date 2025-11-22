export type Role =
  | "SUPER_ADMIN"
  | "VP"
  | "PM"
  | "ENGINEER"
  | "PROJECT_MANAGER"
  | "DEVELOPER"
  | "VIEWER";

export type PermissionModule =
  | "dashboard"
  | "projects"
  | "tasks"
  | "notifications"
  | "teamDevelopers"
  | "approvals"
  | "alerts"
  | "reports"
  | "chat"
  | "settings"
  | "admin"
  | "adminHolidays"
  | "personas";

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface Profile {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  country: string;
  city: string;
  timeZone: string;
  title: string;
  [key: string]: string;
}

export type ProfileStatus = "ACTIVE" | "PENDING_APPROVAL" | "REJECTED";

export type DashboardTimeGranularity = "day" | "week" | "month" | "quarter";

export interface DashboardFilterParams {
  dateFrom?: string;
  dateTo?: string;
  timeGranularity?: DashboardTimeGranularity;
  businessUnitIds?: string[];
  productModuleIds?: string[];
  projectIds?: string[];
  vendorIds?: string[];
  productManagerIds?: string[];
  statusList?: ProjectStatus[];
  riskLevels?: ProjectRiskLevel[];
  healthList?: ProjectHealth[];
}

export interface DashboardSavedView {
  id: string;
  name: string;
  filterParams: DashboardFilterParams;
  createdAt: string;
}

export interface UserDashboardPreferences {
  savedDashboardViews: DashboardSavedView[];
  managedVendorIds?: string[];
  preferredCompanyIds?: string[];
}

export interface User extends BaseEntity {
  email: string;
  role: Role;
  profile: Profile;
  passwordHash: string;
  isActive: boolean;
  profileStatus: ProfileStatus;
  profileComment?: string;
  companyId?: string;
  firstLoginRequired: boolean;
  preferences?: UserDashboardPreferences;
  vpUserId?: string;
  permittedModules?: PermissionModule[];
}

export interface UserNotificationPreferences {
  dailyDigestEmail: boolean;
  taskAssignmentEmail: boolean;
  commentMentionEmail: boolean;
  timesheetReminderEmail: boolean;
  alertEscalationsEmail: boolean;
}

export interface UserWorkflowPreferences {
  autoSubscribeOnAssignment: boolean;
  autoShareStatusWithTeam: boolean;
  autoCaptureFocusBlocks: boolean;
}

export interface UserAvailabilityPreferences {
  meetingHoursStart: string;
  meetingHoursEnd: string;
  shareCalendarWithTeam: boolean;
  protectFocusTime: boolean;
}

export interface UserPreferences extends BaseEntity {
  userId: string;
  notificationPreferences: UserNotificationPreferences;
  workflowPreferences: UserWorkflowPreferences;
  availabilityPreferences: UserAvailabilityPreferences;
}

export type CompanyType = "HUMAIN" | "VENDOR";

export interface Company extends BaseEntity {
  name: string;
  type: CompanyType;
  isActive: boolean;
  description?: string;
  ceoUserId?: string;
  vendorOwnerUserId?: string;
  vendorCeoUserId?: string;
  region?: string;
  timeZone?: string;
  slaConfig?: CompanySlaConfig;
}

export interface CompanySlaConfig {
  responseTimeHours?: number;
  resolutionTimeHours?: number;
  notes?: string;
}

export type UserInvitationStatus = "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

export interface UserInvitation extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  companyId?: string;
  invitedById: string;
  token: string;
  status: UserInvitationStatus;
  acceptedUserId?: string;
}

export type ProfileChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ProfileChangeRequest extends BaseEntity {
  userId: string;
  requestedById: string;
  profile: Profile;
  status: ProfileChangeRequestStatus;
  reviewedById?: string;
  reviewedAt?: string;
  decisionComment?: string;
}

export interface Notification extends BaseEntity {
  userId: string;
  message: string;
  type: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

export interface ActivityLog extends BaseEntity {
  actorId: string;
  action: string;
  entityId?: string;
  entityType?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RolePermission extends BaseEntity {
  role: Role;
  modules: PermissionModule[];
}

export type CommentEntityType = "TASK" | "TIMESHEET";

export interface Comment extends BaseEntity {
  entityId: string;
  entityType: CommentEntityType;
  authorId: string;
  body: string;
  attachmentIds: string[];
}

export type AttachmentEntityType = CommentEntityType | "PROJECT" | "PROFILE";

export interface Attachment extends BaseEntity {
  entityId?: string;
  entityType?: AttachmentEntityType;
  uploaderId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export type AlertStatus = "OPEN" | "RESOLVED";

export type AlertType =
  | "MISSING_DAILY_LOG"
  | "INACTIVITY"
  | "OVER_BUDGET"
  | "HOLIDAY_WORK"
  | "SCHEDULE_EXCEPTION"
  | "TASK_OVERDUE"
  | "OVERDUE_MILESTONE"
  | "HIGH_RISK_PROJECT"
  | "LOW_UTILISATION";

export interface Alert extends BaseEntity {
  type: AlertType;
  status: AlertStatus;
  message: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
  entityId?: string;
  entityType?: string;
  userId?: string;
  projectId?: string;
  companyId?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  resolvedAt?: string;
  resolvedById?: string;
}

export type ProjectStatus = "PROPOSED" | "IN_PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type ProjectPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ProjectStage = "IDEA" | "DISCOVERY" | "PLANNING" | "EXECUTION" | "CLOSURE";
export type ProjectHealth = "RED" | "AMBER" | "GREEN";
export type ProjectType = "PRODUCT_FEATURE" | "PLATFORM_UPGRADE" | "VENDOR_ENGAGEMENT" | "EXPERIMENT";
export type ProjectRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ProjectRateModel = "TIME_AND_MATERIAL" | "FIXED_FEE" | "MILESTONE_BASED";

export interface Project extends BaseEntity {
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
  vendorCompanyIds: string[];
  primaryVendorId?: string;
  additionalVendorIds: string[];
  budgetHours: number;
  estimatedEffortHours: number;
  approvedBudgetAmount?: number;
  approvedBudgetCurrency?: string;
  timeTrackingRequired: boolean;
  status: ProjectStatus;
  health: ProjectHealth;
  riskLevel: ProjectRiskLevel;
  riskSummary?: string;
  complianceFlags: string[];
  businessUnit: string;
  productModule: string;
  tags: string[];
  contractId?: string;
  rateModel: ProjectRateModel;
  rateCardReference?: string;
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  taskWorkflowDefinitionId: string;
  workflowSchemeId?: string;
  isDraft: boolean;
  packageStatus: ProjectPackageStatus;
  packageSentBackTo?: ProjectPackageReturnTarget;
  packageSentBackReason?: string;
}

export type ReleaseStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";

export interface Release extends BaseEntity {
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  releaseDate?: string;
  status: ReleaseStatus;
}

export interface WorkItemType extends BaseEntity {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  projectId?: string;
  workflowSchemeId?: string;
  fieldConfig?: Record<string, unknown>;
}

export interface WorkflowState {
  id: string;
  name: string;
  category: "TODO" | "IN_PROGRESS" | "DONE";
  color?: string;
  order: number;
}

export interface WorkflowTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  name?: string;
}

export interface WorkflowScheme extends BaseEntity {
  name: string;
  description?: string;
  projectId?: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export type AiProvider = "openai" | "gemini" | "claude" | "local";

export interface SystemSetting extends BaseEntity {
  key: string;
  value: unknown;
}

export interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  localUrl?: string;
  modelName?: string;
}

export type TaskStatus = string;
export type TaskType = string;
export type TaskPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TaskItemType = "BUG" | "NEW_FEATURE" | "EXISTING_FEATURE" | "IMPROVEMENT";
export type TaskSprint = "S1" | "S2";

export type ProjectPackageStatus =
  | "PM_DRAFT"
  | "PJM_REVIEW"
  | "ENG_REVIEW"
  | "PM_ACTIVATE"
  | "SENT_BACK"
  | "ACTIVE";

export type ProjectPackageReturnTarget = "PM" | "PJM" | "ENG";

export interface TaskAssignmentPlanEntry {
  userId: string;
  hours: number;
}

export interface TaskTypeMeta {
  bug?: {
    priority?: TaskPriority;
    stepsToReproduce?: string;
    expectedResult?: string;
    actualResult?: string;
  };
  newFeature?: {
    userStory?: string;
  };
  existingFeature?: {
    userStory?: string;
  };
  improvement?: {
    description?: string;
  };
}

export type TaskEstimationUnit = "HOURS" | "DAYS";
export type TaskEstimationStatus = "NOT_SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

export interface TaskEstimation {
  quantity: number;
  unit: TaskEstimationUnit;
  notes?: string;
  submittedById: string;
  submittedAt: string;
  status: TaskEstimationStatus;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  updatedAt?: string;
}

export interface Task extends BaseEntity {
  projectId: string;
  itemType: TaskItemType;
  taskType: TaskType;
  title: string;
  description?: string;
  createdById: string;
  reporterUserId?: string;
  assigneeUserId?: string;
  isVendorTask: boolean;
  vendorId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  budgetHours: number;
  estimateStoryPoints?: number;
  dueDate?: string;
  plannedStartDate?: string;
  requiredSkills: string[];
  acceptanceCriteria: string[];
  dependencyTaskIds: string[];
  environment?: string;
  linkedIssueIds: string[];
  epicId?: string;
  component?: string;
  sprintId?: string;
  sprint?: TaskSprint;
  estimation?: TaskEstimation;
  estimationHours?: number;
  costAmount?: number;
  assignmentPlan?: TaskAssignmentPlanEntry[];
  typeMeta?: TaskTypeMeta;
  expectedCompletionDate?: string;
  workflowInstanceId?: string;
  parentId?: string;
  releaseId?: string;
  workItemTypeId?: string;
}

export interface TaskComment extends BaseEntity {
  taskId: string;
  authorId: string;
  body: string;
}

export type WorkflowEntityType = "TASK";

export type WorkflowActionType = "APPROVE" | "REJECT" | "SEND_BACK" | "REQUEST_CHANGE";

export type WorkflowApproverType = "ROLE" | "DYNAMIC";

export type WorkflowApproverDynamic =
  | "ENGINEERING_TEAM"
  | "TASK_PROJECT_MANAGER"
  | "TASK_PM"
  | "TASK_ASSIGNED_DEVELOPER";

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description?: string;
  order: number;
  assigneeRole: Role;
  approverType: WorkflowApproverType;
  approverRole?: Role;
  dynamicApproverType?: WorkflowApproverDynamic;
  requiresCommentOnReject: boolean;
  requiresCommentOnSendBack: boolean;
  actions: WorkflowActionType[];
}

export interface WorkflowDefinition extends BaseEntity {
  entityType: WorkflowEntityType;
  name: string;
  description?: string;
  isActive: boolean;
  steps: WorkflowStepDefinition[];
}

export type WorkflowStepStatus = "PENDING" | "ACTIVE" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "SENT_BACK";

export type WorkflowInstanceStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CHANGES_REQUESTED";

export interface WorkflowStepInstance {
  stepId: string;
  name: string;
  assigneeRole: Role;
  approverType: WorkflowApproverType;
  approverRole?: Role;
  dynamicApproverType?: WorkflowApproverDynamic;
  requiresCommentOnReject: boolean;
  requiresCommentOnSendBack: boolean;
  status: WorkflowStepStatus;
  actedById?: string;
  actedAt?: string;
  action?: WorkflowActionType;
  comment?: string;
}

export interface WorkflowInstance extends BaseEntity {
  definitionId: string;
  entityId: string;
  entityType: WorkflowEntityType;
  status: WorkflowInstanceStatus;
  steps: WorkflowStepInstance[];
  currentStepId?: string;
  context?: Record<string, unknown>;
}

export interface WorkflowAction extends BaseEntity {
  instanceId: string;
  stepId: string;
  actorId: string;
  action: WorkflowActionType;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkScheduleSlot {
  day: number; // 0 Sunday - 6 Saturday
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface WorkSchedule extends BaseEntity {
  name: string;
  timeZone: string;
  companyId?: string;
  userId?: string;
  slots: WorkScheduleSlot[];
}

export interface CompanyHoliday extends BaseEntity {
  companyId?: string;
  vendorId?: string;
  calendarName: string;
  date: string;
  name: string;
  isFullDay: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  recurrenceRule?: string;
  countryCode?: string;
}

export type DayOffStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "EMERGENCY" | "OTHER";

export interface DayOff extends BaseEntity {
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
  attachmentIds: string[];
  status: DayOffStatus;
  submittedAt?: string;
  submittedById?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedById?: string;
  rejectedAt?: string;
  decisionComment?: string;
  cancelledAt?: string;
  cancelledById?: string;
}

export type AttendanceStatus = "OPEN" | "COMPLETED";

export interface AttendanceRecord extends BaseEntity {
  userId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  minutesWorked?: number;
  status: AttendanceStatus;
  outOfSchedule: boolean;
}

export type TimeEntrySource = "MANUAL";

export interface TimeEntry extends BaseEntity {
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
  timesheetId?: string;
  isLocked: boolean;
  workTypeCode?: string;
  billable: boolean;
  location?: string;
  costRate?: number;
  costAmount?: number;
}

export type AssignmentStatus = "PENDING" | "APPROVED" | "CANCELLED" | "COMPLETED" | "SUBMITTED";

export interface Assignment extends BaseEntity {
  taskId: string;
  developerId: string;
  requestedById: string;
  requestedMessage?: string;
  status: AssignmentStatus;
  approvedById?: string;
  approvedAt?: string;
  canceledById?: string;
  canceledAt?: string;
  cancelReason?: string;
  completionNote?: string;
  completedAt?: string;
}

export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface Timesheet extends BaseEntity {
  userId: string;
  weekStart: string;
  weekEnd: string;
  status: TimesheetStatus;
  totalMinutes: number;
  timeEntryIds: string[];
  submittedAt?: string;
  submittedById?: string;
  approvedAt?: string;
  approvedById?: string;
  rejectedAt?: string;
  rejectedById?: string;
  rejectionComment?: string;
}

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export interface ChatSession extends BaseEntity {
  userId: string;
  title: string;
  contextChips: string[];
  lastMessagePreview?: string;
  lastMessageAt?: string;
}

export type CallMediaType = "audio" | "video";

export type CallEventType = "call_started" | "call_ended" | "call_declined" | "missed_call";

export interface CallEventPayload {
  event: CallEventType;
  fromUserId: string;
  toUserId: string;
  media?: CallMediaType;
  startedAt?: string;
  endedAt?: string;
  reason?: string;
}

export interface ChatMessage extends BaseEntity {
  sessionId: string;
  userId: string;
  role: ChatMessageRole;
  body: string;
  tokens?: number;
  metadata?: Record<string, unknown>;
  messageType?: "TEXT" | "CALL_EVENT";
  payload?: CallEventPayload;
}

export interface TeamChatRoom extends BaseEntity {
  name: string;
  description?: string;
  topic?: string;
  createdById: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  type?: "GROUP" | "DIRECT";
  participantIds?: string[];
}

export interface TeamChatMessage extends BaseEntity {
  roomId: string;
  authorId: string;
  body: string;
  mentions?: string[];
  messageType?: "TEXT" | "CALL_EVENT";
  payload?: CallEventPayload;
}

export type DashboardTrendDirection = "up" | "down" | "flat";
export type DashboardChartType = "pie" | "bar" | "stacked_bar" | "line" | "area" | "radar" | "heatmap";
export type DashboardTaskExceptionType = "OVERDUE" | "BLOCKED" | "AT_RISK";

export interface DashboardKpiCard {
  id: string;
  label: string;
  primaryValue: string;
  secondaryText?: string;
  trendValue?: string;
  trendDirection?: DashboardTrendDirection;
  clickAction?: { type: string; payload?: Record<string, unknown> };
}

export interface DashboardChartSeries {
  label: string;
  values: number[];
  color?: string;
  meta?: Record<string, unknown>;
}

export interface DashboardChartPayload {
  id: string;
  title: string;
  type: DashboardChartType;
  categories?: string[];
  series: DashboardChartSeries[];
  summary?: string;
  meta?: Record<string, unknown>;
}

export interface DashboardProjectRow {
  projectId: string;
  name: string;
  code: string;
  status: ProjectStatus;
  health: ProjectHealth;
  riskLevel: ProjectRiskLevel;
  businessUnit: string;
  productModule: string;
  ownerId?: string;
  ownerName?: string;
  sponsorName?: string;
  progressPercent: number;
  plannedPercent: number;
  budgetHours: number;
  hoursLogged: number;
  tasksTotal: number;
  tasksDone: number;
  openAlerts: number;
  vendors: Array<{ id: string; name: string }>;
  updatedAt: string;
}

export interface DashboardTaskExceptionRow {
  taskId: string;
  title: string;
  projectId: string;
  projectName?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assigneeId?: string;
  assigneeName?: string;
  vendorId?: string;
  vendorName?: string;
  exceptionType: DashboardTaskExceptionType;
  daysOverdue?: number;
  blockedDays?: number;
  riskLevel?: ProjectRiskLevel;
  updatedAt: string;
}

export interface DashboardVendorRow {
  vendorId: string;
  vendorName: string;
  activeProjects: number;
  hoursLogged: number;
  utilisationPercent: number;
  slaAdherencePercent: number;
  overdueTasks: number;
  blockedTasks: number;
}

export interface DashboardAlertRow {
  id: string;
  type: AlertType;
  status: AlertStatus;
  message: string;
  projectId?: string;
  projectName?: string;
  vendorId?: string;
  vendorName?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
}

export interface DashboardAlertsSummary {
  openCount: number;
  byType: Record<string, number>;
  rows: DashboardAlertRow[];
}

export interface DashboardSummaryPayload {
  kpi_cards: DashboardKpiCard[];
  charts: Record<string, DashboardChartPayload>;
  projects_summary_rows: DashboardProjectRow[];
  task_exceptions_rows: DashboardTaskExceptionRow[];
  vendor_performance_rows: DashboardVendorRow[];
  alerts_summary: DashboardAlertsSummary;
  saved_views?: DashboardSavedView[];
}


export interface DatabaseSchema {
  users: User[];
  userPreferences: UserPreferences[];
  companies: Company[];
  userInvitations: UserInvitation[];
  profileChangeRequests: ProfileChangeRequest[];
  projects: Project[];
  tasks: Task[];
  assignments: Assignment[];
  workflowDefinitions: WorkflowDefinition[];
  workflowInstances: WorkflowInstance[];
  workflowActions: WorkflowAction[];
  timeEntries: TimeEntry[];
  workSchedules: WorkSchedule[];
  companyHolidays: CompanyHoliday[];
  dayOffs: DayOff[];
  attendanceRecords: AttendanceRecord[];
  timesheets: Timesheet[];
  comments: Comment[];
  attachments: Attachment[];
  alerts: Alert[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
  chatSessions: ChatSession[];
  chatMessages: ChatMessage[];
  teamChatRooms: TeamChatRoom[];
  teamChatMessages: TeamChatMessage[];
  rolePermissions: RolePermission[];
  releases: Release[];
  workItemTypes: WorkItemType[];
  workflowSchemes: WorkflowScheme[];
  systemSettings: SystemSetting[];
}

export const DATABASE_KEYS = [
  "users",
  "userPreferences",
  "companies",
  "userInvitations",
  "profileChangeRequests",
  "projects",
  "tasks",
  "assignments",
  "workflowDefinitions",
  "workflowInstances",
  "workflowActions",
  "timeEntries",
  "workSchedules",
  "companyHolidays",
  "dayOffs",
  "attendanceRecords",
  "timesheets",
  "comments",
  "attachments",
  "alerts",
  "notifications",
  "activityLogs",
  "chatSessions",
  "chatMessages",
  "teamChatRooms",
  "teamChatMessages",
  "rolePermissions",
  "releases",
  "workItemTypes",
  "workflowSchemes",
  "systemSettings"
] as const;

export type DatabaseKey = (typeof DATABASE_KEYS)[number];

export function createEmptyDatabaseState(): DatabaseSchema {
  return {
    users: [],
    userPreferences: [],
    companies: [],
    userInvitations: [],
    profileChangeRequests: [],
    projects: [],
    tasks: [],
    assignments: [],
    workflowDefinitions: [],
    workflowInstances: [],
    workflowActions: [],
    timeEntries: [],
    workSchedules: [],
    companyHolidays: [],
    dayOffs: [],
    attendanceRecords: [],
    timesheets: [],
    comments: [],
    attachments: [],
    alerts: [],
    notifications: [],
    activityLogs: [],
    chatSessions: [],
    chatMessages: [],
    teamChatRooms: [],
    teamChatMessages: [],
    rolePermissions: [],
    releases: [],
    workItemTypes: [],
    workflowSchemes: [],
    systemSettings: []
  };
}
export type PublicUser = Pick<
  User,
  | "id"
  | "email"
  | "role"
  | "isActive"
  | "companyId"
  | "createdAt"
  | "updatedAt"
  | "profileStatus"
  | "profileComment"
  | "firstLoginRequired"
  | "vpUserId"
  | "permittedModules"
> & {
  profile: Profile;
  preferences?: UserDashboardPreferences;
};

export type PublicCompany = Company;

export type PublicInvitation = UserInvitation;

export type PublicProfileChangeRequest = ProfileChangeRequest;













