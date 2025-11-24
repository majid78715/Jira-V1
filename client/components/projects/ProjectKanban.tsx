"use client";

import { useMemo, useState, useEffect } from "react";
import { Task, User, TaskStatus, TaskPriority } from "../../lib/types";
import { Badge } from "../ui/Badge";
import { formatShortDate } from "../../lib/format";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";

interface ProjectKanbanProps {
  tasks: Task[];
  subtasksMap: Map<string, Task[]>;
  teamMembers: User[];
  columns: { id: string; label: string }[];
  onTaskClick: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onAddSubtask: (parentId: string) => void;
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.5",
      },
    },
  }),
};

export function ProjectKanban({ tasks, subtasksMap, teamMembers, columns, onTaskClick, onStatusChange, onAddSubtask }: ProjectKanbanProps) {
  const [items, setItems] = useState<Record<string, Task[]>>({});
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const groups: Record<string, Task[]> = {};
    columns.forEach(col => groups[col.id] = []);
    tasks.forEach(task => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      } else {
        if (columns.length > 0) {
          groups[columns[0].id].push(task);
        }
      }
    });
    setItems(groups);
  }, [tasks, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const findContainer = (id: UniqueIdentifier) => {
    if (id in items) {
      return id;
    }
    return Object.keys(items).find((key) => items[key].find((item) => item.id === id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over?.id;

    if (overId == null || active.id === overId) {
      return;
    }

    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((item) => item.id === active.id);
      const overIndex = overItems.findIndex((item) => item.id === overId);

      let newIndex;
      if (overId in prev) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;

        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return {
        ...prev,
        [activeContainer]: [
          ...prev[activeContainer].filter((item) => item.id !== active.id),
        ],
        [overContainer]: [
          ...prev[overContainer].slice(0, newIndex),
          activeItems[activeIndex],
          ...prev[overContainer].slice(newIndex, prev[overContainer].length),
        ],
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeContainer = findContainer(active.id);
    const overContainer = over ? findContainer(over.id) : null;

    if (
      activeContainer &&
      overContainer &&
      activeContainer !== overContainer
    ) {
        const task = items[overContainer].find(t => t.id === active.id);
        if (task) {
            onStatusChange(task.id, overContainer as TaskStatus);
        }
    }

    setActiveId(null);
  };

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-4 gap-3 h-full pb-2 overflow-x-auto">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col min-w-[250px]">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</h3>
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {items[col.id]?.length || 0}
              </span>
            </div>
            
            <div className="flex-1 space-y-2 min-h-[100px]">
              <SortableContext
                id={col.id}
                items={items[col.id]?.map(t => t.id) || []}
                strategy={verticalListSortingStrategy}
              >
                {items[col.id]?.map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    subtasks={subtasksMap.get(task.id) || []}
                    teamMembers={teamMembers}
                    columns={columns}
                    onTaskClick={onTaskClick}
                    onStatusChange={onStatusChange}
                    onAddSubtask={onAddSubtask}
                    getAssigneeAvatar={getAssigneeAvatar}
                  />
                ))}
              </SortableContext>
              {items[col.id]?.length === 0 && (
                 <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-gray-100 bg-gray-50/50 text-[10px] text-gray-400">
                   No tasks
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {mounted && createPortal(
        <DragOverlay dropAnimation={dropAnimation}>
          {activeId ? (
             <TaskCard 
                task={Object.values(items).flat().find(t => t.id === activeId)!} 
                subtasks={subtasksMap.get(activeId as string) || []}
                teamMembers={teamMembers}
                columns={columns}
                onTaskClick={() => {}}
                onStatusChange={async () => {}}
                onAddSubtask={() => {}}
                getAssigneeAvatar={getAssigneeAvatar}
                isOverlay
             />
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}

function SortableTask({ task, subtasks, teamMembers, columns, onTaskClick, onStatusChange, onAddSubtask, getAssigneeAvatar }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "Task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard 
        task={task} 
        subtasks={subtasks} 
        teamMembers={teamMembers} 
        columns={columns} 
        onTaskClick={onTaskClick} 
        onStatusChange={onStatusChange} 
        onAddSubtask={onAddSubtask}
        getAssigneeAvatar={getAssigneeAvatar}
      />
    </div>
  );
}

function TaskCard({ task, subtasks, teamMembers, columns, onTaskClick, onStatusChange, onAddSubtask, getAssigneeAvatar, isOverlay }: any) {
  return (
    <div
      onClick={() => onTaskClick(task.id)}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-md border transition-all hover:shadow-md hover:border-brand-300 active:scale-[0.98] ${
        isOverlay ? 'cursor-grabbing shadow-xl rotate-2' : ''
      } ${
        task.status === 'DONE' 
          ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
          : 'bg-white border-gray-200 shadow-sm'
      }`}
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
        
        {!isOverlay && (
          <select
            className="h-5 max-w-[60px] rounded border-none bg-transparent p-0 text-[10px] text-gray-400 opacity-0 hover:bg-gray-50 group-hover:opacity-100 focus:opacity-100 focus:ring-0"
            value={task.status} 
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              void onStatusChange(task.id, e.target.value as TaskStatus);
            }}
          >
            {columns.map((c: any) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}

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

      {subtasks && subtasks.length > 0 && (
        <div className="mt-1 space-y-1">
          {subtasks.map((subtask: any) => (
            <div 
              key={subtask.id} 
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick(subtask.id);
              }}
              className={`flex items-center justify-between text-[10px] p-1.5 rounded hover:bg-opacity-80 transition-colors ${
                subtask.status === 'DONE' ? 'bg-emerald-100/50' : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-1.5 overflow-hidden">
                  <div className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0"></div>
                  <span className="truncate text-gray-600">{subtask.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {subtask.assigneeUserId && (
                    <div className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[6px] text-gray-600">
                      {teamMembers.find((u: any) => u.id === subtask.assigneeUserId)?.profile.firstName[0]}
                    </div>
                )}
                <select
                  className={`h-4 w-auto rounded border-0 bg-transparent py-0 pl-0 pr-4 text-[9px] font-medium focus:ring-0 cursor-pointer ${
                    subtask.status === 'DONE' ? 'text-emerald-700' : 'text-gray-500'
                  }`}
                  value={subtask.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    void onStatusChange(subtask.id, e.target.value as TaskStatus);
                  }}
                >
                  {columns.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
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
