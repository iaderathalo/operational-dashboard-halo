# Portfolio Visibility Dashboard — MVP Implementation Plan

> **Date**: 2026-05-19  
> **Status**: Approved for implementation  
> **Reference**: `docs/dashboard-architecture.md`

---

## 1. MVP Scope

### What's Included

| Feature                      | Description                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Dashboard Grid**           | Consolidated, searchable, filterable view of all monitored applications with G/A/R status indicators |
| **Status Indicators**        | Green (healthy), Amber (degraded), Red (major outage) per application with worst-first sorting       |
| **Summary Bar**              | Total app count, count per status color, total active users, overall 30-day uptime                   |
| **Active Incident Banner**   | Persistent top banner showing active Sev-1 incidents with elapsed time                               |
| **Filter & Search**          | Filter by status, business unit, tier; sort by status/name; text search                              |
| **Application Detail Panel** | Slide-out panel with full status, uptime metrics, active users, contacts, recent incidents           |
| **Uptime Metrics**           | Calculated uptime % for 24h/7d/30d/90d windows per application                                       |
| **Active User Counts**       | Current user count per application with trend indicator                                              |
| **Support Contacts**         | Per-app contact directory with on-call engineer, app owner, vendor info                              |
| **Sev-1 Incident Creation**  | 3-step wizard (Identify → Notify → Confirm) — local creation, auto-transitions app to RED            |
| **Contact Directory**        | Slide-out panel with on-call-now, by-app contacts, escalation path                                   |
| **Manual Status Override**   | Authorized users can manually set app status with audit trail                                        |
| **Auto-Refresh**             | Configurable polling interval (default 60 seconds)                                                   |
| **SSO Authentication**       | Okta OIDC (already implemented in project template)                                                  |
| **In-App Notifications**     | Toast messages for incident creation, status overrides, errors                                       |

### What's Excluded (Deferred)

| Feature                                               | Deferred To |
| ----------------------------------------------------- | ----------- |
| User Perception tracking (dual-status indicators)     | Phase 2     |
| WebSocket real-time push                              | Phase 2     |
| PlanView EA sync for portfolio, TPM, and applications | Phase 2     |
| ServiceNow integration (incident ticket sync)         | Phase 2     |
| PagerDuty integration (on-call + paging)              | Phase 2     |
| Microsoft Teams/email/SMS notifications               | Phase 2     |
| Health-source integration (Datadog + app.komodor.com) | Phase 2    |
| Fine-grained RBAC (Viewer/Operator/Admin/Super Admin) | Phase 3     |
| Mobile responsive layout                              | Phase 3     |
| WCAG 2.1 AA audit + fixes                             | Phase 3     |
| Audit log search/export UI                            | Phase 3     |
| Performance testing at scale (500 apps)               | Phase 3     |
| Public status page                                    | Future      |

### Target Production Data Sources

| Domain | Source System | Notes |
| ------ | ------------- | ----- |
| Portfolio hierarchy, TPM ownership, application catalog | PlanView EA | Approved system of record for portfolio and ownership metadata |
| Application health | Datadog | Approved source for application-level health and availability |
| Container health | app.komodor.com | Approved source for Kubernetes and container runtime health |
| Incident ticketing | ServiceNow | Approved incident ticketing platform |
| Collaboration alerts | Microsoft Teams | Approved collaboration channel for operational notifications |

---

## 2. Technology Stack

| Layer              | Technology            | Notes                           |
| ------------------ | --------------------- | ------------------------------- |
| **Runtime**        | Node.js v20           | Existing                        |
| **Monorepo**       | NX v19.4.1            | Existing                        |
| **Language**       | TypeScript v5.9       | Existing                        |
| **Backend**        | NestJS v11 (Express)  | Existing                        |
| **Frontend**       | Angular v20           | Existing                        |
| **Database**       | MongoDB Atlas         | Existing — native driver        |
| **Authentication** | Okta OIDC             | Existing — JWT verification     |
| **Observability**  | Datadog (dd-trace)    | Existing                        |
| **Logging**        | Polaris Logger        | Existing — SIEM-compliant       |
| **API Docs**       | Swagger UI (OpenAPI)  | Existing — design-first         |
| **Real-Time**      | REST polling (60s)    | New — configurable interval     |
| **Charts**         | ng2-charts (Chart.js) | New — for sparklines and trends |

---

