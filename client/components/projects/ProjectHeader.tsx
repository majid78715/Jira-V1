"use client";

import { Project, User } from "../../lib/types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

interface ProjectHeaderProps {
  project: Project;
  currentUser: User;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectHeader({ project, currentUser, onEdit, onDelete }: ProjectHeaderProps) {
  const canDelete =
    currentUser.role === "SUPER_ADMIN" ||
    currentUser.role === "VP" ||
    currentUser.role === "PM" ||
    currentUser.id === project.ownerId;

  return (
    <div className="mb-2 flex items-start justify-between border-b border-gray-100 pb-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
          <Badge tone={project.status === "ACTIVE" ? "success" : "neutral"} label={project.status} />
        </div>
        <p className="text-xs text-gray-500 max-w-2xl">{project.description || "No description provided."}</p>
        
        <div className="flex items-center gap-4 pt-1">
           <div className="flex items-center gap-1.5 text-xs text-gray-600">
             <span className="font-medium">Lead:</span>
             <div className="flex items-center gap-1">
               {project.owner ? (
                 <>
                   <div className="h-4 w-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px]">
                     {project.owner.profile.firstName[0]}
                   </div>
                   <span>{project.owner.profile.firstName} {project.owner.profile.lastName}</span>
                 </>
               ) : (
                 <span>Unassigned</span>
               )}
             </div>
           </div>
           <div className="flex items-center gap-1.5 text-xs text-gray-600">
             <span className="font-medium">Due:</span>
             <span>{project.endDate ? new Date(project.endDate).toLocaleDateString() : "TBD"}</span>
           </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5 mr-2">
          {/* Team Avatars Preview */}
          {project.coreTeamMembers?.slice(0, 4).map((member) => (
             <div key={member.id} className="h-6 w-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[9px] font-medium text-gray-600" title={`${member.profile.firstName}`}>
               {member.profile.firstName[0]}
             </div>
          ))}
          {(project.coreTeamMembers?.length || 0) > 4 && (
            <div className="h-6 w-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[9px] font-medium text-gray-500">
              +{project.coreTeamMembers!.length - 4}
            </div>
          )}
        </div>

        {canDelete && (
          <Button variant="ghost" onClick={onDelete} size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700">
            Delete Project
          </Button>
        )}
      </div>
    </div>
  );
}
