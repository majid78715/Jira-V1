# Studio Axis Console (Phase 0)

Phase 0 bootstrapped the monorepo. Phase 1 added authentication, RBAC-protected admin tooling, and CRUD for internal users + companies while keeping the professional white + green UI. Phase 2 covered invitations, vendor onboarding, accept-invite flows, PM approvals, and profile change requests. **Phase 3 adds projects, tasks, and developer assignments.**

## Phase 2 Highlights

- Invitation APIs & UI:
  - `POST /api/invitations/project-manager` (PM) & `/api/invitations/developer` (project managers)
  - `/admin/project-managers` (redirects from `/team/project-managers`) & `/team/developers` pages for invite + roster management
- Accept invitation experience: `/auth/accept-invite` calls `POST /api/auth/accept-invitation`, capturing the full profile (mobile/country/city/timeZone/title) and setting `profileStatus = PENDING_APPROVAL`.
- PM approvals: `/team/pending-profiles`, `POST /api/users/:id/approve-profile|reject-profile`, plus `POST /api/profile-change-requests/:id/approve|reject`.
- Profile change workflow: project managers & developers submit via `POST /api/profile-change-requests` (Settings + Request Profile Change); super admins/PMs/VPs update directly via `POST /api/users/me/profile`. PMs review pending requests in their dashboard.
- Activity logs + notifications recorded for invitations, acceptances, approvals, and profile changes.

## Phase 3 Highlights

- **Projects & tasks:** `GET/POST/PATCH /api/projects` (+ `/:id`) power `/projects` list/detail with vendor rollups, budget hours, and live task grids. Project managers can add scoped tasks with `POST /api/projects/:projectId/tasks`.
- **Task detail:** `/tasks/[id]` shows Overview, Comments, and Activity tabs backed by `GET /api/tasks/:taskId` plus `POST /api/tasks/:taskId/comments`.
- **Assignments:** `GET/POST /api/assignments` with `POST /api/assignments/:id/(approve|cancel|complete)` run the VM -> PM -> Developer handshake. Developers get a dedicated "My Tasks" view driven by approved assignments.
- **End-to-end logging:** Every project, task, and assignment change records activity + notifications so PMs see the entire lifecycle.

## Phase 4 Highlights

- Configurable task workflow engine with PM-initiated estimates, project manager completion, and PM final approval steps.
- Workflow definition management via `GET/POST/PATCH/DELETE /api/workflows/definitions?entityType=TASK`.
- Estimation operations: `POST /api/tasks/:taskId/estimate`, `POST /api/workflows/tasks/:taskId/actions`, and `POST /api/tasks/:taskId/final-approve-and-start`.
- Expected completion dates calculated with working schedules, holidays, day offs, and user time zones through `addWorkingDuration`.
- Task detail now includes an Estimation & Workflow tab for estimate submission, approver actions, and PM start-date scheduling.

## Phase 5 Highlights

- Personal work schedules stored per user with enforced timezone alignment from profile information.
- Company holiday CRUD for PMs/admins via `/api/company-holidays` plus new admin UI.
- Day off requests, lists, and approvals (`GET/POST /api/dayoffs`, `PATCH /api/dayoffs/:id`) along with Settings-based work-schedule editor and a dedicated Day Offs workspace.
- All new time-off data feeds into the workflow expected date calculations introduced in Phase 4.

## Phase 6 Highlights

- Developer-facing attendance tracking delivers `POST /api/attendance/clock-in`, `POST /api/attendance/clock-out`, and `GET /api/attendance` with schedule-aware aggregates surfaced on the dashboard Today panel.
- Manual time entries (`GET/POST /api/time-entries`, `PATCH /api/time-entries/:id`) let developers log task-linked time directly from the dashboard Log Time card.
- Every clock event and manual entry is validated against personal/company schedules so out-of-window work is flagged for downstream alerting in later phases.

## Stack

- Frontend: Next.js (App Router) + Tailwind CSS v3 + TypeScript
- Backend: Node.js + Express + TypeScript
- Data: `db/db.json` seeded by `db/seed.json`

## Environment Variables

Copy `.env.example` to `.env` at the repo root before running any scripts:

| Name | Description | Default |
| --- | --- | --- |
| `SERVER_PORT` | Port for the Express API | `4000` |
| `CLIENT_PORT` | Port for the Next.js dev server | `3000` |
| `NODE_ENV` | Environment name (`development`, `test`, `production`) | `development` |
| `JWT_SECRET` | Secret used to sign auth tokens | `local-dev-secret` |
| `JWT_EXPIRES_IN` | JWT expiration window (human readable, e.g. `12h`) | `12h` |
| `CLIENT_ORIGIN` | Allowed origin for CORS + cookies | `http://localhost:3000` |

Override these values if you need to run the UI/API on different ports or with custom secrets in downstream environments.

## Getting Started

```
npm install
cp .env.example .env      # or copy manually on Windows
npm run seed -w server    # reset db/db.json from db/seed.json
npm run dev
```

- Client runs on `http://localhost:3000`
- API runs on `http://localhost:4000`
- Health check: `GET http://localhost:4000/api/health` -> `{ "ok": true }`

