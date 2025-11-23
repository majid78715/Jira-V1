export type Role =
  | "SUPER_ADMIN"
  | "VP"
  | "PM"
  | "ENGINEER"
  | "PROJECT_MANAGER"
  | "DEVELOPER"
  | "VIEWER"
  | (string & {});

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

export type CompanyType = "HUMAIN" | "VENDOR";
export type ProfileStatus = "ACTIVE" | "PENDING_APPROVAL" | "REJECTED";

export interface Profile {
  firstName: string;
  lastName: string;
  mobileNumber?: string;
  country?: string;
  city?: string;
  timeZone?: string;
  title: string;
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

export interface UserPreferences {
  id: string;
  userId: string;
  notificationPreferences: UserNotificationPreferences;
  workflowPreferences: UserWorkflowPreferences;
  availabilityPreferences: UserAvailabilityPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  profile: Profile;
  companyId?: string;
  isActive: boolean;
  profileStatus: ProfileStatus;
  profileComment?: string;
  createdAt: string;
  updatedAt: string;
  firstLoginRequired: boolean;
  preferences?: UserDashboardPreferences;
  vpUserId?: string;
  permittedModules?: PermissionModule[];
}

export interface DashboardFilterParams {
  dateFrom?: string;
  dateTo?: string;
  timeGranularity?: "day" | "week" | "month" | "quarter";
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

export interface RolePermission {
  id: string;
  role: Role;
  modules: PermissionModule[];
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  companyId?: string;
  invitedById: string;
  token: string;
  status: "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface ProfileChangeRequest {
  id: string;
  userId: string;
  requestedById: string;
  profile: Profile;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedById?: string;
  reviewedAt?: string;
  decisionComment?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "PROPOSED" | "IN_PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type ProjectPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ProjectStage = "IDEA" | "DISCOVERY" | "PLANNING" | "EXECUTION" | "CLOSURE";
export type ProjectHealth = "RED" | "AMBER" | "GREEN";
export type ProjectType = "PRODUCT_FEATURE" | "PLATFORM_UPGRADE" | "VENDOR_ENGAGEMENT" | "EXPERIMENT";
export type ProjectRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ProjectRateModel = "TIME_AND_MATERIAL" | "FIXED_FEE" | "MILESTONE_BASED";

export interface Project {
  id: string;
  name: string;
  code: string;
  description?: string;
  ownerId: string;
  ownerIds: string[];
  owner?: User;
  projectType: ProjectType;
  objectiveOrOkrId?: string;
  priority: ProjectPriority;
  stage: ProjectStage;
  sponsorUserId: string;
  sponsor?: User;
  deliveryManagerUserId?: string;
  deliveryManagerUserIds: string[];
  deliveryManager?: User;
  coreTeamUserIds: string[];
  coreTeamMembers?: User[];
  stakeholderUserIds: string[];
  stakeholderMembers?: User[];
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
  metrics?: ProjectMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetrics {
  hoursLogged: number;
  hoursLoggedPercent: number;
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

export type TaskStatus =
  | "NEW"
  | "PLANNED"
  | "BACKLOG"
  | "SELECTED"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "BLOCKED"
  | "DONE";
export type TaskType = "STORY" | "TASK" | "BUG" | "CHANGE" | "SPIKE" | "MILESTONE";
export type TaskPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TaskItemType = "BUG" | "NEW_FEATURE" | "EXISTING_FEATURE" | "IMPROVEMENT";
export type TaskSprint = "S1" | "S2";

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
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  submittedById: string;
  submittedAt: string;
  status: TaskEstimationStatus;
  updatedAt?: string;
}

export interface Task {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export type ProjectPackageStatus =
  | "PM_DRAFT"
  | "PJM_REVIEW"
  | "ENG_REVIEW"
  | "PM_ACTIVATE"
  | "SENT_BACK"
  | "ACTIVE";

export type ProjectPackageReturnTarget = "PM" | "PJM" | "ENG";

export type ReleaseStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";

export type CommentEntityType = "TASK" | "TIMESHEET";

export interface Comment {
  id: string;
  entityId: string;
  entityType: CommentEntityType;
  authorId: string;
  body: string;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type TaskComment = Comment;

export type AssignmentStatus = "PENDING" | "APPROVED" | "CANCELLED" | "COMPLETED" | "SUBMITTED";

export interface Assignment {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  action: string;
  message: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentEntityType = CommentEntityType | "PROJECT" | "PROFILE";

export interface Attachment {
  id: string;
  entityId?: string;
  entityType?: AttachmentEntityType;
  uploaderId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
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

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  entityType: WorkflowEntityType;
  isActive: boolean;
  steps: WorkflowStepDefinition[];
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStepStatus = "PENDING" | "ACTIVE" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "SENT_BACK";

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

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  entityId: string;
  entityType: "TASK";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CHANGES_REQUESTED";
  steps: WorkflowStepInstance[];
  currentStepId?: string;
  context?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAction {
  id: string;
  instanceId: string;
  stepId: string;
  actorId: string;
  action: WorkflowActionType;
  comment?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWorkflowSummary {
  definition: WorkflowDefinition;
  instance: WorkflowInstance;
  actions: WorkflowAction[];
}

export interface WorkScheduleSlot {
  day: number;
  start: string;
  end: string;
}

export interface WorkSchedule {
  timeZone: string;
  slots: WorkScheduleSlot[];
}

export interface CompanyHoliday {
  id: string;
  companyId?: string;
  vendorId?: string;
  calendarName: string;
  name: string;
  date: string;
  isFullDay: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  recurrenceRule?: string;
  countryCode?: string;
  createdAt: string;
  updatedAt: string;
}

export type DayOffStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "EMERGENCY" | "OTHER";

export interface DayOff {
  id: string;
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
  cancelledAt?: string;
  cancelledById?: string;
  decisionComment?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = "OPEN" | "COMPLETED";

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  minutesWorked?: number;
  status: AttendanceStatus;
  outOfSchedule: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  date: string;
  minutes: number;
  startedAt: string;
  endedAt: string;
  note?: string;
  source: "MANUAL";
  outOfSchedule: boolean;
  createdAt: string;
  updatedAt: string;
  timesheetId?: string;
  isLocked: boolean;
  workTypeCode?: string;
  billable: boolean;
  location?: string;
  costRate?: number;
  costAmount?: number;
}

export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface Timesheet {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export type CalendarScope = "user" | "team";

export type CalendarEventType = "ASSIGNMENT" | "MILESTONE" | "DAY_OFF" | "HOLIDAY";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  projectId?: string;
  taskId?: string;
  userId?: string;
  status?: string;
}

export interface UserCalendarResponse {
  scope: CalendarScope;
  owner: User;
  users: User[];
  events: CalendarEvent[];
}

export interface ProjectCalendarResponse {
  project: Project;
  users: User[];
  events: CalendarEvent[];
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

export interface Alert {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface AlertSummary {
  open: number;
  byType: Record<AlertType, number>;
}

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  contextChips: string[];
  lastMessagePreview?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
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

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: ChatMessageRole;
  body: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  messageType?: "TEXT" | "CALL_EVENT";
  payload?: CallEventPayload;
}

export interface CallEventMessage extends ChatMessage {
  messageType: "CALL_EVENT";
  payload: CallEventPayload;
}

export interface TeamChatRoom {
  id: string;
  name: string;
  description?: string;
  topic?: string;
  createdById: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  type?: "GROUP" | "DIRECT";
  participantIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  mentions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatContext {
  generatedAt: string;
  selectedChips: string[];
  user: {
    id: string;
    name: string;
    role: Role;
    email: string;
    location: string;
    timeZone: string;
    title?: string;
    companyId?: string;
    companyName?: string;
  };
  company?: {
    id: string;
    name: string;
    type: CompanyType;
  };
  projects: Array<{
    id: string;
    name: string;
    code: string;
    status: ProjectStatus;
    vendorNames: string[];
    openTasks: number;
    blockedTasks: number;
    activeTasks: number;
    budgetHours: number;
    updatedAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    projectId: string;
    projectName?: string;
    dueDate?: string;
    expectedCompletionDate?: string;
    blockedDays?: number;
    updatedAt: string;
  }>;
  blockedTasks: Array<{
    id: string;
    title: string;
    projectName?: string;
    blockedDays?: number;
    dueDate?: string;
  }>;
  alerts: {
    openCount: number;
    items: Array<{
      id: string;
      type: AlertType;
      message: string;
      projectId?: string;
      userId?: string;
      ageDays: number;
    }>;
  };
  timesheets: {
    recent: Array<{
      id: string;
      weekStart: string;
      weekEnd: string;
      status: TimesheetStatus;
      totalMinutes: number;
      submittedAt?: string;
      approvedAt?: string;
    }>;
  };
  vendors: Array<{
    companyId: string;
    companyName: string;
    activeProjects: number;
    blockedTasks: number;
    contributors: string[];
    timesheetStatuses: Record<string, number>;
  }>;
  schedule?: {
    id: string;
    name: string;
    timeZone: string;
    slots: WorkScheduleSlot[];
  };
  currentWeek: {
    start: string;
    end: string;
  };
}

export interface VendorPerformanceReport {
  vendor: { id: string; name: string };
  range: { from: string; to: string };
  totals: {
    totalMinutes: number;
    hoursLogged: number;
    tasksTouched: number;
    blockedTasks: number;
    onTrackTasks: number;
    averageHoursPerTask: number;
  };
  contributors: Array<{
    userId: string;
    name: string;
    role: Role;
    totalMinutes: number;
    entryCount: number;
  }>;
  tasks: Array<{
    taskId: string;
    title: string;
    status: TaskStatus;
    projectId: string;
    projectName?: string;
    minutesLogged: number;
    lastEntryAt?: string;
    dueDate?: string;
  }>;
}

export type TimesheetSummaryGroup = "user" | "project";

export interface TimesheetSummaryReport {
  range: { from: string; to: string };
  groupBy: TimesheetSummaryGroup;
  totals: {
    totalMinutes: number;
    entryCount: number;
  };
  rows: Array<{
    key: string;
    label: string;
    totalMinutes: number;
    entryCount: number;
    timesheetStatusCounts?: Record<TimesheetStatus, number>;
  }>;
}

export interface UserDirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  title?: string;
  companyId?: string;
  companyName?: string;
  mobileNumber: string;
  country: string;
  city: string;
  timeZone: string;
}

export type DashboardTrendDirection = "up" | "down" | "flat";

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
  type: "pie" | "bar" | "stacked_bar" | "line" | "area" | "radar" | "heatmap";
  categories?: string[];
  series: DashboardChartSeries[];
  summary?: string;
  meta?: Record<string, unknown>;
}

export type DashboardProjectRow = {
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
};

export type DashboardTaskExceptionRow = {
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
  exceptionType: "OVERDUE" | "BLOCKED" | "AT_RISK";
  daysOverdue?: number;
  blockedDays?: number;
  riskLevel?: ProjectRiskLevel;
  updatedAt: string;
};

export type DashboardVendorRow = {
  vendorId: string;
  vendorName: string;
  activeProjects: number;
  hoursLogged: number;
  utilisationPercent: number;
  slaAdherencePercent: number;
  overdueTasks: number;
  blockedTasks: number;
};

export type DashboardAlertRow = {
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
};

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

export interface Release {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  releaseDate?: string;
  status: ReleaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemType {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  projectId?: string;
  workflowSchemeId?: string;
  fieldConfig?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export interface WorkflowScheme {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  createdAt: string;
  updatedAt: string;
}

export type AiProvider = "openai" | "gemini" | "claude" | "local";




