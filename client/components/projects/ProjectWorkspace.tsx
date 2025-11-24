"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import {
  ActivityLog,
  Attachment,
  Company,
  Project,
  ProjectHealth,
  ProjectMetrics,
  ProjectStatus,
  Task,
  TaskPriority,
  TaskStatus,
  User,
  WorkflowScheme
} from "../../lib/types";
import { apiRequest } from "../../lib/apiClient";
import { formatCurrency, formatDate, formatNumber, formatShortDate } from "../../lib/format";
import { Card } from "../ui/Card";
import { ProjectItemForm } from "./ProjectItemForm";
import { ProjectPackageReviewBar } from "./ProjectPackageReviewBar";
import { canEditPackageStage } from "../../lib/projectPackage";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectKanban } from "./ProjectKanban";

const EMPTY_TASKS: Task[] = [];
const EMPTY_COMPANIES: Company[] = [];

type TaskViewMode = "list" | "board";
type TaskGrouping = "STATUS" | "ASSIGNEE" | "VENDOR" | "EPIC";

const TASK_GROUPINGS: TaskGrouping[] = ["STATUS", "ASSIGNEE", "VENDOR", "EPIC"];

const DEFAULT_TASK_STATUSES: { id: string; label: string }[] = [
  { id: "PLANNED", label: "Planned" },
  { id: "BACKLOG", label: "Backlog" },
  { id: "SELECTED", label: "Selected" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "IN_REVIEW", label: "Review" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "DONE", label: "Done" }
];

const TASK_TYPE_TONE: Record<string, "neutral" | "warning" | "success"> = {
  BUG: "warning",
  FEATURE: "success",
  TASK: "neutral"
};

export interface ProjectDetailData {
  project: Project;
  tasks: Task[];
  vendors: Company[];
}

interface ProjectWorkspaceProps {
  detail: ProjectDetailData | null;
  loading: boolean;
  currentUser: User;
  onRefresh: () => Promise<void>;
  onEditProject?: (project: Project) => void;
  onDeleted?: () => void;
  canEdit?: boolean;
  initialOpenTaskForm?: boolean;
  onAutoOpenHandled?: () => void;
}

