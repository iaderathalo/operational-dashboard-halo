---
title: 'Operational Dashboard — Phase 1 Proposal (Live Health)'
audience: 'Anton Novikov (owner/TPM), Rami (senior stakeholder), Bernardo (build lead)'
status: 'for review'
date: 2026-06-16
---

# Operational Dashboard — Phase 1: Live Health

**For:** Anton Novikov (owner / TPM) and Rami (senior stakeholder) — with Bernardo (build lead)
**From:** Iader (dev), on behalf of the delivery team **Date:** 2026-06-16

---

## 1. TL;DR — what is live now

The Health half of the dashboard is **real**. It no longer runs on static data; it runs on live
Datadog telemetry.

- **Real Datadog health for 651 apps.** Every monitored application's status, uptime, and error
  budget is computed from live Datadog monitors and SLOs, written to our own database, and read
  straight from there by the dashboard. Breakdown today: **GREEN 561, AMBER 49, RED 41**, with ~190
  apps carrying real SLO-backed uptime.
- **Mercer Intellify is GREEN at 99.99% uptime** — live, mapped, and on screen. This matters because
  the team previously believed Intellify had no monitors; it does (see §3).
- **Portfolio reorganized** to a business-aligned tree rooted at Operating Company → Business Unit →
  LOB, exactly as Rami asked — no more grouping by TPM.
- **Validated live with Raja (2026-06-16).** A working end-to-end demo confirmed the pipeline:
  Health + Uptime are live from Datadog for mapped apps — verified on IntelliFi and on "High Value
  Care Analysis Platform" (HVCAP), with ~3 apps in Anton's portfolio returning data. What used to be
  dummy now comes from Datadog itself.
- **Ready for the Rami demo.** The Phase-1 priority Anton set — Overview + Health tabs from real
  Datadog data for the US Consulting apps (Fiber, Beacon, VIP, IntelliFi) — is delivered. Last full
  crawler run: **3656/3656 monitors fetched, 0 errors, 651 apps mapped, ~157s.**

What is **not** yet built: the User Perception score. Its mechanism is now defined (§4), but it is
the next discovery, not a Phase-1 deliverable.

---

## 2. Portfolio reorganization — OpCo → Business Unit → LOB

Per Rami's direction ("group by LOB, not TPM"), the portfolio tree is reorganized into the hierarchy
the org actually runs on:

```
Operating Company  (Mercer / Marsh / Oliver Wyman / Guy Carpenter / CIS / MMC)
  └─ Business Unit
       └─ Line of Business (LOB)
            └─ Applications
```

The grouping is derived from **PlanView's own structured fields** (`OpCo`,
`BusinessDeliveryPortfolioName`) that the data loader now preserves — **not** a hardcoded taxonomy
and **not** name-pattern bucketing. An earlier regex-bucketing spike (and a single "US Consulting"
bucket) was a throwaway and has been replaced.

**Principle:** the tree uses the source's structured identifiers. There is no business taxonomy
living in the code, so regrouping an app is done at the source (PlanView), never by editing a table
in the repo. The previous TPM-based grouping is gone.

---

## 3. Datadog integration

### 3.1 The automatic app→Datadog bridge (no manual curation)

The original plan assumed someone would hand-curate a Datadog service ID per app. **That is not
needed.** Two identifiers already exist on **both** sides and connect each app to its telemetry
automatically:

| Bridge   | Datadog tag      | PlanView field                   | Role                               |
| -------- | ---------------- | -------------------------------- | ---------------------------------- |
| Primary  | `app_short_key`  | `castKey` (== `shortCode`)       | tried first; ~646 apps             |
| Fallback | `app_service_id` | `serviceNowKey` (`SNSVC#######`) | tried if primary misses; ~387 apps |

The resolver tries `app_short_key` first, then falls back to `app_service_id`. No stored per-app
service ID, no manual mapping step, no namespace+name fallback. (An optional `datadogServiceId`
override exists for edge cases but is not the mapping mechanism.)

