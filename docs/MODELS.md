# Models

- **Roles:** `SUPER_ADMIN`, `VP`, `PM`, `ENGINEER`, `PROJECT_MANAGER`, `DEVELOPER`, `VIEWER`
- **Profile (required):** `firstName`, `lastName`, `country (ISO-2)`, `city (1..64)`, `timeZone (IANA)`, `title (1..64)`
- **User:** `{ id, email, passwordHash, role, profile, companyId?, isActive, profileStatus ("ACTIVE" | "PENDING_APPROVAL" | "REJECTED"), profileComment?, createdAt, updatedAt }`
- **Company:** `{ id, name, type ("HUMAIN" | "VENDOR"), description?, isActive, createdAt, updatedAt }`
- **UserInvitation:** `{ id, email, firstName, lastName, role, companyId?, invitedById, token, status ("SENT" | "ACCEPTED" | "EXPIRED"), acceptedUserId?, createdAt, updatedAt }`
- **ProfileChangeRequest:** `{ id, userId, requestedById, profile, status ("PENDING" | "APPROVED" | "REJECTED"), reviewedById?, reviewedAt?, decisionComment?, createdAt, updatedAt }`
- **Notification:** `{ id, userId, message, type, read, metadata?, timestamps }`
- **ActivityLog:** `{ id, actorId, action, message, entityId?, entityType?, metadata?, timestamps }`
- **Project:** `{ id, name, code, description?, ownerId, vendorCompanyIds[], budgetHours, status ("PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED"), startDate?, endDate?, timestamps }`
- **Task:** `{ id, projectId, title, description?, createdById, status ("BACKLOG" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "READY_TO_START"), budgetHours, dueDate?, requiredSkills[], estimation?, plannedStartDate?, expectedCompletionDate?, workflowInstanceId?, timestamps }`
- **TaskComment:** `{ id, taskId, authorId, body, timestamps }`
- **Assignment:** `{ id, taskId, developerId, requestedById, requestedMessage?, status ("PENDING" | "APPROVED" | "CANCELLED" | "COMPLETED"), approvedById?, approvedAt?, canceledById?, canceledAt?, cancelReason?, completionNote?, completedAt?, timestamps }`
- **WorkflowDefinition:** `{ id, entityType ("TASK"), name, description?, isActive, steps[{ id, name, description?, order, assigneeRole, approverType ("ROLE" | "DYNAMIC"), approverRole?, dynamicApproverType?, requiresCommentOnReject, requiresCommentOnSendBack, actions[] }], timestamps }`
- **WorkflowInstance:** `{ id, definitionId, entityId, entityType, status ("NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CHANGES_REQUESTED"), steps[{ stepId, name, assigneeRole, approverType, approverRole?, dynamicApproverType?, requiresCommentOnReject, requiresCommentOnSendBack, status, actedById?, actedAt?, action?, comment? }], currentStepId?, timestamps }`
- **WorkflowAction:** `{ id, instanceId, stepId, actorId, action ("APPROVE" | "REJECT" | "SEND_BACK" | "REQUEST_CHANGE"), comment?, metadata?, timestamps }`
- **WorkSchedule:** `{ id, name, timeZone, companyId?, userId?, slots[{ day (0-6), start, end }], timestamps }`
- **CompanyHoliday:** `{ id, companyId?, name, date, timestamps }`
- **DayOff:** `{ id, userId, requestedById, date, reason?, status ("PENDING" | "APPROVED" | "REJECTED"), approvedById?, approvedAt?, decisionComment?, timestamps }`
- **AttendanceRecord:** `{ id, userId, date, clockIn, clockOut?, minutesWorked?, status ("OPEN" | "COMPLETED"), outOfSchedule, timestamps }`
- **TimeEntry:** `{ id, userId, projectId, taskId, date, minutes, startedAt, endedAt, note?, source ("MANUAL"), outOfSchedule, timestamps }`