## 3. Data Model

### Collections

#### `applications`

```typescript
interface Application {
  id: string;
  name: string;
  shortCode: string;
  description: string;
  environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
  tier: 1 | 2 | 3 | 4;
  businessUnit: string;
  currentStatus: 'GREEN' | 'AMBER' | 'RED';
  currentUserCount: number;
  monitoringSource: string;
  teamId: string;
  statusOverride?: {
    status: 'GREEN' | 'AMBER' | 'RED';
    overriddenBy: string;
    reason: string;
    overriddenAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### `health-status-records`

```typescript
interface HealthStatusRecord {
  id: string;
  applicationId: string;
  status: 'GREEN' | 'AMBER' | 'RED';
  reason: string;
  source: 'AUTOMATIC' | 'MANUAL_OVERRIDE';
  recordedAt: Date;
  metadata: Record<string, unknown>;
}
```

#### `incidents`

```typescript
interface Incident {
  id: string;
  incidentNumber: string; // e.g. "INC-20260519-001"
  applicationId: string;
  severity: 'SEV_1' | 'SEV_2' | 'SEV_3';
  title: string;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';
  businessImpactLevel: 'CRITICAL' | 'HIGH' | 'SIGNIFICANT';
  estimatedUsersImpacted: number;
  reportedBy: string;
  assignedTo?: string;
  openedAt: Date;
  resolvedAt?: Date;
  impactSummary?: string;
}
```

#### `incident-updates`

```typescript
interface IncidentUpdate {
  id: string;
  incidentId: string;
  authorId: string;
  message: string;
  statusChange?: string;
  createdAt: Date;
}
```

#### `teams`

```typescript
interface Team {
  id: string;
  name: string;
  department: string;
  teamsChannel?: string;
  emailDistributionList?: string;
}
```

#### `contacts`

```typescript
interface Contact {
  id: string;
  teamId: string;
  employeeId: string;
  displayName: string;
  email: string;
  phone: string;
  role:
    | 'APP_OWNER'
    | 'ON_CALL_PRIMARY'
    | 'ON_CALL_SECONDARY'
    | 'TECH_LEAD'
    | 'DBA'
    | 'VENDOR'
    | 'ESCALATION_MANAGER';
  isPrimaryContact: boolean;
}
```

#### `uptime-records`

```typescript
interface UptimeRecord {
  id: string;
  applicationId: string;
  measuredAt: Date;
  isUp: boolean;
  responseTimeMs: number;
  checkSource: string;
}
```

#### `user-session-metrics`

```typescript
interface UserSessionMetric {
  id: string;
  applicationId: string;
  measuredAt: Date;
  activeUserCount: number;
  source: string;
}
```

---

## 4. API Endpoints

All endpoints prefixed with `/api/v1`. Protected by Okta JWT guard.

### Applications

| Method | Endpoint                               | Description                                                                |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/applications`                        | List all apps. Query: `?status=RED&tier=1&businessUnit=Finance&search=SAP` |
| GET    | `/applications/:id`                    | Full application detail                                                    |
| GET    | `/applications/:id/status-history`     | Status change history                                                      |
| GET    | `/applications/:id/uptime`             | Uptime metrics. Query: `?range=30d` (24h/7d/30d/90d)                       |
| GET    | `/applications/:id/user-count-history` | User count time series. Query: `?range=24h`                                |
| PUT    | `/applications/:id/status-override`    | Manual status override with reason                                         |
| DELETE | `/applications/:id/status-override`    | Clear manual override                                                      |

### Incidents

| Method | Endpoint                 | Description                                                         |
| ------ | ------------------------ | ------------------------------------------------------------------- |
| POST   | `/incidents`             | Create incident — auto-transitions app status to RED for Sev-1      |
| GET    | `/incidents`             | List incidents. Query: `?status=OPEN&severity=SEV_1&applicationId=` |
| GET    | `/incidents/:id`         | Incident detail with update timeline                                |
| PUT    | `/incidents/:id`         | Update incident status/assignment                                   |
| POST   | `/incidents/:id/updates` | Add status update message                                           |

### Teams & Contacts

| Method | Endpoint                     | Description                             |
| ------ | ---------------------------- | --------------------------------------- |
| GET    | `/teams`                     | List all teams                          |
| GET    | `/teams/:id/on-call`         | Current on-call contacts for team       |
| GET    | `/applications/:id/contacts` | All support contacts for an application |

