# Portfolio Visibility Dashboard — Architecture Document

> **Date**: 2026-05-19  
> **Status**: Active

---

## 1. High-Level Architecture

```
                          ┌───────────────────────┐
                          │     End Users          │
                          │  (Browser / NOC Wall)  │
                          └───────────┬───────────┘
                                      │ HTTPS
                          ┌───────────┴───────────┐
                          │     CDN / WAF          │
                          └───────────┬───────────┘
                          ┌───────────┴───────────┐
                          │     API Gateway        │
                          │  (Apigee: AuthN,       │
                          │   Rate Limiting)       │
                          └───────────┬───────────┘
                 ┌────────────────────┼────────────────────┐
                 │                    │                     │
        ┌────────┴──────┐   ┌────────┴──────┐   ┌─────────┴──────┐
        │ Dashboard API │   │ Incident API  │   │ Uptime/Metrics │
        │ Service       │   │ Service       │   │ Service        │
        └────────┬──────┘   └────────┬──────┘   └─────────┬──────┘
                 └────────────────────┼────────────────────┘
                          ┌───────────┴───────────┐
                          │     MongoDB Atlas      │
                          │  (Data Persistence)    │
                          └───────────────────────-┘
```

### MVP Simplifications

- REST polling (60s) instead of WebSocket real-time push
- Single NestJS process hosts all API modules (no microservice split)
- No message bus (Kafka deferred to Phase 2)
- No Redis cache layer (adequate at prototype scale)
- No external integration adapters (mock/seed data only)

### Target Production Data Sources

| Domain | Source System | Notes |
| ------ | ------------- | ----- |
| Portfolio hierarchy, TPM ownership, application catalog | PlanView EA | System of record from the CAI application export; normalized and filtered to `Status = In Production` for the first live dashboard pass |
| Application health | Datadog | Primary source for monitor, synthetic, APM, and optional RUM telemetry |
| Container health | app.komodor.com | Primary source for Kubernetes and container runtime health |
| Incident ticketing | ServiceNow | Ticketing system for incident lifecycle and operational updates |
| Collaboration alerts | Microsoft Teams | Primary collaboration channel for incident notifications and status broadcasts |

### Observed PlanView Export Contract

The current seed export at `db/PlanviewData_Dremio_CAI_Applications.json` contains 8,519 rows and 80 fields. The file is not valid JSON as stored because adjacent objects are missing commas, so the ingestion adapter must normalize `}{` into `},{` before parsing.

First-pass operational scope is limited to the 2,971 rows where `Status = In Production`. `Decommissioned`, `In Development`, and `Preserved / Archived` records remain in the source catalog but should not drive live health cards until a separate lifecycle view is designed.

For the first dashboard version, PlanView is used only for application metadata and ownership context:

| PlanView column | Dashboard usage |
| --------------- | --------------- |
| `InternalID` | Canonical `applicationId` for storage and joins |
| `ProductCode` | Immutable PlanView traceability key |
| `CASTKey` | Preferred `shortCode` and primary Datadog correlation tag |
| `ProductName` | Application display name |
| `LongDescription` | Detail-panel description |
| `BusinessDeliveryPortfolioName` | First-pass portfolio and business-unit grouping label |
| `DrTier` | SLA tier mapping |
| `PortfolioOwnerName`, `PortfolioOwnerEmail`, `BusinessOwner`, `ItOwner`, `ItOwnerEmail` | Ownership and contact metadata |
| `InternalUserCount`, `ExternalUserCount` | Registered-user baseline for impact estimation, not live usage telemetry |
| `Hosting`, `DataClassification`, `OwningOrganization` | Supporting context in detail views |

The current export does not support these as primary join keys:

- `CA_Application_UUID` is only partially populated and has duplicate values.
- `ServiceNowKey` and `SN_Sys_Id` are useful for ITSM traceability, not for primary telemetry joins.
- `TechnicalContact` and `TechnicalContactEmail` are empty in the current sample and should not be modeled yet.

---

## 2. Technology Stack

