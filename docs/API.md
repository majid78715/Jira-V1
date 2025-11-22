# API Notes

- GET /api/health -> { "ok": true }
- Auth:
  - POST /api/auth/login (set sa_session)
  - GET /api/auth/me
  - POST /api/auth/accept-invitation { token, password, profile }
- Admin + companies:
  - POST /api/admin/users
  - PATCH /api/admin/users/:id
  - GET /api/companies, POST /api/companies, PATCH /api/companies/:id
- Invitations & onboarding:
  - POST /api/invitations/project-manager (PM) { email, firstName, lastName, companyId }
  - POST /api/invitations/developer (PROJECT_MANAGER) { email, firstName, lastName }
  - GET /api/team/project-managers (PM/SUPER_ADMIN) and /api/team/developers (PROJECT_MANAGER) -> { users, invitations }
  - POST /api/team/project-managers (SUPER_ADMIN) -> direct vendor contact creation with profile + assigned company
  - GET /api/team/vps (SUPER_ADMIN) -> VP directory for admin pickers
  - GET /api/team/product-managers + PATCH/DELETE /api/team/product-managers/:id (SUPER_ADMIN) -> roster management, edits, deactivation
- Approvals:
  - GET /api/users/pending-profiles
  - POST /api/users/:id/approve-profile / .../reject-profile (PM)
- Profile change requests:
  - POST /api/profile-change-requests (PROJECT_MANAGER/DEVELOPER)
  - POST /api/users/me/profile (SUPER_ADMIN/PM/VP)
  - GET /api/profile-change-requests (PM)
  - POST /api/profile-change-requests/:id/approve / .../reject (PM)
- Projects & tasks:
  - GET /api/projects, POST /api/projects, PATCH /api/projects/:id
  - GET /api/projects/:id -> { project, tasks, vendors }
  - GET /api/projects/:projectId/tasks, POST /api/projects/:projectId/tasks
  - GET /api/tasks/:taskId, PATCH /api/tasks/:taskId, POST /api/tasks/:taskId/comments
- Assignments:
  - GET /api/assignments (scope auto based on role, or ?scope=pending|all)
  - POST /api/assignments (PM/PROJECT_MANAGER) { taskId, developerId, note? }
  - POST /api/assignments/:id/approve (PM), POST /api/assignments/:id/cancel (PM/requester), POST /api/assignments/:id/complete (DEVELOPER)
- Workflows & estimations:
  - Workflow definitions: GET/POST/PATCH/DELETE /api/workflows/definitions?entityType=TASK
  - Estimation: POST /api/tasks/:taskId/estimate (PM-only), POST /api/workflows/tasks/:taskId/actions (APPROVE|REJECT|SEND_BACK|REQUEST_CHANGE)
  - PM final approval + scheduling: POST /api/tasks/:taskId/final-approve-and-start
- Schedules & time off:
  - GET/POST /api/schedule/:userId (self or PM/Admin) to fetch/update work schedules.
  - GET/POST /api/company-holidays(:companyId) (PM/Admin) to list and create holidays.
  - GET/POST /api/dayoffs for submissions plus PATCH /api/dayoffs/:id for PROJECT_MANAGER/PM approvals.
- Attendance & time tracking:
  - GET /api/attendance, POST /api/attendance/clock-in, POST /api/attendance/clock-out.
  - GET/POST /api/time-entries, PATCH /api/time-entries/:id for manual, task-linked entries.

Validation enforced for every profile payload:

- mobileNumber must be E.164
- country ISO-2 (case-insensitive) or canonical country name
- city & 	itle length 1..64 chars
- 	imeZone must be an IANA identifier (e.g., America/New_York)
- Invitation acceptances & profile-change submissions set profileStatus to PENDING_APPROVAL until a PM decision.

