# Data Mapping Rules

**Where every number on the dashboard comes from — and whether you can trust it.** For each card and
column this says, in plain terms: what it tells you, whether it's **real live data or sample data**,
how fresh it is, and (for engineers, in the right-hand columns) the exact source, calc, and API.

> **Read the left columns for the business answer; the right columns are the technical detail.** A
> business reader can stop where the table gets technical. One table, one source of truth.

This is a **trust artifact**: a card that isn't actually wired is labelled **Sample** here, with the
reason — we never dress up dummy data as real (same honesty rule the product uses: if we don't have
data we say so, we never guess "healthy").

## How to read this

- **"Real"** = the number is pulled live from our monitoring tool (Datadog) or the app catalog
  (PlanView) and refreshes on each sync.
- **"Sample"** = an example value to show the layout; not a real measurement (greyed out in the UI).
- **The colored dot** next to each card title in the app says the same thing at a glance (green dot
  = live, grey dot = sample) — hover it for the source.

## At a glance

The **backbone of the dashboard is real today**: an app's **health, uptime, maturity, ownership,
burn rate, and its recent health/activity history** all come from live Datadog signals and the app
catalog. The **richer per-app cards** — response time, error rate, AI usage, infra cost, incidents —
are still **sample data**. Not because they aren't built, but because the monitoring tool can only
tie those numbers to a specific app when the app is **"tagged"**, and today only **~0.1% of our
3,656 apps** are tagged that way. That's a **data-tagging gap to fix with the org, not a coding gap
on our side** — so we show a labelled sample instead of a misleading number. (Detail in _Why some
cards can't be real yet_, at the bottom.)

## Legend

| Mark                        | Plain meaning                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ✅ **Real**                 | Live data from monitoring (Datadog) or the app catalog (PlanView). Refreshes each sync.                       |
| ⚪ **Sample**               | Example placeholder; not a real number. Greyed out in the UI.                                                 |
| 🟡 **Coming soon**          | We can get it — needs a connector or credentials, no new infrastructure.                                      |
| 🟠 **Needs setup**          | Waiting on one prerequisite (e.g. a billing tag switched on by FinOps).                                       |
| ⛔ **Not yet for all apps** | The data exists in the tool but isn't linked to our apps (the ~0.1% tagging gap); shown as sample on purpose. |

## Keeping this current (the rule)

**When a card flips from Sample → Real (or its in-app tooltip ships), update its row** — the status,
freshness, source, calc, and API. Keep the wording aligned with the in-app tooltip so the doc and
the hover text never disagree. **Last updated:** 2026-06-23 · **Seeded from:** the card-sourcing
feasibility research + the in-app metric tooltips.

---

## Portfolio page

_The home screen: the app catalog rolled up by portfolio, with a table of every app._

| What you see                                 | What it tells you                                                              | Real or sample?    | How fresh | Source                     | How it's built                                                                                    | API (for engineers)                            |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ | --------- | -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Total Applications                           | How many apps are in this view                                                 | ✅ Real            | Each sync | App catalog (PlanView)     | Count of apps in scope                                                                            | `GET /dashboard/portfolio`                     |
| Portfolio Status (Green/Amber/Red/Undefined) | How many apps are healthy vs. not — "Undefined" = no data yet (we don't guess) | ✅ Real            | Each sync | Monitoring (Datadog)       | Tally of each app's health; missing → Undefined                                                   | `GET /dashboard/portfolio` (group by `health`) |
| Active Incidents                             | Count of open incidents                                                        | ⚪ Sample          | —         | ServiceNow — not connected | —                                                                                                 | would be ServiceNow Table API (planned)        |
| Top risks — areas to watch                   | Which portfolios to look at first                                              | ✅ Real            | Each sync | Monitoring + catalog       | Ranked by lowest coverage + lowest health, weighted by app count                                  | derived from `GET /dashboard/portfolio`        |
| Top risks — worst apps                       | The 5 riskiest apps right now                                                  | ✅ Real            | Each sync | Monitoring (Datadog)       | Health severity ×2 + burn-rate severity, top 5                                                    | derived from `health` / `burnRate`             |
| **Application** (column)                     | The app's name                                                                 | ✅ Real            | Each sync | App catalog (PlanView)     | Direct value                                                                                      | `app.name`                                     |
| **Health** (column)                          | Overall status of the app                                                      | ✅ Real            | Each sync | Monitoring (Datadog)       | Worst monitor status; missing → Undefined (never a false green)                                   | `app.health`                                   |
| **Maturity** (column)                        | How well monitored & owned it is (0–5)                                         | ✅ Real            | Each sync | Datadog + PlanView         | 1 point each: connected to Datadog, has a monitor, has an uptime target, meeting it, has an owner | `app.maturity`                                 |
| **Uptime** (column)                          | % uptime over 30 days                                                          | ✅ Real            | Each sync | Monitoring (Datadog SLO)   | Direct value; "Not monitored" when the app isn't connected                                        | `app.uptime`                                   |
| **Burn Rate** (column)                       | How fast it's using its allowed downtime budget                                | ✅ Real            | Each sync | Datadog SLO                | Budget-consumption rate vs the 30-day window (1.0x = on track)                                    | `app.burnRate`                                 |
| **Perception** (column)                      | (User-experience score)                                                        | ⚪ Sample (hidden) | —         | —                          | Hidden until defined                                                                              | `placeholderColumns.perception` (planned)      |
| **Total External Users**                     | External user count                                                            | ✅ Real            | Each sync | App catalog (PlanView)     | Direct value                                                                                      | `app.totalExternalUsers`                       |
| **Total Internal Users**                     | Internal user count                                                            | ✅ Real            | Each sync | App catalog (PlanView)     | Direct value                                                                                      | `app.totalInternalUsers`                       |
| **Active Users**                             | Currently active users                                                         | ⚪ Sample          | —         | —                          | —                                                                                                 | `placeholderColumns.activeUsers`               |
| **Incidents** / **Last Incident**            | Open incident count / most recent                                              | ⚪ Sample          | —         | ServiceNow — not connected | —                                                                                                 | would be ServiceNow Table API (planned)        |

---

## Detail page — Overview tab

_One application, opened. `GET /dashboard/portfolio/apps/{id}/detail` feeds the tiles;
`.../health-history` feeds the live history cards._

| What you see             | What it tells you                                | Real or sample?            | How fresh | Source                      | How it's built                                              | API (for engineers)                   |
| ------------------------ | ------------------------------------------------ | -------------------------- | --------- | --------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Uptime (30d)             | % uptime this month                              | ✅ Real                    | Each sync | Datadog SLO                 | Direct value; "Not monitored" if unconnected                | `.../detail` → `uptime`               |
| Error Budget             | How much downtime it can still afford this month | ✅ Real                    | Each sync | Datadog SLO                 | `(1 − target) × 30d × uptime%`                              | `.../detail` → `errorBudget`          |
| Perception Score         | User-experience score                            | ⚪ Sample                  | —         | —                           | —                                                           | static (planned)                      |
| Active Users             | Current users                                    | ⚪ Sample                  | —         | catalog / —                 | catalog value when present                                  | `.../detail` → `activeUsers`          |
| Open Incidents           | Open incidents                                   | ⚪ Sample                  | —         | ServiceNow — not connected  | —                                                           | (planned)                             |
| AI Tokens                | LLM/Copilot usage & cost                         | ⛔ Not yet for all apps    | —         | Copilot / LLM tooling       | No per-app figure exists (Copilot stops at team level)      | (per-app only if an app self-reports) |
| AI Drift                 | Model-drift signals                              | ⛔ Not yet for all apps    | —         | Datadog LLM monitoring      | Only exists for registered AI models                        | —                                     |
| Infra Cost MTD           | Cloud spend month-to-date                        | 🟠 Needs setup             | —         | Cloud billing (AWS/Datadog) | Needs a cost-allocation tag switched on by FinOps           | (planned)                             |
| Combined Status Timeline | Health over time (+ context bands)               | ✅ Real (health) / ⚪ rest | Each sync | Datadog (health) + sample   | Real health bars over a sample perception/incident backdrop | `.../health-history`                  |
| Feature Health Summary   | Per-feature health                               | ⛔ Not yet for all apps    | —         | —                           | No tool gives per-feature health from tags alone            | —                                     |
| Recent Activity          | Latest syncs & status changes for this app       | ✅ Real                    | Each sync | Our records (sync history)  | Built from the app's synced health history, newest first    | `.../health-history`                  |

---

## Detail page — Health tab

| What you see                | What it tells you                                    | Real or sample?         | How fresh | Source                          | How it's built                                                                                | API (for engineers)                             |
| --------------------------- | ---------------------------------------------------- | ----------------------- | --------- | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Health Status Timeline      | Green/amber/red over time                            | ✅ Real                 | Each sync | Monitoring (Datadog)            | Synced health re-windowed; gaps = missing syncs                                               | `.../health-history`                            |
| Uptime & Error Budget       | 30-day uptime + budget                               | ✅ Real                 | Each sync | Datadog SLO                     | Direct value + budget calc                                                                    | `.../detail`                                    |
| Datadog Monitors            | The monitors watching this app                       | ✅ Real                 | Each sync | Monitoring (Datadog)            | The linked monitors; "none mapped" when there are none                                        | `.../detail` → `monitors`                       |
| Response Time (P50/P90/P99) | Latency percentiles                                  | ⛔ Not yet for all apps | —         | Datadog APM                     | Trace metrics can't be linked to our apps (only the ~0.1% tagged)                             | —                                               |
| Error Rate                  | % of failed requests                                 | ⛔ Not yet for all apps | —         | Datadog APM                     | Same tagging gate as Response Time                                                            | —                                               |
| Recent Health Events        | When the app changed status, and for how long        | ✅ Real                 | Each sync | Our records (sync history)      | Differences between consecutive synced statuses                                               | `.../health-history`                            |
| Health Check Breakdown      | Synthetic uptime per check (login flows, API probes) | ✅ Real                 | Each sync | Monitoring (Datadog Synthetics) | Synthetic tests linked by app tag; 30-day uptime each, lowest first; paused / no-data flagged | `GET /synthetics/tests` + `POST /tests/uptimes` |

---

## Detail page — Other tabs

| Tab        | What it tells you            | Real or sample?         | Source                     | Note (for engineers)                         |
| ---------- | ---------------------------- | ----------------------- | -------------------------- | -------------------------------------------- |
| Perception | User-experience / NFR view   | ⚪ Sample               | —                          | Scope (NFR vs sentiment) undecided (planned) |
| AI Tokens  | LLM usage                    | ⛔ Not yet for all apps | Copilot / LLM tooling      | No per-app endpoint                          |
| AI Drift   | Model drift                  | ⛔ Not yet for all apps | Datadog LLM monitoring     | Instrumented AI apps only                    |
| Cost       | Cloud spend                  | 🟠 Needs setup          | Cloud billing              | Cost-allocation tag required (planned)       |
| Incidents  | Incident history             | ⚪ Sample               | ServiceNow — not connected | Needs a ServiceNow service account (planned) |
| Contacts   | Owners & contacts            | ⚪ Mostly sample        | App catalog (PlanView)     | Real owner fields where the catalog has them |
| Settings   | Preferences & alert channels | ⚪ Sample               | Local                      | UI state, not measured data                  |

---

## Why some cards can't be real yet (for engineers)

The recurring blocker is the **`service`-tag gate**: Datadog APM/incidents/trace metrics join to an
app only via the `service` tag, and only **~0.1% of our 3,656 apps** carry a usable one. Our
reliable bridges are **`app_short_key`** (primary) and **`app_service_id`** (fallback) — **anything
keyed off those is feasible; anything that only carries `service`/`env` is not** (trace metrics
carry only `env, service, version, resource, http.status_code, host`, and span tags can't be
promoted to primary tags). This is why Response Time, Error Rate, AI Tokens, AI Drift, and Feature
Health are NO-GO portfolio-wide — an org **data-tagging** ask, not our code.

**Sources of truth:** Datadog = live health/SLO/monitor signals, synced into our `HealthSnapshot`
store. PlanView (Dremio catalog) = app catalog, ownership, tiering, user counts. "Our records" =
series derived from `HealthSnapshot` (`buildHealthEvents` / `buildActivityFeed` /
`buildHealthTimeline`). Sample = `detail-page.data.ts` (`DETAIL_TEMPLATE`). **Refresh:** live rows
update on Datadog sync (today a manual `POST /api/v1/internal/sync`; a scheduled cadence is
planned), freshness shown via `lastSyncAt`. **Endpoints:** `GET /api/v1/dashboard/portfolio`,
`.../portfolio/apps/{id}`, `.../portfolio/apps/{id}/detail`,
`.../portfolio/apps/{id}/health-history`.

## Cross-references

- In-app tooltip wording (keep in sync):
  `apps/ui/src/app/features/dashboard/metric-descriptions.ts`.
- Surface inventory: `portfolio-page.component.{html,ts}` (`placeholderColumns`),
  `detail-page.data.ts` (`DETAIL_TABS`, `DETAIL_TEMPLATE`).
- Sibling data docs: `docs/datadog-planview-data-requirements.md`,
  `docs/datadog-dashboard-data-elements.md`, `docs/dashboard-architecture.md`.
- Planned follow-ups: ServiceNow incidents, infra cost, LLM recommendations, a scheduled refresh
  cadence, and an in-app source legend.