| Layer              | Technology             | Version            | Notes                                     |
| ------------------ | ---------------------- | ------------------ | ----------------------------------------- |
| **Runtime**        | Node.js                | v20                | LTS                                       |
| **Monorepo**       | NX                     | v19.4.1            | Build orchestration, affected analysis    |
| **Language**       | TypeScript             | v5.9               | ES2022 target                             |
| **Backend**        | NestJS (Express)       | v11.1.19           | Modular, DI-based                         |
| **Frontend**       | Angular                | v20.3.18           | Component-driven                          |
| **Database**       | MongoDB Atlas          | —                  | Native driver (mongodb package)           |
| **Authentication** | Okta OIDC              | —                  | @okta/okta-angular + @okta/jwt-verifier   |
| **Observability**  | Datadog (dd-trace)     | —                  | APM tracing                               |
| **Logging**        | Polaris Logger         | v5.7.50            | SIEM-compliant structured logging         |
| **API Docs**       | Swagger UI (OpenAPI)   | —                  | At `/api/openapi`                         |
| **Testing**        | Jest + Cypress         | v30.1.2 / v15.10.0 | Unit + E2E                                |
| **Linting**        | ESLint 9 (flat config) | —                  | Extends @mmctech-artifactory/polaris-base |
| **Formatting**     | Prettier               | —                  | Enforced via husky/lint-staged            |
| **Charts**         | ng2-charts (Chart.js)  | —                  | Sparklines, trend charts                  |

---

## 3. NX Monorepo Structure

| Project | Type        | Location        | Description            |
| ------- | ----------- | --------------- | ---------------------- |
| api     | Application | `apps/api/`     | NestJS backend         |
| ui      | Application | `apps/ui/`      | Angular frontend       |
| api-e2e | Application | `apps/api-e2e/` | API integration tests  |
| ui-e2e  | Application | `apps/ui-e2e/`  | UI E2E tests (Cypress) |

### Shared Libraries (`libs/shared/`)

| Library       | Import Alias                                    | Purpose                            |
| ------------- | ----------------------------------------------- | ---------------------------------- |
| config        | `@app/config`                                   | Centralized configuration          |
| api           | `@operational-dashboard/shared-api-model/*`     | DTOs/models shared between FE & BE |
| nestjs-utils  | `@operational-dashboard/shared-nestjs-utils`    | NestJS utilities                   |
| angular-utils | `@operational-dashboard/shared-angular-utils/*` | Auth interceptors, HTTP resilience |
| styles        | `@operational-dashboard/common-styles`          | Global SCSS                        |
| utils/cypress | `@operational-dashboard/shared-utils-cypress`   | Cypress helpers                    |
| utils/testing | `@operational-dashboard/shared-utils-testing`   | Jest helpers                       |

---

## 4. Backend Architecture (NestJS)

### Module Layout

```
apps/api/src/
├── main.ts                        # Entry point
├── server.ts                      # NestJS bootstrap (Express, CORS, Swagger)
├── trace.ts                       # Datadog tracing init
├── app/
│   ├── app.module.ts              # Root module
│   ├── app.controller.ts          # Root GET /api/v1
│   ├── app.service.ts
│   └── common/
│       ├── FormattedExceptionFilter.ts
│       ├── apiVersionHeader.ts
│       ├── cacheControlHeaders.ts
│       ├── auth-guards/
│       │   └── oktaGuard.service.ts
│       └── models/
├── health/                        # Health check module (Terminus)
├── tasks/                         # Task management (template feature)
├── applications/                  # NEW: Application registry + status
├── incidents/                     # NEW: Incident lifecycle
├── teams/                         # NEW: Teams & contacts
├── uptime/                        # NEW: Uptime & user metrics
├── dashboard/                     # NEW: Aggregate summary endpoint
└── repository/
    ├── repository.ts              # Generic Repository<T> interface
    └── mongo/
        └── mongo-repository.ts    # MongoDB base class (connection, Vault creds)
```

### Design Patterns

