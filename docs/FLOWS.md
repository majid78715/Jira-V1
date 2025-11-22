# Flows

- **Auth flow:** POST /api/auth/login issues a JWT-backed sa_session cookie. Frontend calls GET /api/auth/me to hydrate session context.
- **Admin user management:** SUPER_ADMIN hits /api/admin/users to list/create/patch internal users. Full profile fields enforced.
- **Company management:** SUPER_ADMIN runs /api/companies to create HUMAIN or VENDOR records; everyone else can read.
- **Project manager onboarding:**  
  1. PM invites a project manager (POST /api/invitations/project-manager), invitation token is surfaced in /admin/project-managers.  
  2. Project manager accepts via /auth/accept-invite -> POST /api/auth/accept-invitation and is marked PENDING_APPROVAL.  
  3. PM uses /team/pending-profiles (GET /api/users/pending-profiles) + POST /api/users/:id/approve-profile to activate the user.  
  4. Project manager invites developers (POST /api/invitations/developer); developers repeat the accept + approval process.  
- **Profile change requests:** Project managers/developers submit POST /api/profile-change-requests from Settings; super admins/PMs/VPs update directly via POST /api/users/me/profile. PMs review via /team/pending-profiles and POST /api/profile-change-requests/:id/approve|reject.  
- **Projects/tasks/assignments:**  
  1. PM creates a project (POST /api/projects) and optionally tags vendor companies.  
  2. Project managers add scoped tasks under that project via POST /api/projects/:projectId/tasks.  
  3. Project managers (or PMs) request a developer via POST /api/assignments -> status PENDING.  
  4. PM approves the assignment (POST /api/assignments/:id/approve), automatically flipping the task to IN_PROGRESS.  
  5. Developers track their approved queue with GET /api/assignments (/tasks/my) and complete work with POST /api/assignments/:id/complete.  
- Activity logs + notifications track invites, acceptance, approvals, profile-change outcomes, and every project/task/assignment lifecycle event for audit purposes.
- **Task estimation workflow:**  
  1. Product managers submit an estimate via POST /api/tasks/:taskId/estimate, which initializes the active workflow instance.  
  2. Project managers act via POST /api/workflows/tasks/:taskId/actions (APPROVE/REJECT/SEND_BACK/REQUEST_CHANGE) to mark the work ready for PM review.  
  3. PMs complete the final step with POST /api/tasks/:taskId/final-approve-and-start, selecting a planned start date and computing the expected completion date using schedules, holidays, and day offs.  
  4. Activity logs + notifications fire at every step so all stakeholders stay aligned on status.
- **Schedules & time off:**  
  1. Users (or PMs) manage their work schedules via GET/POST /api/schedule/:userId, ensuring slots align with the profile time zone.  
  2. PMs/admins publish company holidays using /api/company-holidays, creating the canonical list applied to expected-date calculations.  
  3. Any authenticated user can request day off via POST /api/dayoffs, view their history, and project managers/PMs approve or reject through PATCH /api/dayoffs/:id.  
  4. Approved day offs and company holidays feed directly into the workflow completion-date logic introduced in Phase 4.
- **Attendance & time tracking:**  
  1. Developers clock in/out from the dashboard, invoking POST /api/attendance/clock-in|clock-out; GET /api/attendance returns the running entry plus daily/weekly aggregates and the resolved schedule.  
  2. Logged-in developers submit manual, task-linked entries with POST /api/time-entries (and edit via PATCH /api/time-entries/:id), selecting from their approved assignments; the dashboard fetches GET /api/time-entries to render totals and the recent log.  
  3. Every clock or manual window is validated against the stored schedule so out-of-band work is flagged for future alerting/approval flows.
