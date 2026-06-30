---
title: 'Product Brief: Operational Dashboard (Portfolio Visibility Dashboard)'
status: final
created: 2026-06-12
updated: 2026-06-16
---

# Product Brief: Operational Dashboard (Portfolio Visibility Dashboard)

> CI name: PORTFOLIO VISIBILITY DASHBOARD · app key `operdas1` · Creator/owner: Anton Novikov (TPM,
> US Consulting / Health) Evidence base: the FW touch-point meeting transcript (authoritative), repo
> forensics, and the market research workflow. Companion docs:
> [creator intent dossier](../../research/creator-intent-dossier-2026-06-12.md),
> [market research report](../../research/market-operational-dashboard-research-2026-06-12.md), and
> `addendum.md`.

## Executive Summary

The Portfolio Visibility Dashboard answers one question for TPMs and business stakeholders in the US
Health portfolio: **are these applications healthy, and do their users feel that way?** Every app
(Mercer IntelliFi, Beacon, FIBER, VIP, and the wider portfolio) carries two independent
traffic-light signals — **Health** (standard infrastructure/server telemetry from Datadog) and
**User Perception** (how long the key business scenarios actually take versus their baseline).
Perception is the confirmed differentiator: Anton named it the product's unique feature in the
meeting, and the executive sponsor (Rami) stressed twice that it matters most because "other things
can be found in other applications, but user perception will be a unique feature for this one."

A working prototype already exists — built and maintained with GitHub Copilot ("wipe coding"),
deployed to the development region on MMC's unified pipeline, with production infrastructure (Okta,
Apigee, OSS2, Mongo Atlas) provisioned. It originally served static data behind a demo/real toggle.
The near-term job, while Anton is on vacation, has largely been delivered: the **Health and Uptime
signals are now live from Datadog** for mapped apps, ingested by a bulk-fetch sync that lives in
`apps/api` behind an internal token-guarded endpoint (the separate "crawler" CronJob auto-trigger is
built but held out pending Bernie). This was **validated live with Raja on 2026-06-16**. The
remaining Phase-1 focus is to **replace the still-dummy Overview cards with real Datadog-sourced
data** (immediate proof: IntelliFy, for the Anand demo) and ship a **demoable deployed link**;
perception stays a discovery-only track.

## The Problem

Knowing the state of a US Health portfolio app today means being an engineer with Datadog or Grafana
access. Those tools are built for technical staff; a TPM or business leader has no surface of their
own and relies on status assembled manually, per app, on request. Worse, infrastructure-green does
not mean the business is happy: an app can be healthy by every server metric while a report that
should take 8 seconds now takes 47, and users conclude it is broken. No existing tool surfaces that
perception gap for a non-technical audience.

## The Solution

A web dashboard showing the portfolio as a business-unit tree — rooted at Operating Company (Mercer
/ Marsh / Oliver Wyman / Guy Carpenter / CIS / MMC) → Business Unit → LOB → apps, with the US Health
apps grouped under "US Consulting" — where every app shows Health and Perception as green/amber/red,
and each drills down to detail — uptime, error budget, incident history, and the per-app scenarios
behind the perception score. The hierarchy is derived from PlanView's own structured fields (OpCo,
BusinessDeliveryPortfolioName), not a hardcoded taxonomy. NOC-wall-optimized (1920px+) for
continuous ops display.