### Dashboard

| Method | Endpoint             | Description                                                       |
| ------ | -------------------- | ----------------------------------------------------------------- |
| GET    | `/dashboard/summary` | Aggregate: total apps, counts per status, total users, 30d uptime |

---

## 5. Frontend Architecture

### Module Structure

```
apps/ui/src/app/features/dashboard/
├── dashboard.module.ts
├── dashboard-routing.module.ts
├── pages/
│   └── dashboard-page/
│       ├── dashboard-page.component.ts|html|scss
├── components/
│   ├── summary-bar/              — G/A/R counts, total apps, overall uptime
│   ├── incident-banner/          — Persistent Sev-1 alert bar
│   ├── filter-bar/               — Status, BU, sort, search controls
│   ├── application-card/         — Single app card with status + metrics
│   ├── application-grid/         — Responsive grid/table of cards
│   ├── detail-panel/             — Slide-out right panel (40-50% width)
│   ├── status-badge/             — Green/Amber/Red indicator
│   ├── uptime-display/           — Percentage with sparkline chart
│   ├── active-users-counter/     — Count with trend arrow
│   ├── contact-card/             — Name, role, clickable phone/email
│   ├── contact-directory-panel/  — Full contact directory slide-out
│   └── incident-modal/           — 3-step Sev-1 creation wizard
├── services/
│   └── dashboard.service.ts      — HTTP calls + polling logic
├── models/
│   └── dashboard.models.ts       — Frontend interfaces
└── types/
    └── dashboard.types.ts        — Enums, status constants
```

### Routes

| Path                         | Component                                | Description                    |
| ---------------------------- | ---------------------------------------- | ------------------------------ |
| `/dashboard`                 | DashboardPageComponent                   | Main dashboard (default route) |
| `/dashboard/application/:id` | DashboardPageComponent (with panel open) | Deep-link to app detail        |
| `/tasks`                     | (existing)                               | Existing task management       |

### Key UI Behaviors

- **Worst-first sorting**: RED cards appear first, then AMBER, then GREEN
- **Auto-refresh**: `interval(60000)` polling with "Last refreshed" timestamp
- **Stale indicator**: Shows warning when API is unreachable or data > 2 minutes old
- **Responsive grid**: 4 cards/row at 1920px+, 3 at 1280px, 2 at 768px, 1 (list) below
- **Slide-out panel**: Overlay from right, 45% viewport width on desktop

---

## 6. Implementation Phases

### Phase A: Data Model & Backend (Steps 1-4)

| Step | Task                                                 | Files                                                           |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 1    | MongoDB schemas + shared DTOs                        | `apps/api/src/*/schemas/*.ts`, `libs/shared/api/src/model/*.ts` |
| 2    | Repository layer (Repository interface + Mongo impl) | `apps/api/src/*/repositories/**/*.ts`                           |
| 3    | NestJS modules, controllers, services                | `apps/api/src/applications/`, `incidents/`, `teams/`, `uptime/` |
| 4    | Seed data (12 sample apps + incidents + contacts)    | `db/seed-dashboard-data.ts`                                     |

### Phase B: Frontend Dashboard (Steps 5-10) — _depends on Phase A_

| Step | Task                                          | Parallelism     |
| ---- | --------------------------------------------- | --------------- |
| 5    | Angular feature module scaffolding            | —               |
| 6    | Main dashboard grid (summary, cards, filters) | Parallel with 7 |
| 7    | Application detail panel (slide-out)          | Parallel with 6 |
| 8    | Sev-1 incident creation wizard (3-step modal) | Depends on 5-7  |
| 9    | Contact directory panel                       | Parallel with 8 |
| 10   | Navigation + routing updates                  | Depends on 5    |

### Phase C: Polish & Integration (Steps 11-13) — _depends on Phase B_

| Step | Task                                             | Parallelism         |
| ---- | ------------------------------------------------ | ------------------- |
| 11   | Status logic, override audit trail, auto-refresh | —                   |
| 12   | Uptime calculation service                       | Parallel with 11    |
| 13   | In-app notification toasts                       | Parallel with 11-12 |

---

## 7. Seed Data

12 sample applications matching the design wireframes:

| #   | Application        | Business Unit         | Status | Tier | Users  |
| --- | ------------------ | --------------------- | ------ | ---- | ------ |
| 1   | SAP ERP            | Finance & Operations  | RED    | 1    | 1,204  |
| 2   | Oracle HCM         | Human Resources       | AMBER  | 2    | 342    |
| 3   | Workday Payroll    | Human Resources       | AMBER  | 1    | 89     |
| 4   | Salesforce CRM     | Sales & Marketing     | GREEN  | 1    | 3,812  |
| 5   | ServiceNow ITSM    | IT Operations         | GREEN  | 1    | 567    |
| 6   | Microsoft 365      | Enterprise Services   | GREEN  | 1    | 14,209 |
| 7   | Tableau Analytics  | Business Intelligence | GREEN  | 2    | 287    |
| 8   | Splunk SIEM        | Information Security  | GREEN  | 1    | 45     |
| 9   | Cisco WebEx        | Enterprise Services   | GREEN  | 2    | 2,103  |
| 10  | Jira Software      | Engineering           | GREEN  | 3    | 891    |
| 11  | Confluence Wiki    | Engineering           | GREEN  | 3    | 456    |
| 12  | Bloomberg Terminal | Finance & Operations  | GREEN  | 2    | 78     |

Plus:

- 1 active Sev-1 incident (SAP ERP — DB connection pool exhaustion)
- 6 teams with associated contacts
- 90 days of uptime records per application
- 24 hours of user session metrics per application

---

## 8. Patterns & Conventions

### Backend (NestJS)

Follow existing patterns from `apps/api/src/tasks/`:

- **Module pattern**: Controller + Service + Module, registered in `app.module.ts`
- **Repository pattern**: Abstract `Repository<T>` interface → `MongoRepository<T>` base class →
  domain-specific implementation
- **Auth guard**: `@UseGuards(OktaGuard)` on all controllers
- **Error handling**: `FormattedExceptionFilter` for consistent error responses
- **Logging**: Polaris Logger with SIEM event compliance
- **API versioning**: All endpoints under `/api/v1`
- **Response envelope**: `{ data: T, meta: { timestamp, requestId } }`

### Frontend (Angular)

Follow existing patterns from `apps/ui/src/app/features/task-management/`:

- **Feature module**: Lazy-loaded module with own routing
- **Service pattern**: Injectable service with Observable-based HTTP calls
- **Auth interceptor**: Bearer token auto-injected via `@operational-dashboard/shared-angular-utils`
- **HTTP resilience**: Retry interceptor for transient failures
- **Environment config**: API base URL from `environments/environment.ts`

### Shared Libraries

- DTOs shared between frontend and backend via `libs/shared/api/src/model/`
- Import alias: `@operational-dashboard/shared-api-model/*`

---

## 9. Files to Modify (Existing)

| File                                    | Change                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `apps/api/src/app/app.module.ts`        | Register ApplicationsModule, IncidentsModule, TeamsModule, UptimeModule |
| `apps/ui/src/app/app-routing.module.ts` | Add `/dashboard` route, set as default                                  |
| `apps/ui/src/app/app.module.ts`         | Import DashboardModule                                                  |
| `libs/shared/api/src/model/index.ts`    | Export new DTOs                                                         |
| `package.json`                          | Add ng2-charts, chart.js dependencies (if not present)                  |

---

## 10. Files to Create (New)

### Backend

```
apps/api/src/applications/
├── applications.module.ts
├── applications.controller.ts
├── applications.service.ts
├── schemas/
│   ├── application.schema.ts
│   └── health-status-record.schema.ts
├── repositories/
│   ├── application.repository.ts
│   └── mongo/
│       └── mongo-application.repository.ts
└── dto/
    ├── create-application.dto.ts
    ├── update-status.dto.ts
    └── application-filter.dto.ts

apps/api/src/incidents/
├── incidents.module.ts
├── incidents.controller.ts
├── incidents.service.ts
├── schemas/
│   ├── incident.schema.ts
│   └── incident-update.schema.ts
├── repositories/
│   ├── incident.repository.ts
│   └── mongo/
│       └── mongo-incident.repository.ts
└── dto/
    ├── create-incident.dto.ts
    └── update-incident.dto.ts

apps/api/src/teams/
├── teams.module.ts
├── teams.controller.ts
├── teams.service.ts
├── schemas/
│   ├── team.schema.ts
│   └── contact.schema.ts
├── repositories/
│   ├── team.repository.ts
│   └── mongo/
│       └── mongo-team.repository.ts

apps/api/src/uptime/
├── uptime.module.ts
├── uptime.controller.ts
├── uptime.service.ts
├── schemas/
│   ├── uptime-record.schema.ts
│   └── user-session-metric.schema.ts
├── repositories/
│   ├── uptime.repository.ts
│   └── mongo/
│       └── mongo-uptime.repository.ts

apps/api/src/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
└── dashboard.service.ts
```