**This was validated exhaustively**, not assumed. A brute-force coverage probe ran over **all 104
Datadog tag namespaces × every PlanView ID field**. Only two pairs are valid per-app bridges
(roughly one value per app): `app_short_key`↔`castKey` and `app_service_id`↔`serviceNowKey`.
Everything else — `business_unit` (only 7 distinct values), `team`, `service`, `servicenow_chg`
(those are CHANGE tickets) — is group-level or coincidental and is explicitly **not** used to map an
app.

**The "Intellify has no monitor" belief was a false alarm.** Intellify (and apps like it) looked
monitor-less only because the team was checking the ServiceNow key, which is **null** for those
apps. Intellify actually has monitors under `app_short_key` — proven live: **GREEN, 99.99% uptime.**
Beacon **does** have monitoring too (an earlier assumption that Beacon had no monitors was wrong,
confirmed in the 2026-06-16 Raja sync) — its mapping is to be picked up with Juan, who owns Beacon
monitoring, for the right `app_short_key`.

### 3.2 The bulk-fetch crawler (rate-limit-safe, decoupled)

The first cut polled Datadog per app. At our scale that issued **~3656+ calls per run** and tripped
Datadog's 429 rate limits — observed live as **13 failures, only 521/651 apps mapped.**

The crawler now takes a **single bulk-fetch snapshot per run**:

1. Page `GET /api/v1/monitor` **once** for all monitors, indexed by every tag.
2. Page `GET /api/v1/slo` **once**, keeping only `app_short_key`/`app_service_id`-tagged SLOs.
3. Fetch each kept SLO's **24h / 7d / 30d** history under bounded concurrency (6), with 429 backoff
   honoring `Retry-After`.
4. Resolve **every app with purely local lookups — zero Datadog HTTP per app.**

Datadog call volume now scales with the **monitor/SLO catalog size, not the app count**. Live re-run
after the change: **3656/3656 fetched, 0 errors, 651 mapped, ~157s.**

It is **decoupled and replica-safe by construction.** A Kubernetes CronJob (`apps/crawler`) triggers
`POST /api/v1/internal/sync/datadog` (shared-secret guarded, timing-safe token compare) on a
schedule — **nobody runs it by hand.** The API computes health and writes Mongo; **the dashboard
reads only Mongo.** If Datadog has a bad day, the dashboard degrades to _stale_, never _broken_.
(This is ADR-001's recommended Option B — a CronJob over an in-process poller or webhooks — chosen
because it is the only option that is replica-safe without extra lock infra and produces the full
snapshot we actually render.)

Write-path safety worth noting: health is persisted via a Mongo `$set` of **only** the health
fields, so a crawler write never clobbers `name` / `tier` / `statusOverride`; a manual
`statusOverride` always wins; unmapped apps stay **grey** (gated on `datadogMapped`), never a false
amber; an unknown monitor state fails safe to amber; a non-array Datadog body throws rather than
laundering an outage into a green/amber signal.

### 3.3 Coverage: 651 of 3656 — and why that is the right number

651 of 3656 apps have Datadog monitors today. The other ~3000 simply **have no monitors yet** — they
render as Unmapped/grey, honestly, never as a fabricated green.

**Creating monitors is the owning app team's / SRE's job, not the dashboard's.** The dashboard
**surfaces** monitoring; it does not create it. Coverage grows as teams instrument their apps. We
deliberately measure the _honesty_ of the mapped/unmapped split rather than chasing a coverage
percentage — a wrong mapping that shows a confident green is worse than an honest grey.

---

## 4. User Perception — mechanism defined, build is next

User Perception was previously undefined. The **mechanism is now defined**; the **values are the
next discovery** (owned by Raja, with Tanu for IntelliFi specifics). Nothing here is built in
Phase 1.

**The "bank analogy."** An app can be fully _up_ (Health green) yet _feel_ broken because a key
operation is far slower than it should be. So perception is measured per operation, independent of
Health:

1. Per app, identify the **2–4 operations users really perform** (IntelliFi: upload census file;
   generate a specific report).
2. For each, identify the **backing API** and set a **response-time threshold** against a
   **baseline**.
3. If actual response time is far above baseline (e.g. baseline 8.1s, actual 47s), perception is
   **`critical`** — even when Health is green.