export function ProjectWorkspace({ detail, loading, currentUser, onRefresh, onEditProject, onDeleted, canEdit = true, initialOpenTaskForm = false, onAutoOpenHandled }: ProjectWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const currentTab = searchParams.get("tab") || "board";

  const [taskGrouping, setTaskGrouping] = useState<TaskGrouping>("STATUS");
  const [taskFilters, setTaskFilters] = useState({
    my: false,
    delayed: false,
    vendor: false,
    critical: false
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkVendor, setBulkVendor] = useState("");
  const [inlineUpdating, setInlineUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [workflowScheme, setWorkflowScheme] = useState<WorkflowScheme | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);

  const tasks = detail?.tasks ?? EMPTY_TASKS;
  const vendors = detail?.vendors ?? EMPTY_COMPANIES;

  const parentTask = useMemo(() => {
    if (!parentTaskId) return null;
    return tasks.find(t => t.id === parentTaskId) || null;
  }, [parentTaskId, tasks]);

  const project = detail?.project ?? null;
  const canEditStage = project ? canEditPackageStage(project, currentUser) : false;
  const canEditTasks = canEdit && (project ? project.packageStatus === "ACTIVE" || canEditStage : false);

  useEffect(() => {
    if (project?.workflowSchemeId) {
      apiRequest<WorkflowScheme>(`/workflow-schemes/${project.workflowSchemeId}`)
        .then((res) => setWorkflowScheme(res))
        .catch((err) => console.error("Failed to load workflow scheme", err));
    }
  }, [project?.workflowSchemeId]);

  const statusColumns = useMemo(() => {
    if (workflowScheme) {
      return workflowScheme.states.sort((a, b) => a.order - b.order).map(s => ({ id: s.id, label: s.name }));
    }
    return DEFAULT_TASK_STATUSES;
  }, [workflowScheme]);

  useEffect(() => {
    if (initialOpenTaskForm && canEditTasks) {
      setItemFormOpen(true);
      onAutoOpenHandled?.();
    }
  }, [initialOpenTaskForm, canEditTasks, onAutoOpenHandled]);

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!project || !confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/projects/${project.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch (error) {
      console.error("Failed to delete project", error);
      alert("Failed to delete project.");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedTaskIds.length || !confirm(`Are you sure you want to delete ${selectedTaskIds.length} tasks?`)) {
      return;
    }
    setDeleting(true);
    try {
      await apiRequest("/tasks/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ taskIds: selectedTaskIds })
      });
      setSelectedTaskIds([]);
      await onRefresh();
    } catch (error) {
      console.error("Failed to delete tasks", error);
      alert("Failed to delete tasks.");
    } finally {
      setDeleting(false);
    }
  };

  const loadAttachments = useCallback(
    async (projectId: string) => {
      setLoadingAttachments(true);
      try {
        const response = await apiRequest<{ attachments: Attachment[] }>(
          `/attachments?entityType=PROJECT&entityId=${projectId}`
        );
        setAttachments(response.attachments ?? []);
      } catch (error) {
        console.error("Failed to load attachments", error);
        setAttachments([]);
      } finally {
        setLoadingAttachments(false);
      }
    },
    []
  );

  const loadActivity = useCallback(
    async (projectId: string) => {
      setLoadingActivity(true);
      try {
        const response = await apiRequest<{ activity: ActivityLog[] }>(
          `/activity?entityType=PROJECT&entityId=${projectId}&limit=50`
        );
        setActivity(response.activity ?? []);
      } catch (error) {
        console.error("Failed to load activity", error);
        setActivity([]);
      } finally {
        setLoadingActivity(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!detail?.project.id) {
      return;
    }
    if (currentTab === "files") {
      void loadAttachments(detail.project.id);
    }
    if (currentTab === "activity") {
      void loadActivity(detail.project.id);
    }
  }, [detail?.project.id, currentTab, loadAttachments, loadActivity]);

  useEffect(() => {
    setSelectedTaskIds([]);
  }, [detail?.tasks]);

  const { topLevelTasks, subtasksMap } = useMemo(() => {
    const top: Task[] = [];
    const subs = new Map<string, Task[]>();
    
    tasks.forEach(task => {
      if (task.parentId) {
        const current = subs.get(task.parentId) || [];
        current.push(task);
        subs.set(task.parentId, current);
      } else {
        top.push(task);
      }
    });
    
    return { topLevelTasks: top, subtasksMap: subs };
  }, [tasks]);

  const hasAnyTask = tasks.length > 0;
  const hasAssignedDeveloper = tasks.some((task) => Boolean(task.assigneeUserId));
  const hasCompletedTask = tasks.some((task) => task.status === "DONE");
  const teamMembers = useMemo(() => (project ? buildTeamMembers(project) : []), [project]);
  const filteredTasks = useMemo(
    () => filterTasks(topLevelTasks, taskFilters, currentUser.id),
    [topLevelTasks, taskFilters, currentUser.id]
  );
  const groupedTasks = useMemo(
    () => groupTasks(filteredTasks, taskGrouping),
    [filteredTasks, taskGrouping]
  );

  useEffect(() => {
    if (!project) return;
    if (canEditTasks) {
      return;
    }
    setItemFormOpen(false);
    setParentTaskId(null);
    setSelectedTaskIds([]);
    setBulkStatus("");
    setBulkAssignee("");
    setBulkVendor("");
  }, [project, canEditTasks]);

  const handleAddSubtask = (parentId: string) => {
    setParentTaskId(parentId);
    setItemFormOpen(true);
  };

  if (loading) {
    return <Card className="text-sm text-ink-500">Loading project details...</Card>;
  }

  if (!detail || !project) {
    return <Card className="text-sm text-ink-500">Select a project from the list to see its workflow and tasks.</Card>;
  }
  const canCreateTasks = currentUser.role === "PM";

  return (
    <div className="flex h-full flex-col space-y-6">
      <ProjectHeader 
        project={project} 
        currentUser={currentUser}
        onEdit={() => onEditProject?.(project)}
        onDelete={handleDelete}
      />

      <ProjectPackageReviewBar 
        project={project} 
        currentUser={currentUser}
        onActionComplete={onRefresh}
        hasTasks={hasAnyTask}
        hasAssignedDeveloper={hasAssignedDeveloper}
        hasCompletedTask={hasCompletedTask}
      />

      <div className="flex items-center border-b border-ink-100">
        <nav className="-mb-px flex space-x-6">
          {["board", "list", "files", "activity"].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${
                  currentTab === tab
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700"
                }
              `}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1">
        {currentTab === "board" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Filters could go here */}
              </div>
              {canCreateTasks && (
                <Button type="button" onClick={() => setItemFormOpen(true)} disabled={!canEditTasks}>
                  + New Task
                </Button>
              )}
            </div>
            <ProjectKanban
              tasks={filteredTasks}
              subtasksMap={subtasksMap}
              teamMembers={teamMembers}
              columns={statusColumns}
              onTaskClick={(taskId) => router.push(`/tasks/${taskId}`)}
              onStatusChange={async (taskId, newStatus) => {
                await updateTaskField(taskId, { status: newStatus }, setInlineUpdating, onRefresh);
              }}
              onAddSubtask={handleAddSubtask}
            />
          </div>
        )}

        {currentTab === "list" && (
          <div className="space-y-4">
             <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 {/* Filters */}
                 {selectedTaskIds.length > 0 && (currentUser.role === "PM" || currentUser.role === "PROJECT_MANAGER" || currentUser.id === project.ownerId) && (
                   <Button type="button" variant="ghost" onClick={handleBulkDelete} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                     Delete Selected ({selectedTaskIds.length})
                   </Button>
                 )}
              </div>
              {canCreateTasks && (
                <Button type="button" onClick={() => setItemFormOpen(true)} disabled={!canEditTasks}>
                  + New Task
                </Button>
              )}
            </div>
            <TaskList
              tasks={filteredTasks}
              subtasksMap={subtasksMap}
              groupedTasks={groupedTasks}
              grouping={taskGrouping}
              selectedTaskIds={selectedTaskIds}
              onSelectionChange={setSelectedTaskIds}
              teamMembers={teamMembers}
              inlineUpdating={inlineUpdating}
              setInlineUpdating={setInlineUpdating}
              onTasksUpdated={onRefresh}
              canEdit={canEditTasks}
              statusColumns={statusColumns}
              onAddSubtask={handleAddSubtask}
            />
          </div>
        )}

        {currentTab === "files" && (
          <Card>
            {loadingAttachments ? (
              <p className="text-sm text-ink-500">Loading files...</p>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-ink-500">No files uploaded for this project.</p>
            ) : (
              <ul className="space-y-2 text-sm text-ink-700">
                {attachments.map((file) => (
                  <li key={file.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                    <span>{file.originalName}</span>
                    <a className="text-brand-600 hover:underline" href={file.url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {currentTab === "activity" && (
          <Card>
            {loadingActivity ? (
              <p className="text-sm text-ink-500">Loading history...</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-ink-500">No audit log entries yet.</p>
            ) : (
              <ul className="space-y-3 text-sm text-ink-700">
                {activity.map((entry) => (
                  <li key={entry.id} className="border-b border-ink-50 pb-3 last:border-0">
                    <p className="font-medium text-ink-900">{entry.message}</p>
                    <p className="text-xs text-ink-400">
                      {formatDate(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <ProjectItemForm
        open={itemFormOpen}
        onClose={() => {
          setItemFormOpen(false);
          setParentTaskId(null);
        }}
        projectId={project.id}
        team={teamMembers}
        onCreated={async () => {
          setItemFormOpen(false);
          setParentTaskId(null);
          await onRefresh();
        }}
        parentId={parentTaskId}
        parentTask={parentTask}
      />
    </div>
  );
}

// Helper components and functions

function TaskList(props: {
  tasks: Task[];
  subtasksMap: Map<string, Task[]>;
  groupedTasks: Record<string, Task[]>;
  grouping: TaskGrouping;
  selectedTaskIds: string[];
  onSelectionChange: (ids: string[]) => void;
  teamMembers: User[];
  inlineUpdating: string | null;
  setInlineUpdating: (value: string | null) => void;
  onTasksUpdated: () => Promise<void>;
  canEdit: boolean;
  statusColumns: { id: string; label: string }[];
  onAddSubtask: (parentId: string) => void;
}) {
  const {
    tasks,
    subtasksMap,
    groupedTasks,
    grouping,
    selectedTaskIds,
    onSelectionChange,
    teamMembers,
    inlineUpdating,
    setInlineUpdating,
    onTasksUpdated,
    canEdit,
    statusColumns,
    onAddSubtask
  } = props;
  const assigneeOptions = teamMembers.map((member) => ({
    value: member.id,
    label: member.profile ? `${member.profile.firstName} ${member.profile.lastName}` : member.email
  }));
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    // Fetch all users to ensure we can display names for anyone assigned
    apiRequest<{ users: User[] }>("/users").then(res => {
       if (res.users) setAllUsers(res.users);
    }).catch(err => console.error("Failed to load users", err));
  }, []);

  const memberLookup = useMemo(() => {
    const map = new Map(teamMembers.map((member) => [member.id, member.profile ? `${member.profile.firstName} ${member.profile.lastName}` : member.email]));
    allUsers.forEach(user => {
      if (!map.has(user.id) && user.profile) {
        map.set(user.id, `${user.profile.firstName} ${user.profile.lastName}`);
      } else if (!map.has(user.id)) {
        map.set(user.id, user.email);
      }
    });
    return map;
  }, [teamMembers, allUsers]);

  const handleCheckbox = (taskId: string) => {
    if (!canEdit) {
      return;
    }
    if (selectedTaskIds.includes(taskId)) {
      onSelectionChange(selectedTaskIds.filter((id) => id !== taskId));
    } else {
      onSelectionChange([...selectedTaskIds, taskId]);
    }
  };

  const groupingLabels: Record<TaskGrouping, (key: string) => string> = {
    STATUS: (key) => humanize(key),
    ASSIGNEE: (key) => (key === "UNASSIGNED" ? "Unassigned" : assigneeOptions.find((option) => option.value === key)?.label ?? "Unknown"),
    VENDOR: (key) => {
      if (key === "INTERNAL") {
        return "Assigned Team";
      }
      if (key === "UNASSIGNED") {
        return "Vendor TBD";
      }
      return key || "Vendor TBD";
    },
    EPIC: (key) => key || "No Epic"
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100">
      {Object.entries(groupedTasks).map(([key, items]) => (
        <div key={key}>
          <div className="bg-ink-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {groupingLabels[grouping](key)}
          </div>
          <table className="min-w-full divide-y divide-ink-100 text-xs">
            <thead className="bg-white text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
                    checked={items.every((item) => selectedTaskIds.includes(item.id))}
                    disabled={!canEdit}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const merged = new Set([...selectedTaskIds, ...items.map((item) => item.id)]);
                        onSelectionChange(Array.from(merged));
                      } else {
                        const remaining = selectedTaskIds.filter((id) => !items.some((item) => item.id === id));
                        onSelectionChange(remaining);
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-1.5">Task</th>
                <th className="px-3 py-1.5">Schedule</th>
                <th className="px-3 py-1.5">Assigned team (ENG)</th>
                <th className="px-3 py-1.5">Effort</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white text-ink-700">
              {items.map((task) => (
                <Fragment key={task.id}>
                <tr key={task.id} className={task.status === "DONE" ? "bg-emerald-50" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
                      checked={selectedTaskIds.includes(task.id)}
                      disabled={!canEdit}
                      onChange={() => handleCheckbox(task.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink-900">{task.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
                      <Badge tone={TASK_TYPE_TONE[task.itemType]} label={humanize(task.itemType)} />
                      <span>{humanize(task.priority)} priority</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs font-semibold text-ink-900">{task.sprint ?? "Auto"}</p>
                    <p className="text-[10px] text-ink-500">{formatSchedule(task.plannedStartDate, task.dueDate)}</p>
                  </td>
                    <td className="px-3 py-2">
                    {task.assignmentPlan?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {task.assignmentPlan.map((entry) => (
                          <span
                            key={`${task.id}-${entry.userId}`}
                            className="inline-flex items-center rounded-full bg-ink-50 px-2 py-0.5 text-[10px] text-ink-600"
                          >
                            {memberLookup.get(entry.userId) ?? "Unknown User"} {entry.hours > 0 && `${formatNumber(entry.hours)}h`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-ink-400">No core team assigned</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs font-semibold text-ink-900">
                      {formatNumber(task.estimationHours ?? task.budgetHours)}h
                    </p>
                    <p className="text-[10px] text-ink-500">
                      {task.costAmount != null ? formatCurrency(task.costAmount) : "Cost pending"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={task.status}
                      disabled={inlineUpdating === task.id || !canEdit}
                      onChange={(e) =>
                        void updateTaskField(task.id, { status: e.target.value as TaskStatus }, setInlineUpdating, onTasksUpdated)
                      }
                      className={`text-xs py-1 ${task.status === "DONE" ? "text-emerald-700 font-medium" : ""}`}
                    >
                      {statusColumns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddSubtask(task.id);
                        }}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-1.5 py-0.5 rounded"
                        title="Add subtask"
                      >
                        + Subtask
                      </button>
                      <a
                        href={`/tasks/${task.id}`}
                        className="text-xs font-semibold text-brand-600 hover:underline"
                      >
                        View
                      </a>
                    </div>
                  </td>
                </tr>
                {subtasksMap.get(task.id)?.map(subtask => (
                  <tr key={subtask.id} className={subtask.status === "DONE" ? "bg-emerald-50" : "bg-gray-50/50"}>
                    <td className="px-3 py-2">
                       <div className="flex justify-end pr-2">
                         <div className="w-3 h-3 border-l-2 border-b-2 border-gray-300 rounded-bl-sm"></div>
                       </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-ink-700 text-xs">{subtask.title}</div>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
                        <Badge tone={TASK_TYPE_TONE[subtask.itemType]} label={humanize(subtask.itemType)} />
                        <span>{humanize(subtask.priority)} priority</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                       <p className="text-[10px] text-ink-500">{formatSchedule(subtask.plannedStartDate, subtask.dueDate)}</p>
                    </td>
                    <td className="px-3 py-2">
                       {subtask.assignmentPlan?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {subtask.assignmentPlan.map((entry) => (
                              <span
                                key={`${subtask.id}-${entry.userId}`}
                                className="inline-flex items-center rounded-full bg-ink-50 px-2 py-0.5 text-[10px] text-ink-600"
                              >
                                {memberLookup.get(entry.userId) ?? "Unknown User"} {entry.hours > 0 && `${formatNumber(entry.hours)}h`}
                              </span>
                            ))}
                          </div>
                       ) : subtask.assigneeUserId ? (
                          <span className="text-[10px] text-ink-600">{memberLookup.get(subtask.assigneeUserId) ?? "Unknown User"}</span>
                       ) : <span className="text-[10px] text-ink-400">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2">
                       <p className="text-[10px] text-ink-500">{formatNumber(subtask.estimationHours ?? subtask.budgetHours)}h</p>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={subtask.status}
                        disabled={inlineUpdating === subtask.id || !canEdit}
                        onChange={(e) =>
                          void updateTaskField(subtask.id, { status: e.target.value as TaskStatus }, setInlineUpdating, onTasksUpdated)
                        }
                        className={`text-xs py-1 h-auto ${subtask.status === "DONE" ? "text-emerald-700 font-medium" : ""}`}
                      >
                        {statusColumns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={`/tasks/${subtask.id}`}
                        className="text-[10px] font-semibold text-brand-600 hover:underline"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!tasks.length && <p className="px-4 py-6 text-center text-sm text-ink-500">No tasks match the filters.</p>}
    </div>
  );
}

async function updateTaskField(
  taskId: string,
  payload: Partial<Pick<Task, "status" | "assigneeUserId" | "dueDate">>,
  setInlineUpdating: (value: string | null) => void,
  onRefresh: () => Promise<void>
) {
  try {
    setInlineUpdating(taskId);
    await apiRequest(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await onRefresh();
  } catch (error) {
    console.error("Task update failed", error);
    const apiError = error as { message?: string };
    alert(`Failed to update task: ${apiError?.message || 'Unknown error'}. Please check your permissions.`);
  } finally {
    setInlineUpdating(null);
  }
}

async function bulkUpdateSelectedTasks(
  taskIds: string[],
  changes: { status?: TaskStatus; assigneeUserId?: string; vendorId?: string },
  setInlineUpdating: (value: string | null) => void,
  onRefresh: () => Promise<void>
) {
  if (!taskIds.length) {
    return;
  }
  if (!changes.status && !changes.assigneeUserId && !changes.vendorId) {
    return;
  }
  try {
    setInlineUpdating("bulk");
    await apiRequest("/tasks/bulk-update", {
      method: "POST",
      body: JSON.stringify({
        taskIds,
        status: changes.status,
        assigneeUserId: changes.assigneeUserId,
        vendorId: changes.vendorId
      })
    });
    await onRefresh();
  } catch (error) {
    console.error("Bulk update failed", error);
    const apiError = error as { message?: string };
    alert(`Failed to bulk update tasks: ${apiError?.message || 'Unknown error'}. Please check your permissions.`);
  } finally {
    setInlineUpdating(null);
  }
}

function buildTeamMembers(project: Project): User[] {
  const roster: User[] = [];
  const seen = new Set<string>();
  const addMember = (member?: User | null) => {
    if (!member || seen.has(member.id)) {
      return;
    }
    seen.add(member.id);
    roster.push(member);
  };
  addMember(project.owner);
  addMember(project.deliveryManager);
  addMember(project.sponsor);
  project.coreTeamMembers?.forEach(addMember);
  project.stakeholderMembers?.forEach(addMember);
  return roster;
}

function formatUser(user?: User | null): string | null {
  if (!user) {
    return null;
  }
  return user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
}

function formatRange(start?: string | Date | null, end?: string | Date | null): string {
  const startDate = normalizeDateInput(start);
  const endDate = normalizeDateInput(end);
  if (!startDate && !endDate) {
    return "Not scheduled";
  }
  if (startDate && !endDate) {
    return `${formatShortDate(startDate)} ? TBD`;
  }
  if (!startDate && endDate) {
    return `TBD ? ${formatShortDate(endDate)}`;
  }
  return `${formatShortDate(startDate)} ? ${formatShortDate(endDate)}`;
}

function formatSchedule(start?: string | null, end?: string | null): string {
  const startDate = normalizeDateInput(start);
  const endDate = normalizeDateInput(end);
  if (!startDate && !endDate) {
    return "No dates";
  }
  return formatRange(startDate ?? undefined, endDate ?? undefined);
}

function normalizeDateInput(value?: string | Date | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function humanize(value?: string | null) {
  if (!value) {
    return "Not set";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filterTasks(
  tasks: Task[],
  filters: { my: boolean; delayed: boolean; vendor: boolean; critical: boolean },
  currentUserId: string
): Task[] {
  return tasks.filter((task) => {
    if (filters.my) {
      const owned =
        task.assigneeUserId === currentUserId || task.assignmentPlan?.some((assignment) => assignment.userId === currentUserId);
      if (!owned) {
        return false;
      }
    }
    if (filters.delayed) {
      const dueDate = normalizeDateInput(task.dueDate);
      if (!dueDate || dueDate.getTime() >= Date.now() || task.status === "DONE") {
        return false;
      }
    }
    if (filters.vendor && !task.isVendorTask) {
      return false;
    }
    if (filters.critical && task.priority !== "CRITICAL") {
      return false;
    }
    return true;
  });
}

function groupTasks(tasks: Task[], grouping: TaskGrouping): Record<string, Task[]> {
  return tasks.reduce((acc, task) => {
    let key = "";
    switch (grouping) {
      case "ASSIGNEE":
        key = task.assigneeUserId ?? "UNASSIGNED";
        break;
      case "VENDOR":
        key = task.isVendorTask ? task.vendorId ?? "UNASSIGNED" : "INTERNAL";
        break;
      case "EPIC":
        key = task.epicId ?? "NO_EPIC";
        break;
      case "STATUS":
      default:
        key = task.status;
        break;
    }
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(task);
    return acc;
  }, {} as Record<string, Task[]>);
}