### Frontend

```
apps/ui/src/app/features/dashboard/
├── dashboard.module.ts
├── dashboard-routing.module.ts
├── pages/dashboard-page/
├── components/
│   ├── summary-bar/
│   ├── incident-banner/
│   ├── filter-bar/
│   ├── application-card/
│   ├── application-grid/
│   ├── detail-panel/
│   ├── status-badge/
│   ├── uptime-display/
│   ├── active-users-counter/
│   ├── contact-card/
│   ├── contact-directory-panel/
│   └── incident-modal/
├── services/dashboard.service.ts
├── models/dashboard.models.ts
└── types/dashboard.types.ts
```

### Shared

```
libs/shared/api/src/model/application.ts
libs/shared/api/src/model/incident.ts
libs/shared/api/src/model/team.ts
libs/shared/api/src/model/uptime.ts
```

### Database

```
db/seed-dashboard-data.ts
```

---

## 11. Verification Checklist

| #   | Check                           | Method                                                     |
| --- | ------------------------------- | ---------------------------------------------------------- |
| 1   | Zero lint errors                | `npm run lint`                                             |
| 2   | Code formatting                 | `npm run format`                                           |
| 3   | Unit tests pass with coverage   | `npm test` — target 95% statements/lines                   |
| 4   | API starts without errors       | `npm run start:api`                                        |
| 5   | UI starts without errors        | `npm run start:ui`                                         |
| 6   | Dashboard loads at `/dashboard` | Browser — 12 apps visible in grid                          |
| 7   | Cards sorted worst-first        | RED (SAP ERP) → AMBER → GREEN                              |
| 8   | Filter by status works          | Select "RED" → only SAP ERP visible                        |
| 9   | Search works                    | Type "SAP" → SAP ERP card appears                          |
| 10  | Detail panel opens              | Click "View Details" → slide-out with full info            |
| 11  | Uptime displayed correctly      | 24h/7d/30d/90d percentages shown                           |
| 12  | Contacts displayed              | App owner, on-call, vendor visible                         |
| 13  | Incident banner visible         | Active Sev-1 for SAP ERP shown at top                      |
| 14  | Incident creation wizard        | Click "Raise Sev-1" → 3 steps → confirm → incident created |
| 15  | Status auto-transitions         | After incident creation, app status = RED                  |
| 16  | Manual override works           | Override SAP ERP to GREEN → reflected in grid              |
| 17  | Auto-refresh updates            | Data refreshes every 60 seconds                            |
| 18  | Okta auth required              | Unauthenticated request returns 401                        |
| 19  | Contact directory               | Accessible from nav → shows on-call + escalation           |
| 20  | Toast notifications             | Incident created → success toast appears                   |

---

## 12. Design References

- Architecture document: `docs/dashboard-architecture.md`
- HTML prototypes: `prototype/demo.html` (main dashboard), `prototype/detail.html` (detail panel),
  `prototype/portfolio.html` (portfolio view)

---

## 13. Key Decisions

| Decision                                     | Rationale                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Keep Angular (not React as in design doc)    | Existing project template; team expertise; Polaris Blueprint compliance              |
| Keep MongoDB (not PostgreSQL/TimescaleDB)    | Already provisioned; adequate for MVP scale; avoids infrastructure changes           |
| REST polling (not WebSocket)                 | Simpler for prototype; adequate at 60s intervals; WebSocket added in Phase 2         |
| Local incident creation (no ITSM sync)       | Eliminates external dependency for MVP; ServiceNow adapter added in Phase 2          |
| Mock/seed data for MVP demo                  | Enables demo without external system access; production sources remain PlanView EA, Datadog, app.komodor.com, ServiceNow, and Microsoft Teams |
| Keep existing Tasks feature                  | Preserves template reference; non-conflicting routes                                 |
| Any authenticated user can create incidents  | Simplifies MVP; proper RBAC deferred to Phase 3                                      |
