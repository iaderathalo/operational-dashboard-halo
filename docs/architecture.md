# Portfolio Visibility Dashboard - Architecture Overview

## Project: Polaris Blueprint Template (MMC/Marsh)

**App Short Key**: operdas1  
**Business Unit**: Mercer  
**Datastore**: MongoDB Atlas  
**CI/CD**: Unified GitOps Pipeline

---

## Architecture

### NX Monorepo Structure

| Project | Tech                 | Location        |
| ------- | -------------------- | --------------- |
| API     | NestJS v11 (Express) | `apps/api/`     |
| UI      | Angular v20          | `apps/ui/`      |
| API E2E | Jest                 | `apps/api-e2e/` |
| UI E2E  | Cypress v15          | `apps/ui-e2e/`  |

### Shared Libraries (`libs/shared/`)

| Library       | Alias                                           | Purpose                                       |
| ------------- | ----------------------------------------------- | --------------------------------------------- |
| config        | `@app/config`                                   | Centralized configuration management          |
| api           | `@operational-dashboard/shared-api-model/*`     | DTOs/models shared between frontend & backend |
| nestjs-utils  | `@operational-dashboard/shared-nestjs-utils`    | NestJS utilities                              |
| angular-utils | `@operational-dashboard/shared-angular-utils/*` | Auth interceptors, HTTP resilience            |
| styles        | `@operational-dashboard/common-styles`          | Global SCSS styles                            |
| utils/cypress | `@operational-dashboard/shared-utils-cypress`   | Cypress test helpers                          |
| utils/testing | `@operational-dashboard/shared-utils-testing`   | Jest test helpers                             |

---

## Tech Stack

- **Node.js**: v20
- **NX**: v19.4.1
- **TypeScript**: v5.9 (target ES2022)
- **Angular**: v20.3.18
- **NestJS**: v11.1.19
- **MongoDB**: Atlas (via native driver)
- **Auth**: Okta OIDC (@okta/okta-angular + @okta/jwt-verifier)
- **Observability**: Datadog (dd-trace) + @mmctech-artifactory/polaris-logger
- **Testing**: Jest v30.1.2 (unit), Cypress v15.10.0 (E2E)
- **Linting**: ESLint 9 (flat config, extends @mmctech-artifactory/polaris-base)
- **Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged

---

## Planned Data Sources

| Domain | Source System | Notes |
| ------ | ------------- | ----- |
| Portfolio hierarchy, TPM ownership, application catalog | PlanView EA | Source of metadata from the current `PlanviewData_Dremio_CAI_Applications.json` export; normalized before ingestion and keyed by `InternalID` |
| Application health | Datadog | Primary telemetry source for health, uptime, latency, error rate, failing checks, and health-event history |
| Container health | app.komodor.com | Planned source for Kubernetes and container runtime health |
| Incident ticketing | ServiceNow | Planned incident ticketing platform |
| Collaboration alerts | Microsoft Teams | Planned collaboration channel for incident notifications |

### PlanView Export And Datadog Correlation

The current PlanView seed file at `db/PlanviewData_Dremio_CAI_Applications.json` contains 8,519 records and 80 fields, but it is not valid JSON as stored because adjacent objects are missing commas. The ingestion path must normalize the export first, then filter to the initial operational scope of `Status = In Production` before upserting dashboard applications.

For the first integration pass we will keep only the metadata needed to identify, group, and route applications:

- `InternalID` as the canonical dashboard `applicationId`
- `ProductCode` as the immutable external PlanView traceability key
- `CASTKey` as the preferred `shortCode` and primary Datadog correlation tag
- `ProductName` and `LongDescription` for display
- `BusinessDeliveryPortfolioName` for portfolio and business-unit grouping
- `DrTier` for SLA tiering
- `PortfolioOwnerName`, `PortfolioOwnerEmail`, `BusinessOwner`, `ItOwner`, and `ItOwnerEmail` for ownership and contact metadata
- `InternalUserCount` and `ExternalUserCount` only as a registered-user baseline, not as live telemetry
- `Hosting`, `DataClassification`, and `OwningOrganization` as supporting context

The following exported fields are not strong enough to be first-pass join keys:

- `CA_Application_UUID` is only partially populated and not globally unique
- `ServiceNowKey` and `SN_Sys_Id` are useful for ITSM traceability, not primary telemetry joins
- `TechnicalContact` and `TechnicalContactEmail` are empty in the current sample and should be ignored

