"use client";

import { useMemo } from "react";
import { Task, User, TaskStatus, TaskPriority } from "../../lib/types";
import { Badge } from "../ui/Badge";
import { formatShortDate } from "../../lib/format";

interface ProjectKanbanProps {
  tasks: Task[];
  subtasksMap: Map<string, Task[]>;
  teamMembers: User[];
  columns: { id: string; label: string }[];
  onTaskClick: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onAddSubtask: (parentId: string) => void;
}

export function ProjectKanban({ tasks, subtasksMap, teamMembers, columns, onTaskClick, onStatusChange, onAddSubtask }: ProjectKanbanProps) {
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    columns.forEach(col => groups[col.id] = []);
    tasks.forEach(task => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      } else {
        // Fallback: add to first column if status not found
        if (columns.length > 0) {
          groups[columns[0].id].push(task);
        }
      }
    });
    return groups;
  }, [tasks, columns]);

  const getAssigneeAvatar = (userId?: string) => {
    if (!userId) return null;
    const user = teamMembers.find(u => u.id === userId);
    if (!user) return null;
    return (
      <div className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[9px] font-bold border border-white ring-1 ring-gray-100" title={`${user.profile.firstName} ${user.profile.lastName}`}>
        {user.profile.firstName[0]}{user.profile.lastName[0]}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-4 gap-3 h-full pb-2 overflow-x-auto">
      {columns.map((col) => (
        <div key={col.id} className="flex flex-col min-w-[250px]">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</h3>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {groupedTasks[col.id]?.length || 0}
            </span>
          </div>
          
          <div className="flex-1 space-y-2 min-h-[100px]">
            {groupedTasks[col.id]?.map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="group relative flex cursor-pointer flex-col gap-2 rounded-md border border-gray-200 bg-white p-2.5 shadow-sm transition-all hover:shadow-md hover:border-brand-300 active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="text-xs font-medium text-gray-900 line-clamp-2 leading-snug">
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <PriorityIcon priority={task.priority} />
                    <span className="text-[10px] text-gray-500">#{task.id.slice(0,4)}</span>
                  </div>
                  
                  <select
                    className="h-5 max-w-[60px] rounded border-none bg-transparent p-0 text-[10px] text-gray-400 opacity-0 hover:bg-gray-50 group-hover:opacity-100 focus:opacity-100 focus:ring-0"
                    value={col.id} 
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      void onStatusChange(task.id, e.target.value as TaskStatus);
                    }}
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>

                  {task.assigneeUserId ? (
                    getAssigneeAvatar(task.assigneeUserId)
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[9px]">
                      ?
                    </div>
                  )}
                </div>
                
                {task.dueDate && (
                   <div className={`text-[10px] mt-0.5 ${new Date(task.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                     {new Date(task.dueDate) < new Date() ? 'Overdue: ' : ''}{formatShortDate(task.dueDate)}
                   </div>
                )}

                <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       onAddSubtask(task.id);
                     }}
                     className="text-[10px] font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-1.5 py-0.5 rounded flex items-center gap-1"
                   >
                     <span>+</span> Subtask
                   </button>
                </div>

                {subtasksMap.get(task.id) && subtasksMap.get(task.id)!.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {subtasksMap.get(task.id)!.map(subtask => (
                      <div 
                        key={subtask.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(subtask.id);
                        }}
                        className="flex items-center justify-between text-[10px] bg-gray-50 p-1.5 rounded hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                           <div className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0"></div>
                           <span className="truncate text-gray-600">{subtask.title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {subtask.assigneeUserId && (
                             <div className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[6px] text-gray-600">
                               {teamMembers.find(u => u.id === subtask.assigneeUserId)?.profile.firstName[0]}
                             </div>
                          )}
                          <span className={`text-[9px] px-1 rounded ${subtask.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                            {columns.find(c => c.id === subtask.status)?.label || subtask.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {groupedTasks[col.id]?.length === 0 && (
               <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-gray-100 bg-gray-50/50 text-[10px] text-gray-400">
                 No tasks
               </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriorityIcon({ priority }: { priority: TaskPriority }) {
  const colors = {
    CRITICAL: "text-red-600",
    HIGH: "text-orange-500",
    MEDIUM: "text-yellow-500",
    LOW: "text-blue-400",
  };
  
  return (
    <svg className={`h-3 w-3 ${colors[priority] || 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