| Pattern              | Implementation                                                                  | Example                                  |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Repository           | `Repository<T>` interface → `MongoRepository` base → domain-specific class      | `TaskRepository` → `MongoTaskRepository` |
| DI (Provider Token)  | Named injection: `{ provide: 'TaskRepository', useClass: MongoTaskRepository }` | Swappable data store                     |
| Global Guard         | `APP_GUARD` with `OktaGuard`                                                    | All endpoints require JWT                |
| Module encapsulation | Each domain has own module registered in `AppModule`                            | `TasksModule`, `ApplicationsModule`      |
| Exception filter     | `FormattedExceptionFilter` for consistent error responses                       | Applied globally                         |
| Config validation    | Joi schema on `ConfigModule.forRoot()`                                          | Required env vars validated at startup   |

### API Endpoints

All prefixed `/api/v1`. Protected by Okta JWT. Consistent response envelope.

#### Applications

| Method | Endpoint                               | Description                                                             |
| ------ | -------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/applications`                        | List apps. Filter: `?status=RED&tier=1&businessUnit=Finance&search=SAP` |
| GET    | `/applications/:id`                    | Full application detail                                                 |
| GET    | `/applications/:id/status-history`     | Status change history                                                   |
| GET    | `/applications/:id/uptime`             | Uptime metrics: `?range=30d` (24h/7d/30d/90d)                           |
| GET    | `/applications/:id/user-count-history` | User count time series: `?range=24h`                                    |
| PUT    | `/applications/:id/status-override`    | Manual status override with reason                                      |
| DELETE | `/applications/:id/status-override`    | Clear manual override                                                   |

#### Incidents

| Method | Endpoint                 | Description                                             |
| ------ | ------------------------ | ------------------------------------------------------- |
| POST   | `/incidents`             | Create incident — auto-transitions app to RED for Sev-1 |
| GET    | `/incidents`             | List: `?status=OPEN&severity=SEV_1&applicationId=`      |
| GET    | `/incidents/:id`         | Detail with update timeline                             |
| PUT    | `/incidents/:id`         | Update status/assignment                                |
| POST   | `/incidents/:id/updates` | Add status update message                               |

#### Teams & Contacts

| Method | Endpoint                     | Description                         |
| ------ | ---------------------------- | ----------------------------------- |
| GET    | `/teams`                     | List all teams                      |
| GET    | `/teams/:id/on-call`         | Current on-call contacts for team   |
| GET    | `/applications/:id/contacts` | Support contacts for an application |

#### Dashboard Summary

| Method | Endpoint             | Description                                            |
| ------ | -------------------- | ------------------------------------------------------ |
| GET    | `/dashboard/summary` | Total apps, counts per status, total users, 30d uptime |

---

## 5. Frontend Architecture (Angular)

### Module Layout

```
apps/ui/src/
├── main.ts
├── index.html
├── styles.scss
├── app/
│   ├── app.module.ts
│   ├── app.component.ts
│   ├── app-routing.module.ts
│   ├── okta-callback/
│   ├── features/
│   │   ├── dashboard/               # NEW: Portfolio Visibility Dashboard
│   │   │   ├── dashboard.module.ts
│   │   │   ├── dashboard-routing.module.ts
│   │   │   ├── pages/
│   │   │   │   └── dashboard-page/
│   │   │   ├── components/
│   │   │   │   ├── summary-bar/
│   │   │   │   ├── incident-banner/
│   │   │   │   ├── filter-bar/
│   │   │   │   ├── application-card/
│   │   │   │   ├── application-grid/
│   │   │   │   ├── detail-panel/
│   │   │   │   ├── status-badge/
│   │   │   │   ├── uptime-display/
│   │   │   │   ├── active-users-counter/
│   │   │   │   ├── contact-card/
│   │   │   │   ├── contact-directory-panel/
│   │   │   │   └── incident-modal/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── types/
│   │   ├── task-management/          # Existing template feature
│   │   ├── home/
│   │   └── gallery/
│   └── shared/
├── assets/
└── environments/
```

### Key Patterns

- **Lazy loading**: Feature modules loaded on route activation
- **Service layer**: Injectable services with Observable-based HTTP calls
- **Auth interceptor**: Bearer token auto-injected via shared angular-utils
- **HTTP resilience**: Retry interceptor for transient failures
- **Environment config**: API base URL from `environments/environment.ts`
- **Polling**: `interval(60000)` + `switchMap()` for auto-refresh
- **State**: Component-local state (no NgRx for MVP)

### Routes

| Path                         | Module               | Description              |
| ---------------------------- | -------------------- | ------------------------ |
| `/dashboard`                 | DashboardModule      | Main dashboard (default) |
| `/dashboard/application/:id` | DashboardModule      | Deep-link to app detail  |
| `/tasks`                     | TaskManagementModule | Existing task CRUD       |

---

## 6. Data Model

### MongoDB Collections

#### `applications`

```typescript
interface Application {
  id: string;
  name: string;
  shortCode: string;
  planviewProductCode: string;
  castKey?: string;
  description: string;
  environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
  tier: 1 | 2 | 3 | 4;
  businessUnit: string;
  portfolioName: string;
  lifecycleStatus: 'IN_PRODUCTION' | 'IN_DEVELOPMENT' | 'DECOMMISSIONED' | 'ARCHIVED';
  currentStatus: 'GREEN' | 'AMBER' | 'RED';
  currentUserCount: number;
  registeredInternalUsers: number;
  registeredExternalUsers: number;
  monitoringSource: string;
  businessOwner?: string;
  itOwner?: string;
  itOwnerEmail?: string;
  portfolioOwnerName?: string;
  portfolioOwnerEmail?: string;
  dataClassification?: string;
  hosting?: string;
  owningOrganization?: string;
  datadogTags: {
    castKey?: string;
    planviewInternalId: string;
    planviewProductCode: string;
    environment: 'prod';
  };
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

`currentUserCount` remains a live telemetry field sourced from Datadog RUM or another runtime signal. `registeredInternalUsers` and `registeredExternalUsers` come from PlanView and are only used as static audience context for blast-radius estimates.

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

## 7. Integration Architecture

### Current (MVP)

| Integration    | Status | Implementation                               |
| -------------- | ------ | -------------------------------------------- |
| Okta OIDC      | Active | JWT verification on all API endpoints        |
| MongoDB Atlas  | Active | Native driver with Vault credential rotation |
| Datadog        | Active | dd-trace APM (disabled locally)              |
| Polaris Logger | Active | Structured SIEM logging                      |

### Future (Adapter Pattern)

Each external system will be accessed through a dedicated adapter implementing a common interface:

| Adapter Interface      | Methods                                                       | Target Systems                      |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `IPortfolioAdapter`    | `syncPortfolioHierarchy()`, `syncApplications()`, `syncOwnership()` | PlanView EA                    |
| `IMonitoringAdapter`   | `fetchHealthStatus()`, `fetchMetrics()`, `registerWebhook()`  | Datadog, app.komodor.com            |
| `IItsmAdapter`         | `createIncident()`, `updateIncident()`, `getIncidentStatus()` | ServiceNow                          |
| `IDirectoryAdapter`    | `lookupUser()`, `getGroupMembership()`, `syncTeamContacts()`  | Okta, Azure AD                      |
| `INotificationAdapter` | `sendAlert()`, `sendUpdate()`, `escalate()`                   | PagerDuty, Microsoft Teams, SMTP    |

### PlanView Ingestion Pipeline

1. Read the PlanView CAI export and normalize the missing object separators.
2. Filter to `Status = In Production` for the live operational dashboard.
3. Upsert the `applications` collection keyed by `InternalID`.
4. Persist `ProductCode` for source traceability and `CASTKey` as the preferred short code.
5. Parse `DrTier` into the internal numeric SLA tier.
6. Treat `BusinessDeliveryPortfolioName` as the first-pass grouping label for both portfolio and business-unit filtering until a separate hierarchy feed is available.

### Datadog Correlation Contract

Datadog is the main source of runtime telemetry. Every Datadog service, monitor, and synthetic check that should appear on the dashboard must expose the same application identity through tags.

Required Datadog tags:

- `cast_key:<CASTKey>` as the primary correlation tag
- `planview_internal_id:<InternalID>` as the stable fallback join tag
- `planview_product_code:<ProductCode>` as the audit and reconciliation tag
- `env:prod` for the first-pass monitored scope

Correlation order:

1. Join by `cast_key`
2. Fallback to `planview_internal_id`
3. Use `planview_product_code` only for reconciliation or manual exception handling

The dashboard should never correlate on `ProductName`. Datadog provides current health state, uptime windows, latency percentiles, error rate, open alerts, failing synthetics, and recent health events. PlanView continues to own lifecycle, tier, portfolio grouping, and ownership metadata.

---

## 8. Security Architecture

### Authentication

- Enterprise IdP via Okta OIDC
- JWT tokens verified on every request (`OktaGuard` as `APP_GUARD`)
- API Gateway (Apigee) provides first-line token validation and rate limiting

### Authorization (MVP)

- Any authenticated user can read all data
- Any authenticated user can create incidents and override status
- Fine-grained RBAC deferred to Phase 3

### Authorization (Future RBAC)

| Role        | Permissions                                                               |
| ----------- | ------------------------------------------------------------------------- |
| Viewer      | Read dashboard, view statuses/contacts/incidents                          |
| Operator    | + Create incidents, add updates, manual status override                   |
| Admin       | + Manage apps/teams/contacts, configure adapters, resolve/close incidents |
| Super Admin | + Manage roles, view audit logs, system configuration                     |

### Data Protection

- Security headers via Helmet
- CORS restricted to localhost + `*.oss2.mrshmc.com`
- All traffic: TLS 1.3
- PII (phone, email) stored in MongoDB with access restricted by role (future)

---

## 9. Status Definition Matrix

### Definitions

| Status    | Meaning                                                                   | Visual       |
| --------- | ------------------------------------------------------------------------- | ------------ |
| **GREEN** | All health checks passing, performance within SLA                         | Green circle |
| **AMBER** | Degraded performance OR partial outage, users impacted but service usable | Amber circle |
| **RED**   | Major outage, service unavailable or severely impacted                    | Red circle   |

### Transition Rules

| Transition    | Trigger                                         |
| ------------- | ----------------------------------------------- |
| GREEN → AMBER | Any health check below threshold for 2+ minutes |
| AMBER → RED   | Critical check fails OR incident declared       |
| RED → AMBER   | Primary function restored but not fully stable  |
| AMBER → GREEN | All checks passing for 5+ consecutive minutes   |
| Any → RED     | Sev-1 incident created (immediate override)     |

### Override Rules

- Worse-state override: Freely allowed (e.g., GREEN → RED)
- Better-state override: Requires reason text + audit trail
- Override auto-clears when incident is resolved (configurable)

---

## 10. Incident Management Workflow

### Sev-1 Lifecycle

```
OPEN → ACKNOWLEDGED → INVESTIGATING → MITIGATED → RESOLVED → CLOSED
```

### Creation Side Effects

1. Application status immediately set to RED
2. Health status record logged (source: MANUAL_OVERRIDE)
3. Incident number generated: `INC-{YYYYMMDD}-{seq}`

### Required Information at Initiation

- Application (selected or pre-filled)
- Title (concise summary)
- Description (detailed impact description)
- Business impact level (CRITICAL / HIGH / SIGNIFICANT)
- Estimated users impacted (auto-populated from current count)

---

## 11. Uptime Calculation

### Formula

```
Uptime % = ((Total Minutes - Downtime Minutes) / Total Minutes) × 100
```

### SLA Targets by Tier

| Tier   | Monthly SLA | Allowed Downtime/Month |
| ------ | ----------- | ---------------------- |
| Tier 1 | 99.95%      | ~22 min                |
| Tier 2 | 99.9%       | ~44 min                |
| Tier 3 | 99.5%       | ~3.6 hours             |
| Tier 4 | 99.0%       | ~7.3 hours             |

### Display Periods

- 24 hours, 7 days, 30 days, 90 days
- Color-coded: Green (≥SLA), Amber (SLA - 0.5%), Red (<SLA - 0.5%)

---

## 12. Component Library

### Status & Indicators

| Component          | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| StatusBadge        | Colored circle + text. WCAG compliant with pattern fill for colorblind users |
| UptimeDisplay      | Percentage with conditional color + sparkline chart                          |
| ActiveUsersCounter | Live count with trend arrow (↑/↓/→)                                          |
| RefreshIndicator   | "Last updated" timestamp + stale warning                                     |
| IncidentCountBadge | Red notification badge                                                       |

### Cards & Containers

| Component       | Description                                             |
| --------------- | ------------------------------------------------------- |
| ApplicationCard | Status stripe, app name, 3 key metrics, action link     |
| SummaryStatCard | Large number + label for aggregate metrics              |
| IncidentBanner  | Full-width red alert bar, persistent, with elapsed time |
| DetailPanel     | Right-side slide-out, 45% viewport, scrollable sections |
| ContactCard     | Name, role, clickable phone/email links                 |

### Forms & Actions

| Component         | Description                                   |
| ----------------- | --------------------------------------------- |
| IncidentModal     | 3-step wizard (Identify → Notify → Confirm)   |
| NotificationToast | Ephemeral alerts, auto-dismiss, max 3 visible |

### Responsive Breakpoints

| Breakpoint  | Cards/Row | Detail Panel       | Notes                |
| ----------- | --------- | ------------------ | -------------------- |
| 1920px+     | 4         | Side panel         | NOC wall optimized   |
| 1280-1919px | 3         | Side panel (45%)   | Primary working view |
| 768-1279px  | 2         | Full-width overlay | Condensed summary    |
| <768px      | 1 (list)  | Full-screen        | Mobile (future)      |

---

## 13. Deployment

### Docker Images

| Image        | Dockerfile                                   | Purpose           |
| ------------ | -------------------------------------------- | ----------------- |
| api          | `deployments/docker/Dockerfile.api`          | NestJS backend    |
| ui           | `deployments/docker/Dockerfile.ui`           | Angular + nginx   |
| db-execution | `deployments/docker/Dockerfile.db-execution` | Migration runner  |
| api-e2e      | `deployments/docker/Dockerfile.api-e2e`      | Integration tests |

### Infrastructure

- AWS deployment via Helm charts (`deployments/helm/`)
- Container orchestration: Kubernetes
- Rollout monitoring: 5-minute timeout
- MongoDB Atlas: Managed cloud database
- Vault: Credential rotation for database access

---

## 14. Development Commands

```bash
# Start services (requires nvm use 20)
npm run start:api          # NestJS backend (port 8080)
npm run start:ui           # Angular dev server (port 4200)

# Testing
npm test                   # All unit tests
npm run test:coverage      # Tests with coverage
npm run e2e                # Cypress UI E2E

# Code quality
npm lint                   # ESLint check
npm run eslint:fix         # Auto-fix
npm run prettier:fix       # Format with Prettier

# Build & Analysis
npm run dep-graph          # NX dependency graph
npm run affected:test      # Test affected projects only
npm run affected:lint      # Lint affected projects only
```

### Local API Startup

```bash
nvm use 20
APIGEE_ORGANIZATION=local-dev APIGEE_CLIENT_ID=local-dev npx nx serve api
```

---

## 15. Quality Standards

| Metric             | Threshold |
| ------------------ | --------- |
| Statement coverage | 95%       |
| Line coverage      | 95%       |
| Function coverage  | 90%       |
| Branch coverage    | 65%       |

---

## 16. Future Architecture (Phase 2+)

### User Perception Tracking

Each application will have TWO independent status dimensions:

1. **Application Health** (existing) — uptime scripts, APM, synthetic monitoring
2. **User Perception** (new) — performance of key features as reported by each app's
   `/ops/feature-health` API

### WebSocket Real-Time Push

Replace REST polling with WebSocket for sub-second status updates:

- `WS /ws/dashboard` — pushes `StatusChangeEvent`, `UserCountUpdate`, `IncidentEvent`
- Client sends subscription filters (e.g., only Tier-1 apps)

### External Integrations

- PlanView EA: Portfolio hierarchy, TPM ownership, and application catalog sync
- ServiceNow: Bidirectional incident ticket sync
- PagerDuty: On-call resolution + automated paging
- Microsoft Teams: Alert broadcasting
- Datadog: Automated application health ingestion
- app.komodor.com: Automated container health ingestion

### Infrastructure Scaling

- Redis cache for current status reads
- Kafka message bus for decoupling ingestion from processing
- OpenSearch for audit log indexing and full-text search