Data flows in through the **sync pipeline**. The sync logic plus an internal, token-guarded trigger
endpoint (`POST /api/v1/internal/sync/datadog`) live in `apps/api` and are built and validated. The
app only reads Mongo. App-to-Datadog mapping turned out to be **automatic, not manual**: the bridge
is two identifiers already present on both sides — Datadog's `app_short_key` tag equals the PlanView
CAST key (the app's shortCode, the **primary** identifier), and Datadog's `app_service_id` tag
equals the PlanView ServiceNow key (`SNSVC#######`, the **fallback**). An exhaustive coverage probe
proved these are the only reliable per-app bridges; no service-ID is curated or stored. Ingestion is
a **bulk-fetch snapshot**: one run pages all monitors and SLOs once and resolves per-SLO history
under bounded concurrency (6, with 429 backoff), then resolves every app with purely local lookups
(zero per-app Datadog calls) — the per-app-polling design tripped Datadog rate limits and was
replaced. The separate `apps/crawler` Kubernetes CronJob (the auto-trigger that calls the internal
endpoint on a fixed interval) is **built but held out** of the commit/branch, pending Bernie's
validation that a CronJob is the right approach — the deliberate-not-in-app-cron rationale (replicas
firing duplicate concurrent writes) still drives that design.

## What Makes This Different

1. **Dual-signal health for a business audience** — infrastructure health _and_ user-perception
   health in one portfolio view. The market research found no IDP, observability platform, or
   service catalog that models perception for non-technical stakeholders.
2. **User Perception as first-class IP** — the timing of real business scenarios (census-file
   upload, report generation, dashboard load, Beacon "save session") measured against a baseline.
   Confirmed by both Anton and sponsor Rami as the product's reason to exist.
3. **Not another Grafana** — a stakeholder-facing read of "is this service healthy, how well is it
   responding, how many incidents," explicitly distinct from the engineer-facing dashboards it draws
   from.
4. **NOC-wall-first** — designed as a 24/7 operations surface, not a report.

## Who This Serves

- **Primary users:** TPMs and business-team members in US Health who need to see an app's status
  quickly and drill into what is wrong — without going through engineering.
- **Executive sponsor:** Rami — champions the perception dimension and requested the business-unit
  reorganization of the tree.
- **Org context:** Jory is Anton's supervisor and appears as a node in the portfolio tree.
- **Delivery team:** Bernardo (Bernie) leads the build and owns deployment know-how; Iader
  implements; Prashant and Nemi are the points of contact while Anton (creator) is on vacation; Raja
  is the business contact (perception track / Anand demo); Juan owns Beacon monitoring; **Anand** is
  the senior stakeholder the IntelliFy demo is being prepared for.

## Creator Intent — said vs. built vs. prepared

Anton's prototype runs ahead of his own stated roadmap. What he **said** (touch point): Datadog is
the immediate next step; Komodor is explicitly phase two; perception scenarios to be defined with
the business while he is away. What he **built**: perception already rendered as a live field
everywhere, real PlanView data behind a demo/real toggle, and detail-page tabs for AI tokens and
drift (he acknowledged "drift, we don't know how to calculate"). What he **prepared but did not
build**: a pre-staged resilient-HTTP library (the intended Datadog client), orphaned time-series and
incident-thread contracts, and a settings tab with UI but no behavior. The prototype is best read as
Anton's end-state mental model, not the current phase — a concept built to show what he believes the
business wants. The full evidence-cited reconstruction is in the intent dossier.

## Success Criteria

Anton's explicit definition of done for his return _(all three delivered)_:

- Health, uptime, and error budget for the target apps are computed from **live Datadog data** via
  the sync pipeline — no static data behind the Health signal. **Delivered:** the bulk-fetch sync
  maps **651 of 3656 apps** with 0 errors in ~157s; Health and Uptime are live from Datadog for
  mapped apps. **Validated live with Raja (2026-06-16):** the pipeline works end-to-end, confirmed
  on IntelliFy and "High Value Care Analysis Platform" (HVCAP), with ~3 apps in Anton's portfolio
  returning data; what was dummy before now comes from Datadog itself.
- Perception scenarios for IntelliFi and Beacon are **identified with the business** (via Raja, with
  Tanu for IntelliFi specifics) and a tracking approach is agreed — even if perception is not yet
  built. **Mechanism agreed** (response-time-vs-baseline → ok/critical); scenario values are the
  in-flight discovery deliverable.
- The portfolio tree is reorganized to **business-unit-root** (per Rami), not by person name.
  **Delivered:** rooted at Operating Company → Business Unit → LOB, from PlanView's structured
  fields.

Plus, as product guardrails: TPMs answer leadership status questions from the dashboard without
asking engineering, and the Perception signal never shows a color it cannot ground in data.

## Scope

**Done (prototype):** full UI on static data; portfolio tree; detail pages; SSO; dev-region
deployment; prod infra provisioned; real PlanView data behind a demo/real toggle.

**In — Phase 1 (while Anton is out):**

- Datadog integration via the sync pipeline: overall health status (monitor `overall_state`,
  worst-state-wins), uptime, error budget. **(Delivered — live for mapped apps; 651 of 3656 apps
  mapped today. The health-timeline read endpoint + UI render (FR-3) remain pending — the per-sync
  `HealthSnapshot` write path is done.)**
- Application-to-Datadog mapping — **resolved as automatic**, not manual: the existing
  `app_short_key`/`app_service_id` Datadog tags bridge to PlanView's CAST/ServiceNow keys, so no
  per-app service-ID is curated or stored. **(Delivered.)**
- **Replace the dummy Overview cards with real Datadog-sourced data** where available, and
  drop/replace any card we cannot source. Per Raja (2026-06-16), at the card level only **Health +
  Uptime** are live; the other ~7 Overview cards are still dummy. **Immediate task (from Anand, via
  Raja): focus on ONE good-data app — IntelliFy — as the demoable proof for the Anand meeting**;
  pull more cards if possible, but IntelliFy alone is a decent start.
- Tree reorganization to business-unit root, merging the scattered LOBs into "US Consulting."
  **(Delivered — now rooted at Operating Company → Business Unit → LOB, derived from PlanView's own
  structured fields.)**
- In parallel, **discovery only**: work with Raja/the business to identify the perception scenarios
  for IntelliFi and Beacon. The **mechanism** is now defined (per-operation response time vs.
  baseline → ok/critical); the per-app scenario values remain the discovery deliverable.

**Out / deferred:**

- Komodor integration (phase two, per Anton).
- Pendo (the approved tool for page-load and active-user metrics — phase two).
- **User Perception — explicitly out of the Phase-1 build (re-confirmed with Raja, 2026-06-16).** It
  remains a discovery track only; the score and AI-drift computation are not yet calculable (formula
  undefined).
- Number of active users — **confirmed out**: Datadog exposes no such metric, so the card is
  discarded and replaced with a meaningful Datadog-grounded one (e.g. incidents in the last 30
  days). Cards we cannot source at all (e.g. total external users) are dropped. The devs have
  flexibility to choose the Overview/Health cards from what Datadog actually exposes; Bernardo
  (Bernie) decides the key cards.
- Sev-1 incident wizard backend, and any action that changes infrastructure (recommended
  informational-only — see addendum).

**Engineering enrichment roadmap (what else to show):** a prioritized "what else can we surface from
Datadog" plan now exists — health-timeline endpoint+render (FR-3), monitor drill-down, Downtimes API
to suppress false RED, a derived maturity scorecard, Incidents API, and Service Catalog (each with
caveats). The full roadmap, plus the still-discovery user-perception technical path, lives in the
repo-root file `DATADOG-NEXT-STEPS.md` (to be folded into the PRD).

## Delivery & Deployment State

- **Branch/commit.** The validated work is committed on branch `feature/datadog-live-health` (commit
  `fc8f6da`), **excluding** `apps/crawler` and local-dev-only files. Scale throughout is **3656 apps
  / 651 mapped** — not the old "12 seed apps".
- **Held out pending Bernie.** The `apps/crawler` K8s CronJob (auto-trigger) is built but **not** in
  the commit/branch, awaiting Bernie's call on whether a CronJob is the right approach.
- **Deployment ask (Raja, for the Anand meeting).** Raja needs a **demoable DEPLOYED link** (not
  localhost). Iader must coordinate with **Bernie** for the Polaris / MMC unified-pipeline
  deployment — a `repository_dispatch` "devops-trigger" into the unified pipeline (api/ui images via
  Helm to AWS) — push the branch, and tag Raja/Prashant in the channel. **Iader has not run a
  Polaris deployment before → a real dependency/risk.**

## Open Questions

1. **Perception formula** — _mechanism resolved, values open._ The mechanism is now fixed: per app,
   pick the 2–4 operations users really do, find the backing API, and compare its current response
   time to a baseline (e.g. baseline 8.1s vs. actual 47s → "critical" even when Health is green).
   The screen shows operation / current response time / baseline / ok-vs-critical, on a separate tab
   after Overview + Health. Still open: which scenarios per app and the baseline/threshold values —
   discovery owned by Raja + Tanu.
2. ~~**Number of active users**~~ — _resolved: out._ Datadog has no such metric; the card is dropped
   and replaced with a meaningful Datadog-grounded one. (See "Out / deferred.")
3. ~~**Application-service-ID mapping**~~ — _resolved: automatic._ The mapping is not manual after
   all — Datadog's `app_short_key`/`app_service_id` tags already bridge to PlanView's CAST key
   (shortCode, primary) and ServiceNow key (`SNSVC#######`, fallback). No per-app service-ID is
   curated or stored. Re-confirmed live in the Raja demo: `app_short_key` works; the ServiceNow key
   is often null, which is exactly why `app_service_id` is only the fallback. (Note: apps believed
   to lack monitors, e.g. IntelliFy, actually have them under `app_short_key`; the team had only
   been checking the ServiceNow key, which is null for those apps.)
4. **Real vs. demo data** — the flat `applications` collection is real PlanView data (filtered by
   IT-owner) and the portfolio tree is the demo data; confirm whether real mode supersedes demo once
   Datadog is live, and that development can impersonate Anton/Jory to see assigned projects.
5. **AI tabs scope** — whether tokens/drift render for all apps or only those with AI features
   (currently FIBER-seeded only).
6. ~~**Beacon has no monitors**~~ — _resolved: Beacon monitoring DOES exist_ (2026-06-16). The
   earlier assumption that Beacon has no monitors and its team must create them was **wrong**.
   Action: coordinate with **Juan** (owns Beacon monitoring) for Beacon's `app_short_key` / mapping.

## Vision

If it succeeds, this becomes the default operational surface for the US Health portfolio and a
template for other MMC portfolios: live Datadog health, Komodor-grounded Kubernetes context,
Pendo-driven usage, a trusted per-app perception score, and forward-looking signals a stakeholder
actually wants — capacity forecasts, incident trends, and early warnings — in one business-facing
view.