Datadog must provide the main operational telemetry for the dashboard. The preferred correlation order is:

1. `cast_key:<CASTKey>` on Datadog services, monitors, and synthetic tests
2. `planview_internal_id:<InternalID>` as the stable fallback tag
3. `planview_product_code:<ProductCode>` as the audit and reconciliation tag

The dashboard must not join PlanView and Datadog on `ProductName`, because the export shows business-facing names that can change over time. The attached recording only confirms that Datadog and PlanView are accessed through Okta SSO by operators; the integration itself should use export/API ingestion rather than UI automation.

---

## Backend (NestJS API)

### Structure

```
apps/api/src/
├── main.ts                    # Entry point
├── server.ts                  # NestJS app setup
├── trace.ts                   # Datadog tracing init
├── app/
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── common/
│       ├── FormattedExceptionFilter.ts
│       ├── apiVersionHeader.ts
│       ├── cacheControlHeaders.ts
│       ├── auth-guards/
│       └── models/
├── health/
│   ├── health.controller.ts
│   ├── health.module.ts
│   └── health-indicators/
├── tasks/
│   ├── tasks.controller.ts
│   ├── tasks.service.ts
│   ├── task.repository.ts
│   ├── schemas/
│   └── mongo/
└── assets/api/openapi.yaml
```

### Key Features

- Express server on `/api/v1` prefix
- Swagger UI at `/api/openapi`
- Security: Helmet headers, JWT verification via Okta
- CORS: Allows localhost and `*.oss2.mrshmc.com`
- Logging: Polaris logger middleware (SIEM compliant)
- Tracing: Datadog DD_TRACE
- Exception handling: Custom FormattedExceptionFilter

---

## Frontend (Angular UI)

### Structure

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
│   │   ├── gallery/
│   │   ├── home/
│   │   ├── task-management/
│   │   └── mmc-brand/
│   └── shared/
├── assets/
└── environments/
```

### Key Features

- Okta OIDC authentication with token management
- HTTP resilience with retry interceptor
- Custom auth interceptor (bearer token injection)
- SCSS with shared style library
- MMC branding micro-component integration

---

## Integrations

| Integration    | Purpose                   | Package                                |
| -------------- | ------------------------- | -------------------------------------- |
| Okta           | Authentication (OIDC/JWT) | @okta/okta-angular, @okta/jwt-verifier |
| Datadog        | APM/Tracing + operational telemetry | dd-trace                        |
| PlanView EA    | Portfolio metadata and ownership sync | Planned adapter                 |
| ServiceNow     | Incident ticket sync      | Planned adapter                        |
| Microsoft Teams | Operational notifications | Planned adapter                       |
| app.komodor.com | Container health ingestion | Planned adapter                      |
| Polaris Logger | Structured logging (SIEM) | @mmctech-artifactory/polaris-logger    |
| MongoDB Atlas  | Data persistence          | mongodb                                |
| Helmet         | Security headers          | helmet                                 |
| Swagger        | API documentation         | swagger-ui-express                     |

---

## Deployment

### Docker Images

1. `api` – Backend service
2. `ui` – Frontend service
3. `db-execution` – Database migration runner
4. `api-e2e` – API test container

### Infrastructure

- Deployed via **Helm charts to AWS**
- Rollout monitoring: 5 min timeout
- Helm configs: `deployments/helm/` (aws-api.yml, aws-ui.yml, aws-db-execution.yml, aws-api-e2e.yml)

---

## Development Commands

```bash
# Start services
npm run start:api          # NestJS backend
npm run start:ui           # Angular dev server (port 4200)

# Testing
npm test                   # All unit tests
npm run test:coverage      # Tests with coverage report
npm run e2e                # Cypress UI E2E tests

# Code quality
npm lint                   # ESLint check
npm run eslint:fix         # Auto-fix ESLint issues
npm run prettier:fix       # Format with Prettier

# Build & Analysis
npm run dep-graph          # NX dependency visualization
npm run affected:test      # Test only affected projects
npm run affected:lint      # Lint only affected projects
```

---

## Quality Standards

| Metric             | Threshold |
| ------------------ | --------- |
| Statement coverage | 95%       |
| Line coverage      | 95%       |
| Function coverage  | 90%       |
| Branch coverage    | 65%       |

---

## Business Feature

The primary business logic is a **Task Management** module:

- CRUD operations on tasks stored in MongoDB
- RESTful API endpoints under `/api/v1/tasks`
- Angular frontend with task-management feature module
- Repository pattern for data access