The perception screen will show, per operation: **operation / current response time / baseline /
ok-vs-critical**, in a **separate tab after Overview + Health**. The next step is the discovery of
the actual operations, baselines, thresholds, and data source (Datadog operation-timing logs vs.
Pendo) with Raja and Tanu.

---

## 5. Open decisions for Anton

We have working defaults for each of these; we are asking you to confirm or redirect.

1. **Canonical app identifier — `app_short_key` or `app_service_id`?** We support **both** (primary
   then fallback) and don't strictly need a single canonical choice, but if there is an org-wide
   preference for which is authoritative, it would simplify auditing. Our recommendation:
   `app_short_key` as primary (it covers more apps), `app_service_id` as fallback.
2. **Which Overview / Health cards?** You gave the devs flexibility to choose cards from whatever
   Datadog actually exposes (uptime, incidents-in-last-30-days, etc.), with **Bernardo deciding the
   key cards.** First sliver shows what Datadog gives; we fine-tune after. The retired "number of
   active users" card (confirmed out — Datadog has no such metric) is replaced under this latitude.
   We need Bernardo's pick of the headline cards. Note that live-vs-dummy is **per card**: today
   only **Health + Uptime** are live from Datadog; the other Overview cards are still placeholders.
   The directive (confirmed with Raja, 2026-06-16) is to replace those dummy cards with real
   Datadog-sourced data where it exists and drop/replace the ones we cannot source (e.g. total
   external users); Perception stays out of scope.
3. **Perception thresholds.** The mechanism is set; the operations, baselines, and ok/critical
   thresholds need to be defined **with Tanu** (IntelliFi) and Raja. This unblocks the Phase-2
   perception build.

---

## 6. What's next — immediate task, roadmap, and the deployment dependency

**Immediate task (from Anand, via Raja).** Focus the next push on **one good-data app — IntelliFi**
— as the demoable proof for the Anand meeting. Pulling additional cards/apps is welcome, but
IntelliFi alone is a decent start. Concretely this means making IntelliFi's Overview as real as we
can: Health + Uptime are already live; swap its remaining dummy cards for Datadog-sourced data where
it exists (per §5.2).

**Enrichment roadmap — "what else to show."** A 2026-06-16 engineering pass mapped what more the
Datadog API can drive, in priority order: the **health-timeline** endpoint + render (FR-3, already
half-built — the snapshot write path exists); **monitor drill-down** (message / groups /
last-triggered); the **Downtimes API** to suppress false RED during maintenance; a derived
**maturity scorecard** (from has-monitor / has-SLO / SLO-passing / mapped / has-owner); the
**Incidents API** to fill today's static incidents field (caveat: needs the Incident Management
product); and **Service Catalog** for ownership / on-call / links (caveat: keyed on the `service`
tag, which our coverage probe showed is _not_ a clean per-app join here — probe before promising).
The full write-up — including the per-column live-vs-placeholder breakdown and the perception
discovery paths — lives in the repo-root working note `DATADOG-NEXT-STEPS.md` and should fold into
the backlog as Phase-1 enrichment / Phase-2 candidates.

**Deployment dependency (Bernie / Polaris).** Raja needs a **deployed, demoable link (not
localhost)** for the Anand meeting. The crawler/sync code is committed on branch
`feature/datadog-live-health` (commit `fc8f6da`), excluding the held-out `apps/crawler` CronJob and
local-dev-only files. Deploying to Polaris / MMC goes through the **unified pipeline** — a
`repository_dispatch` "devops-trigger" that ships the `api` and `ui` images via Helm to AWS. Iader
must coordinate with **Bernardo (Bernie)**, who owns the deployment know-how, push the branch, and
tag Raja / Prashant in the channel. **This is a real dependency and risk: Iader has not run a
Polaris deployment before.**

---

_Sources: the just-updated PRD (`prds/prd-operational-dashboard-halo-2026-06-13/prd.md`,
`updated: 2026-06-16`), ADR-001 (`architecture/adr-001-datadog-ingestion-pattern.md`), and this
session's live-tested implementation. Figures (3656/651, GREEN 561 / AMBER 49 / RED 41, ~190
SLO-backed, ~157s, Intellify 99.99%) are from the live crawler run, not estimates._