## Testing

Server-side validations, unit coverage, and the invite→timesheet→alert E2E flow run via:

```
npm run test -w server
```

This script executes Vitest (unit + integration) and Playwright (API-level E2E). Ensure no other process is bound to port 4000 before running, because the Playwright journey spins up the Express app in-process.

## Scripts

- `npm run dev` - concurrently starts client and server
- `npm run lint --workspace=client` - lint client code
- `npm run build --workspace=client` - build Next.js site
- `npm run build --workspace=server` - compile the API
- `npm run start --workspace=<client|server>` - run compiled output
- `npm run seed --workspace=server` - copy `db/seed.json` into `db/db.json`
- `npm run test --workspace=server` - run server tests

## Data

`db/db.json` keeps all application entities. To reset the datastore locally:

```
npm run seed --workspace=server
```

Profile fields (enforced everywhere): `firstName`, `lastName`, `mobileNumber`, `country`, `city`, `timeZone`, `title`.

## Database & Seeding

`db/seed.json` is the canonical dataset for local development and CI. Running `npm run seed -w server` copies it into `db/db.json`. The seed file includes:

- **Companies:** Humain (internal) and Vertex Vendors (preferred vendor) with full metadata.
- **Users:** `SUPER_ADMIN`, `VP`, `PM`, `ENGINEER`, `PROJECT_MANAGER`, and `DEVELOPER` accountsâ€”each with the full profile payload the API expects.
- **Workflow:** A default two-step task workflow (Project Manager Completion -> Product Manager Approval).
- **Schedules & Holidays:** Representative work schedules and a US holiday entry so expected completion calculations behave like production.

Feel free to extend `db/seed.json` with additional fixtures for demos; rerun the seed script anytime you need a clean slate.

### Baseline Recap

- **Roles:** `SUPER_ADMIN`, `VP`, `PM`, `ENGINEER`, `PROJECT_MANAGER`, `DEVELOPER`, `VIEWER`
- **Profile fields:** `firstName`, `lastName`, `mobileNumber`, `country`, `city`, `timeZone`, `title`
- **DB keys:** `users`, `companies`, `userInvitations`, `profileChangeRequests`, `projects`, `tasks`, `assignments`, `workflowDefinitions`, `workflowInstances`, `workflowActions`, `timeEntries`, `workSchedules`, `companyHolidays`, `dayOffs`, `attendanceRecords`, `timesheets`, `comments`, `attachments`, `alerts`, `notifications`, `activityLogs`, `chatSessions`, `chatMessages`
- **Repo tree (Phase 0 layout):**

```
/
├── README.md
├── .editorconfig  .gitignore  .env.example  package.json
├── docs/ (SYSTEM_OVERVIEW.md, API.md, MODELS.md, FLOWS.md, SECURITY.md, RBAC_MATRIX.md, UX_GUIDE.md)
├── db/ (db.json, seed.json)
├── uploads/
├── client/ (Next.js App Router + Tailwind)
└── server/ (Express + TS)
```

### Demo Accounts

`SUPER_ADMIN` -> `super@humain.local` / `Admin#123`

`PM` -> `pm@humain.local` / `Manager#123`

`ENGINEER` -> `eng@humain.local` / `Builder#123`

`PROJECT_MANAGER` -> `vm@vendor.local` / `Vendor#123`

`DEVELOPER` -> `dev@vendor.local` / `Dev#1234`

### Phase 3 Quickstart

1. **Invite a project manager (PM role required)**  
  Visit `/admin/project-managers` (legacy `/team/project-managers` now redirects), send an invite (token appears in the table for dev/local testing), then complete `/auth/accept-invite` with full profile info. Approve via `/team/pending-profiles` and the new project manager can sign in afterward.

2. **Invite developers (project manager role)**  
   After approval, the project manager can invite developers from `/team/developers`. Developers accept their invite, appear as `PENDING_APPROVAL`, and PMs approve/reject from the pending dashboard.

3. **Profile change requests**  
   Project managers and developers submit updates from `/settings` (Request Profile Change). Super admins/PMs/VPs edit their profile directly in Settings. PMs review vendor requests on `/team/pending-profiles` within the "Profile Change Requests" section.

4. **API Reference (Phase 1 + Phase 2)**  
   - Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/accept-invitation`
   - Invitations: `POST /api/invitations/project-manager`, `POST /api/invitations/developer`
   - Team rosters: `GET /api/team/project-managers`, `GET /api/team/developers`
   - Approvals: `GET /api/users/pending-profiles`, `POST /api/users/:id/approve-profile|reject-profile`
   - Profile change: `POST /api/profile-change-requests`, `GET /api/profile-change-requests`, `POST /api/profile-change-requests/:id/approve|reject`

5. **Projects, tasks, and assignments**  
   Create a project via `POST /api/projects`, add vendor-scoped tasks with `POST /api/projects/:projectId/tasks`, request assignments using `POST /api/assignments`, and approve with `POST /api/assignments/:id/approve`. Developers monitor their queue on `/tasks/my` and complete work from `/tasks/[taskId]`.

## Docs

See the `docs/` folder for system overview, API, models, flows, security, RBAC, and UX guidance.


