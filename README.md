# Canopy

A self-hosted project management and ticketing system. Supports multiple projects with role-based access, Kanban boards with configurable workflows, sprint planning, goals & OKRs, reporting, time tracking, automations, and a full REST API.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Features](#features)
- [API Reference](#api-reference)
- [Roles & Permissions](#roles--permissions)

---

## Quick Start

**Requirements:** Docker and Docker Compose.

```bash
git clone <repo-url> && cd ticketing
cp .env .env.local          # edit secrets before running in production
docker compose up --build
```

| Service   | URL                          |
|-----------|------------------------------|
| App       | http://localhost:3000        |
| API       | http://localhost:4000        |
| MinIO UI  | http://localhost:9001        |

The first user to register becomes the system admin.

To start without Docker, run the backend (`npm start` in `backend/`) and frontend (`npm run dev` in `frontend/`) separately. Requires a running PostgreSQL instance and a MinIO-compatible object store.

---

## Architecture

```
frontend/    React 18 + Vite + Tailwind + TanStack Query
backend/     Node.js + Express + PostgreSQL (pg)
             MinIO (S3-compatible) for file attachments
```

The backend serves a REST API at `/api`. The frontend is a single-page app that communicates exclusively with that API. Authentication is via JWT (Bearer token) or API tokens for programmatic access.

---

## Configuration

All configuration is via environment variables. Copy `.env` and edit before deploying:

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_DB` | yes | Database name |
| `POSTGRES_USER` | yes | Database user |
| `POSTGRES_PASSWORD` | yes | Database password — change in production |
| `JWT_SECRET` | yes | Secret for signing JWTs — use a long random string |
| `BACKEND_URL` | yes | Public URL of the API server |
| `FRONTEND_URL` | yes | Public URL of the frontend |
| `VITE_API_URL` | yes | API URL baked into the frontend build |
| `GOOGLE_CLIENT_ID` | no | Enables Google OAuth login |
| `GOOGLE_CLIENT_SECRET` | no | Required if `GOOGLE_CLIENT_ID` is set |
| `SMTP_HOST` | no | Email server for notifications. Omit to print emails to console |
| `SMTP_PORT` | no | Default `587` |
| `SMTP_USER` | no | SMTP username |
| `SMTP_PASS` | no | SMTP password or App Password |
| `SMTP_FROM` | no | From address, e.g. `Canopy <noreply@example.com>` |
| `APP_URL` | no | Used in notification email links |
| `MINIO_ROOT_USER` | yes | MinIO admin user |
| `MINIO_ROOT_PASSWORD` | yes | MinIO admin password — change in production |
| `MINIO_BUCKET` | yes | Bucket name for attachments |
| `MINIO_PUBLIC_URL` | yes | Public URL of the MinIO API port |

---

## Features

### Projects
Multiple projects in one instance. Each project has its own members, roles, tickets, workflow, sprints, goals, labels, custom fields, and reports.

### Role-Based Access Control
Four project roles (viewer, member, admin, owner) plus a system-level admin role. Teams can be assigned project roles to simplify bulk access management.

### Kanban Board
Drag-and-drop board with status columns. Columns are driven by the project's configurable workflow statuses — create, rename, recolor, and reorder them under **Project Settings → Workflow**. Statuses have a category (To Do / In Progress / Done) that drives burndown charts and cycle time calculations.

### Workflow Enforcement
Optional enforcement of allowed status transitions per project. When enabled, tickets can only move to statuses explicitly permitted by the workflow configuration.

### Sprint Planning
Create sprints with optional start/end dates and goals. Drag tickets from the backlog into sprints. Start and complete sprints; completed tickets stay in done, others return to the backlog. Burndown charts track story points or hours. Epic sidebar filters the backlog to a specific epic's sub-tickets.

### Ticket Hierarchy
Tickets have types: **Epic**, **Story**, **Task**, **Bug**. Epics contain sub-tickets. Tasks can have parent tickets. Child counts and epic progress are surfaced everywhere.

### Custom Fields
Define typed fields per project (text, number, select, date, URL). Fields appear in the ticket panel and can be filtered in the advanced filter builder.

### Labels
Color-coded labels per project. Assign multiple labels to tickets; filter by label in the filter bar or advanced builder.

### Time Tracking
Log hours against tickets. Time logs are per-user and per-day (max 24 hours/day). Total logged hours surface in the ticket panel.

### File Attachments
Upload files to tickets (25 MB limit). Files are stored in MinIO and served via presigned URLs.

### Comments & Mentions
Threaded comments on tickets. Use `@username` syntax to mention teammates — mentioned users receive email notifications if SMTP is configured.

### Advanced Filtering & Search
Filter tickets by status, type, priority, assignee, sprint, label, due date, story points, and custom fields. The **Filter Builder** supports nested AND/OR groups with parentheses for complex logic. Save and reuse filter combinations. Full-text search over ticket titles and descriptions uses a GIN index for performance.

### Goals & OKRs
Two levels of goals: **Project goals** (scoped to one project) and **Org goals** (span all projects). Goals form a hierarchy; parent progress rolls up from children automatically. Progress can be tracked by:
- **Sub-goal completion** — percent of child goals completed
- **Ticket completion %** — ratio of done tickets to total linked tickets
- **Story points** — points burned vs. target
- **Ticket count** — tickets done vs. target
- **Currency** — numeric value toward a dollar target
- **Manual** — manually entered percentage

Goal types: Objective, Key Result, Milestone, Initiative, Task. Status (on track / at risk / behind) is computed from progress vs. elapsed time and bubbles up from children.

### Reports
Per-project dashboards with four panels:
- **Overview** — open/in-progress/overdue counts, ticket distribution by status/type/priority
- **Velocity** — story points completed per sprint (last 10 sprints)
- **Cycle Time** — average and median hours from ticket creation to completion per week (last 12 weeks)
- **Workload & Throughput** — open tickets and points per assignee; tickets and points completed per week

### Automations
Event-driven rules that run when tickets change. Configure a trigger (ticket created, status changed, priority changed, overdue), optional conditions (field equals / contains / is empty), and one or more actions (set status, set priority, assign user, add label, post comment). View per-automation run history and test manually.

### API Tokens
Generate long-lived API tokens for programmatic access. Tokens are shown once at creation and stored as a hashed prefix. Pass as `Authorization: Bearer <token>` — the same header used by the browser session.

### Admin Panel
System admins can create, edit, deactivate, and delete users; assign system-level roles; and reset passwords.

---

## API Reference

All endpoints are prefixed with `/api`. Authentication is required on all routes except `/api/auth/login` and `/api/auth/google`. Pass the JWT or API token as:

```
Authorization: Bearer <token>
```

---

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login with email and password. Returns `{ token, user }` |
| `GET` | `/api/auth/me` | Return the authenticated user |
| `PUT` | `/api/auth/password` | Change own password |
| `GET` | `/api/auth/google` | Redirect to Google OAuth (requires `GOOGLE_CLIENT_ID`) |
| `GET` | `/api/auth/google/callback` | Google OAuth callback |
| `GET` | `/api/auth/config` | Returns `{ googleEnabled: bool }` |

---

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects the user can access |
| `POST` | `/api/projects` | Create project. Body: `{ name, key, description? }` |
| `GET` | `/api/projects/:id` | Get project details |
| `PATCH` | `/api/projects/:id` | Update name/description (admin+) |
| `DELETE` | `/api/projects/:id` | Delete project (owner only) |

---

### Tickets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tickets` | List tickets. Returns `{ tickets, total }`. See filters below |
| `POST` | `/api/tickets` | Create ticket |
| `GET` | `/api/tickets/:id` | Get ticket with children, labels, custom fields, time logs |
| `PATCH` | `/api/tickets/:id` | Update ticket fields |
| `DELETE` | `/api/tickets/:id` | Delete ticket |

**GET /api/tickets — query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | UUID | Filter by project |
| `status` | string | Comma-separated status slugs, e.g. `todo,in_progress` |
| `type` | string | Comma-separated types: `task,bug,story,epic` |
| `priority` | string | Comma-separated: `low,medium,high,critical` |
| `assigneeId` | UUID | Comma-separated assignee UUIDs |
| `sprintId` | UUID or `none` | Filter by sprint; `none` = backlog |
| `labelIds` | UUIDs | Comma-separated label IDs (tickets matching any) |
| `parentId` | UUID or `null` | Sub-tickets of epic; `null` = top-level only |
| `search` | string | Full-text search over title and description |
| `dueDateBefore` | date | ISO date |
| `dueDateAfter` | date | ISO date |
| `hasNoAssignee` | `true` | Unassigned open tickets |
| `hasNoPoints` | `true` | Tickets with no story points |
| `filterConfig` | JSON | Serialized nested filter tree from the Filter Builder |
| `limit` | int | Page size (default 200) |
| `offset` | int | Pagination offset |

**POST/PATCH ticket body fields:**

```json
{
  "title": "string",
  "description": "string (markdown)",
  "type": "task | bug | story | epic",
  "status": "slug from project workflow statuses",
  "priority": "low | medium | high | critical",
  "assignee_id": "uuid | null",
  "parent_id": "uuid | null",
  "sprint_id": "uuid | null",
  "story_points": "number | null",
  "estimate_hours": "number | null",
  "due_date": "YYYY-MM-DD | null",
  "label_ids": ["uuid"]
}
```

---

### Sprints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/sprints` | List sprints with metrics |
| `POST` | `/api/projects/:projectId/sprints` | Create sprint. Body: `{ name, goal?, start_date?, end_date?, metric? }` |
| `PATCH` | `/api/projects/:projectId/sprints/:sprintId` | Update sprint |
| `DELETE` | `/api/projects/:projectId/sprints/:sprintId` | Delete sprint |
| `POST` | `/api/projects/:projectId/sprints/:sprintId/start` | Activate sprint |
| `POST` | `/api/projects/:projectId/sprints/:sprintId/complete` | Complete sprint. Body: `{ moveToSprintId? }` |
| `GET` | `/api/projects/:projectId/sprints/:sprintId/burndown` | Burndown chart data |

---

### Workflow Statuses

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/statuses` | List project statuses in order |
| `POST` | `/api/projects/:projectId/statuses` | Create status. Body: `{ name, color?, category? }` |
| `PATCH` | `/api/projects/:projectId/statuses/:statusId` | Update name/color/category |
| `POST` | `/api/projects/:projectId/statuses/reorder` | Reorder. Body: `{ order: [uuid] }` |
| `DELETE` | `/api/projects/:projectId/statuses/:statusId` | Delete (fails if tickets use it) |

Status categories: `todo`, `in_progress`, `done`. The `done` category drives `completed_at` timestamps and burndown.

---

### Workflow Transitions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/workflow` | Get workflow and all transitions |
| `POST` | `/api/projects/:projectId/workflow` | Create workflow |
| `PATCH` | `/api/projects/:projectId/workflow/settings` | Toggle enforcement on/off |
| `POST` | `/api/projects/:projectId/workflow/transitions` | Add transition. Body: `{ from_status, to_status, name? }` |
| `DELETE` | `/api/projects/:projectId/workflow/transitions/:id` | Remove transition |

---

### Labels

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/labels` | List labels |
| `POST` | `/api/projects/:projectId/labels` | Create. Body: `{ name, color, description? }` |
| `PATCH` | `/api/projects/:projectId/labels/:labelId` | Update |
| `DELETE` | `/api/projects/:projectId/labels/:labelId` | Delete |

---

### Custom Fields

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/fields` | List field definitions |
| `POST` | `/api/projects/:projectId/fields` | Create field. Body: `{ name, field_type, options?, is_required? }` |
| `PATCH` | `/api/projects/:projectId/fields/:fieldId` | Update field |
| `DELETE` | `/api/projects/:projectId/fields/:fieldId` | Delete field |
| `PUT` | `/api/projects/:projectId/fields/tickets/:ticketId` | Set field values. Body: `{ values: { fieldId: value } }` |

Field types: `text`, `number`, `select`, `date`, `url`.

---

### Project Members

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/members` | List members |
| `POST` | `/api/projects/:projectId/members` | Add user. Body: `{ user_id, role }` |
| `PATCH` | `/api/projects/:projectId/members/:userId` | Change role |
| `DELETE` | `/api/projects/:projectId/members/:userId` | Remove member |

---

### Comments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/comments?ticketId=:id` | List comments for a ticket |
| `POST` | `/api/comments` | Create. Body: `{ ticket_id, content }`. `@username` triggers email |
| `PATCH` | `/api/comments/:id` | Edit |
| `DELETE` | `/api/comments/:id` | Delete |

---

### Time Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tickets/:ticketId/time-logs` | List time logs |
| `POST` | `/api/tickets/:ticketId/time-logs` | Log hours. Body: `{ hours, date?, note? }` |
| `DELETE` | `/api/tickets/:ticketId/time-logs/:logId` | Delete log |

---

### Attachments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tickets/:ticketId/attachments` | List with presigned download URLs |
| `POST` | `/api/tickets/:ticketId/attachments` | Upload file (multipart/form-data, field `file`, max 25 MB) |
| `DELETE` | `/api/tickets/:ticketId/attachments/:id` | Delete |

---

### Goals

**Project goals** are scoped to a project:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/goals` | Full goal tree with computed progress |
| `POST` | `/api/projects/:projectId/goals` | Create root goal |
| `PATCH` | `/api/projects/:projectId/goals/:goalId` | Update goal |
| `DELETE` | `/api/projects/:projectId/goals/:goalId` | Delete goal |
| `POST` | `/api/projects/:projectId/goals/:goalId/sub-goals` | Add child goal |
| `POST` | `/api/projects/:projectId/goals/:goalId/tickets` | Link ticket |
| `DELETE` | `/api/projects/:projectId/goals/:goalId/tickets/:ticketId` | Unlink ticket |
| `POST` | `/api/projects/:projectId/goals/:goalId/epics` | Link epic |
| `DELETE` | `/api/projects/:projectId/goals/:goalId/epics/:epicId` | Unlink epic |

**Org goals** span all projects:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/goals` | Full org goal tree |
| `POST` | `/api/goals` | Create root org goal |
| `GET` | `/api/goals/:id` | Goal with children and linked tickets |
| `POST` | `/api/goals/:id/sub-goals` | Create child goal |
| `PATCH` | `/api/goals/:id` | Update |
| `DELETE` | `/api/goals/:id` | Delete |
| `POST` | `/api/goals/:id/tickets` | Link ticket |
| `DELETE` | `/api/goals/:id/tickets/:ticketId` | Unlink ticket |

Goal body fields: `title`, `description`, `goal_type` (objective/key_result/milestone/initiative/task), `metric_type` (subgoals/completion/points/count/manual/currency), `target_value`, `current_value`, `unit`, `weight`, `status`, `owner_id`, `start_date`, `due_date`.

---

### Reports

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/reports/overview` | Status/type/priority breakdown + health metrics |
| `GET` | `/api/projects/:projectId/reports/velocity` | Story points per sprint |
| `GET` | `/api/projects/:projectId/reports/cycle-time` | Avg/median hours to complete per week |
| `GET` | `/api/projects/:projectId/reports/throughput` | Tickets and points completed per week |
| `GET` | `/api/projects/:projectId/reports/workload` | Open work per assignee |

---

### Automations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/automations` | List automations |
| `POST` | `/api/projects/:projectId/automations` | Create automation |
| `PATCH` | `/api/projects/:projectId/automations/:id` | Update |
| `DELETE` | `/api/projects/:projectId/automations/:id` | Delete |
| `GET` | `/api/projects/:projectId/automations/:id/runs` | Run history |
| `POST` | `/api/projects/:projectId/automations/:id/test` | Test on ticket. Body: `{ ticket_id }` |

Automation body: `{ name, trigger, conditions: [], actions: [], is_active }`. Triggers: `ticket_created`, `status_changed`, `priority_changed`, `overdue`. Actions: `set_status`, `set_priority`, `assign_user`, `add_label`, `post_comment`.

---

### Saved Filters

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/saved-filters` | List user's saved filters |
| `POST` | `/api/projects/:projectId/saved-filters` | Save. Body: `{ name, filter_config }` |
| `PATCH` | `/api/projects/:projectId/saved-filters/:filterId` | Update |
| `DELETE` | `/api/projects/:projectId/saved-filters/:filterId` | Delete |

---

### API Tokens

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tokens` | List own tokens (no secret values returned) |
| `POST` | `/api/tokens` | Create token. Body: `{ name }`. Returns full token once |
| `DELETE` | `/api/tokens/:id` | Revoke token |

---

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List all users (admin only) |
| `POST` | `/api/admin/users` | Create user. Body: `{ name, email, password, role? }` |
| `PATCH` | `/api/admin/users/:id` | Update user |
| `DELETE` | `/api/admin/users/:id` | Delete user |

---

### Teams

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/teams` | List teams |
| `POST` | `/api/teams` | Create team. Body: `{ name, description? }` (admin only) |
| `PATCH` | `/api/teams/:id` | Update |
| `DELETE` | `/api/teams/:id` | Delete (admin only) |
| `GET` | `/api/teams/:id/members` | List team members |
| `POST` | `/api/teams/:id/members` | Add member |
| `DELETE` | `/api/teams/:id/members/:userId` | Remove member |

---

### Health

```
GET /health  →  { "status": "ok" }
```

---

## Roles & Permissions

### System roles

| Role | Description |
|------|-------------|
| `user` | Normal user; can be added to projects |
| `admin` | System administrator; can manage all users and access any project |

### Project roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only access to tickets, comments, and reports |
| `member` | Can create and edit tickets, log time, add comments |
| `admin` | Can manage members, labels, fields, workflow, sprints, automations |
| `owner` | Full control including project deletion; can assign owner role |

Roles can be granted to individual users or to teams. A user's effective role is the highest of their individual and team-based roles.
