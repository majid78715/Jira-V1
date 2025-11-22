1. FULL REPO SCAN FIRST (MUST DO BEFORE ANY CHANGE)

Before writing or editing any code:

Read the entire repository, including:

All frontend files (Next.js App Router, components, hooks, features).

All backend files (Express routes, controllers, services, repositories, middleware).

All TypeScript models, interfaces, enums, utils.

All DB files (db.json, seed.json, and any schema assumptions).

All shared libraries, helpers, constants.

All configuration files and folder structures.

Build a complete mental map of:

The architecture

The data flow

The naming conventions

The folder structure

How state moves between frontend ↔ backend ↔ db

Existing patterns for UI, API calls, services, repositories

How RBAC and workflows are implemented

How time, schedules, holidays, and approvals work

How alerts and automation are triggered

How the Activity Log records actions

How the AI assistant retrieves context

Never generate changes before understanding the entire repo.

This guarantees no broken wiring, no incorrect imports, no misplaced files.

2. FOLLOW THE EXISTING ARCHITECTURE EXACTLY

When modifying or adding code:

Use the same folder structure.

Use the same naming conventions.

Use the same patterns for:

routes

controllers

services

repositories

validation

models

UI components

feature folders

Tailwind classes

form patterns

data-fetching hooks

Never introduce new patterns unless intentionally requested.

3. PRESERVE AND RESPECT ALL BUSINESS LOGIC

You MUST NOT break or bypass these:

RBAC Roles

SUPER_ADMIN

VP

PM

ENGINEER

PROJECT_MANAGER

DEVELOPER

VIEWER

Governance & Restrictions

Onboarding must stay invite-only.

Vendor users cannot elevate roles.

Profile changes require PM approval.

Task estimation must follow the 3-step workflow.

Timesheets must be immutable after approval.

Activity logging must remain complete.

Alerts must remain automated and accurate.

4. PRESERVE THE DATA MODEL

The following data structures and keys must never be broken or renamed:

users
companies
userInvitations
profileChangeRequests
projects
tasks
assignments
workflowDefinitions
workflowInstances
workflowActions
timeEntries
workSchedules
companyHolidays
dayOffs
attendanceRecords
timesheets
comments
attachments
alerts
notifications
activityLogs
chatSessions
chatMessages


If you add fields:

Update TypeScript types

Update repositories

Update controllers/services

Update frontend forms

Update db.json & seed.json if needed

Never introduce backwards-incompatible changes.

5. PLACE NEW CODE IN THE CORRECT LOCATIONS

Follow these rules:

Backend

New routes → server/src/routes/*

New logic → server/src/services/*

New DB interactions → server/src/data/repositories.ts

New validation → server/src/utils/validation.ts

Shared logic → utils, not duplicated

Frontend

New pages → client/app/...

New components → client/components/...

New feature logic → client/features/...

Shared form logic → client/lib/*

Never mix concerns or create random folders.

6. ALL CHANGES MUST BE END-TO-END

Whenever you add or modify anything:

You must update:

TS types

API routes

Controllers

Services

Repositories

Frontend API calls

Frontend UI pages

Validation

Activity logging

Alerts/notifications (if affected)

db.json structure (if affected)

seed.json (if required)

Nothing incomplete.
Nothing half-wired.
No loose ends.

7. ALWAYS SHOW FULL FILE REPLACEMENTS

When returning code:

Show the complete updated file

Not a diff

Not partial snippets

Not ellipses

This ensures consistency and prevents merge errors.

8. NEVER BREAK EXISTING FEATURES

When implementing a change:

Re-check workflows

Re-run mental test paths

Ensure existing behavior is untouched

Ensure roles still behave exactly as before

Ensure data integrity in db.json

Ensure scheduling logic still works

Ensure no silent regressions

9. IF A CHANGE TOUCHES MULTIPLE AREAS, UPDATE THEM ALL

For example:

A field added → update UI, API, models, DB, validation, logging

A new approval → update workflow engine, UI, notifications, activity log

A new alert → update automation + UI + entity model

Everything must be synchronized.

10. CODE MUST BE ENTERPRISE-GRADE

This means:

No any

Strong typing

Clear naming

Reusable components

Clean abstraction in services

No duplication

Proper error handling

Proper validation

Full RBAC checks

Consistent coding style

Tailwind classes aligned with existing patterns
11. HUMAINOS UI LIBRARY IS MANDATORY FOR UI

All new or refactored UI must use the design system in client/ui-library. Do NOT scatter new components or assets outside this folder.

Structure:
- client/ui-library/foundations  (tokens, gradients, base styles)
- client/ui-library/components   (reusable UI components)
- client/ui-library/icons        (icon assets)

SVG gradients/icons are added by drag-and-drop only:
- Drop gradient SVGs into client/ui-library/foundations
- Drop icon SVGs into client/ui-library/icons

When Codex creates, edits, or extends UI, it must first look in client/ui-library, reuse what exists, and add any new UI elements or assets there before using them anywhere else in the app.

