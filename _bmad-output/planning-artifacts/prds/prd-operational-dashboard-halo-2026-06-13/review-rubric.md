# PRD Quality Review — Operational Dashboard Phase 1 (Live Health)

> ⚠️ **Point-in-time PRD review (2026-06-13).** Several findings here have since been **resolved or
> superseded** (e.g. the suggested LOB-normalization table was later dropped; the app↔service
> mapping is now an automatic `app_short_key`/`app_service_id` dual-tag bridge, not manual
> curation). For the current state see the **PRD** and its `.decision-log.md`. Left intact as a
> dated QA record.

**PRD:** `_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`
**Addendum reviewed:**
`_bmad-output/planning-artifacts/briefs/brief-operational-dashboard-halo-2026-06-12/addendum.md`
**Repo spot-checked:** `apps/api/src/`, `libs/shared/api/src/`, `apps/ui/src/`, `prototype/`,
`docs/` **Review date:** 2026-06-13 **Context:** Phase 1 internal enterprise tool, brownfield,
fast-path authored, assumptions tagged.

---

## Overall Verdict

This is a well-authored fast-path brownfield PRD that earns its confidence level. It correctly
scopes Phase 1, grounds every claim in meeting evidence, uses inline assumption tagging
consistently, and produces genuinely testable FR consequences for most of its 14 requirements. The
main gaps are a thin uptime definition in FR-4 (no window specification, leaving the story author to
guess), a missing schema contract for the new Datadog-specific fields the Crawler must write
(applicationServiceId, unmapped state, crawlerLastSync), and an unresolved conflict between the
prototype's 90-day uptime window and Datadog's ~2-week retention limit. None of these are blockers
for architecture work, but two of them will cause story-authoring ambiguity if not resolved before
sprint planning.

**Grade: Good**

---

## Dimension Verdicts

| Dimension              | Verdict      | Rationale                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision-readiness     | **strong**   | Key decisions are made and documented: crawler-not-in-app-timer with explicit rationale, worst-state-wins rollup, No-Data = AMBER (in addendum, weak — see Finding 2), informational-only principle, BU-root tree. Open questions are correctly logged and owned.                                                                                                                  |
| Substance over theater | **strong**   | No filler sections. The §A–F Adapt-In blocks are concise and load-bearing. NFRs are operational (idempotent writes, replica-safe scheduling, read-path decoupling) not aspirational. UJs are grounded in named personas with concrete entry/exit states.                                                                                                                           |
| Strategic coherence    | **strong**   | Phase 1 scope is tightly bounded to "make the Health half real." Non-goals are precise and each has a rationale. The "not another Grafana" positioning is explicit. SM-C1 and SM-C2 counter-metrics show strategic awareness of the failure modes (false green, hidden staleness).                                                                                                 |
| Done-ness clarity      | **adequate** | Most FRs have testable consequences. FR-1 (single execution per tick, configurable interval, partial-run completion) and FR-6 (Crawler-stopped degrades to stale) are strong examples. Weaknesses: FR-4 defers window enumeration by reference to the prototype; FR-2's "documented rule covers no data" points nowhere in the PRD body; FR-9's "ingestion records" are undefined. |
| Scope honesty          | **strong**   | Non-goals are explicit, numbered, and correctly deferred (§5). The MVP scope table (§6.1/6.2) matches the feature sections without inflation. Assumptions are tagged inline and indexed in §9. The stage/prod blocker is honestly noted with the reason (Okta group onboarding).                                                                                                   |
| Downstream usability   | **adequate** | The PRD is usable for architecture and high-level story decomposition as-is. Story-level authoring will hit three gaps: the Crawler write schema is undefined (Finding 3), the uptime windows are underspecified (Finding 1), and the application enumeration for SM-1 is missing (Finding 5). The addendum is an appropriate companion document rather than redundancy.           |
| Shape fit              | **strong**   | Capability-spec shape is correct for a brownfield internal tool. Glossary is essential and accurate (all terms verified against the codebase). The PRD avoids prescribing architecture while giving enough operational constraints to guide it. The FR-14 discovery deliverable is correctly included as a tracked item without inflating it into a build requirement.             |

---

## Findings

### F-1 [HIGH] FR-4 (Uptime) has no window specification — consequence is untestable

**Location:** `prd.md §4.1 FR-4`

FR-4's testable consequence reads: _"Uptime is presented for the standard windows the prototype
already exposes, populated from live data."_ The prototype seed
(`apps/api/src/dashboard/seed/detail.seed.ts`) exposes 24h/7d/30d/90d windows. The PRD defers this
by reference rather than stating it, so a story author cannot write an acceptance test without
inspecting prototype code. Compare with FR-5 (Error Budget), which explicitly handles the no-SLO
fallback — FR-4 should be at least as explicit. There is also an unacknowledged conflict: 90d
exceeds Datadog's ~2-week retention window (stated in §C and addendum), which makes FR-4's
"populated from live data" promise impossible for the 90d window.

**Fix:** Add to FR-4's consequences: _"Uptime is populated for 24h, 7d, and 30d windows from
Datadog. The 90d window exceeds Datadog's retention limit — Phase 1 will either omit it or derive it
from Crawler-written historical records; decision required before story authoring."_ Move the 90d
question to §8 Open Questions.

---

### F-2 [HIGH] No-Data monitor state is a product decision in the addendum, not the PRD

**Location:** `prd.md §4.1 FR-2`; `addendum.md §Datadog integration shape`

FR-2 says _"a documented rule covers 'no data'"_ but does not state the rule. The addendum states
_"No Data → AMBER (product decision)"_ — but the addendum is technical depth for downstream
documents, not a place for product decisions. When story authors read the PRD, FR-2's consequence is
incomplete.

Additionally, the PRD has two distinct non-health states — "No Data" (mapped Application, monitors
return no data) and "unmapped/unknown" (FR-10, no Datadog identifier) — whose relationship is never
stated. Can an Application be both? If the fallback identifier (FR-9) also finds no data, which
state applies?

**Fix:** Inline the product decision into FR-2: _"A mapped Application whose monitors return No Data
is shown as AMBER (not unknown/grey). An unmapped Application (FR-10) is shown as a distinct
'unmapped' state — these two states are not interchangeable."_ Reference the addendum for the API
shape only.

---

### F-3 [HIGH] Crawler write schema is undefined — Application.ts has no serviceId, crawlerLastSync, or unmapped fields

**Location:** `prd.md §4.1–4.2`; `libs/shared/api/src/model/dashboard/Application.ts`

The existing `Application` interface has `monitoringSource: string` but no `applicationServiceId`,
`crawlerSyncedAt`, `crawlerRunStatus`, `unmapped` flag, or separate `healthStatus` (distinct from
the existing `currentStatus`). FR-6 requires the dashboard to read Health from the database, FR-7
requires last-sync time to be user-visible, FR-8 requires Service ID to be stored and used by the
Crawler, and FR-10 requires unmapped state. All of these imply schema changes that are product-level
decisions — not architecture decisions — yet the PRD specifies none of them.

Story authors cannot bound the data-model story, and the Crawler story has no defined write
contract. The PRD correctly defers the "how" to architecture, but the "what is stored" is a
product-level concern this PRD must address.

**Fix:** Add §G Data Contract (or a table in §B) naming the minimum new/modified fields: e.g.,
`applicationServiceId` (string | null), `crawlerSyncedAt` (datetime), `crawlerRunStatus` ('success'
| 'partial' | 'failed'), `healthStatus` ('GREEN' | 'AMBER' | 'RED' | 'UNMAPPED'), `resolutionPath`
('primary' | 'fallback' | 'unmapped'). Types are illustrative — the PRD should name them, the
architecture doc specifies the types.

---

### F-4 [MEDIUM] FR-13 Real-Mode impersonation lacks the enforcement mechanism

**Location:** `prd.md §4.3 FR-13`

FR-13 specifies that "development can impersonate an IT owner (Anton or Jory) to view assigned
projects" but does not state where this context is supplied (a query param? a JWT claim? a request
header?). The testable consequence correctly says an empty list is expected without valid IT-owner
context, but story authors cannot determine which layer enforces this or how the impersonation value
is passed.

**Fix:** Add: _"IT-owner context is supplied as [query param `itOwner` / JWT claim — confirm with
Prashant] and is the sole input to the PlanView filter; no fallback to the authenticated user's
identity is applied in Phase 1."_

---

### F-5 [MEDIUM] SM-1 has no enumerated application list — '100% of in-scope US Health Applications' is unverifiable

**Location:** `prd.md §7 SM-1 and SM-2`

SM-1 claims _"100% of in-scope US Health Applications"_ but the PRD names only IntelliFi, Beacon,
FIBER, and VIP as examples. The repo's seed data contains 12 apps with generic business units
(Finance, HR, etc.) — clearly placeholder data, not the real US Health portfolio. Without an
authoritative list, the delivery team cannot declare SM-1 complete (the denominator is unknown), and
SM-2's mapping coverage percentage is similarly undefined.

**Fix:** Add a Note to SM-1: _"The authoritative in-scope application list must be established with
Prashant/Nemi before SM-1 can be verified. Candidate list: IntelliFi, Beacon, FIBER, VIP, [+ others
confirmed by Prashant]. This list is separate from Open Q3 (Service IDs) — the list must exist even
for apps that cannot yet be mapped."_

---

### F-6 [MEDIUM] FR-12 LOB normalization table's storage location and ownership are undefined

**Location:** `prd.md §4.3 FR-12`

FR-12 lists example source LOB values and states _"normalization rules are data-driven/curatable,
not hardcoded per Application."_ This is the right product decision, but neither the PRD nor §8 Open
Questions identify where this mapping table lives (a new Mongo collection? a config file? a seeded
document?), who owns it post-Phase 1, or how it is initially seeded. Story authors will make
divergent choices without this guidance.

**Fix:** Add one sentence: _"The LOB normalization table is stored as a seeded Mongo collection (or
config file — team decision) and is editable without a code deploy. Initial seed values: {Health
North America → US Consulting, Health US/Canada → US Consulting, Mercer IT → US Consulting, Health &
Benefits → US Consulting}. Exact taxonomy beyond US Consulting confirmed with Rami/Anton (Open Q —
see §8)."_

---

### F-7 [LOW] Prototype file reference in mvp-implementation-plan.md is wrong — demo.html does not exist

**Location:** `docs/mvp-implementation-plan.md §12`; addendum.md §Repo-vs-docs contradictions

The addendum correctly flags this: _"prototype/demo.html referenced in docs, absent from repo."_ The
repo contains `prototype/detail.html` and `prototype/portfolio.html`. The mvp-implementation-plan.md
§12 still references the non-existent file. The PRD itself does not reference demo.html directly,
but UJ-1 and UJ-2 point developers to the prototype for context. Any story citing prototype
references will point to the wrong file.

**Fix:** The PRD body is clean. Add a sentence to §B: _"Prototype references:
prototype/portfolio.html (portfolio view) and prototype/detail.html (detail view). Note:
docs/mvp-implementation-plan.md §12 references a non-existent prototype/demo.html — use the above
files instead."_

---

### F-8 [LOW] FR-9 distinguishable fallback path cross-references undefined 'ingestion records'

**Location:** `prd.md §4.2 FR-9`

FR-9's second consequence: _"The fallback path is distinguishable from the primary path in ingestion
records (so coverage quality is auditable)."_ This is correct thinking, but "ingestion records" is
undefined in the PRD body. FR-7 establishes that Crawler runs are recorded, but the per-application
resolution granularity is not specified. Story authors may implement this at run-level (coarse) or
application-level (fine) without additional guidance.

**Fix:** Cross-reference: _"The per-application resolution path ('primary' | 'fallback' |
'unmapped') is recorded as part of each Crawler run's per-app result, as specified in the data
contract (§G — see Finding 3 fix)."_ This also ties FR-9 to FR-7 explicitly.

---

### F-9 [LOW] Perception encoding conflict is in a PM note, not §8 Open Questions — will not be actioned by Anton

**Location:** `prd.md §4.4 FR-14 (NOTE FOR PM)`

The note reads: _"the detail page already renders a continuous 0–100 perception gauge AND a
three-band light — these two encodings disagree."_ This is confirmed by the repo:
`detail-page.data.ts:327` sets `perceptionScore: 72` alongside `perception: 'amber'`, and
`prototype/detail.html` renders both a full SVG gauge (lines 1024, 2307–2320) and a traffic light.
This is a real Phase 2 design risk. It is correctly not a Phase 1 build item, but burying it in a PM
note rather than §8 Open Questions means it will not be on Anton's review checklist.

**Fix:** Confirm this is already captured in §8 Open Question 5 (_"Canonical perception encoding —
continuous 0–100 gauge vs. three-band light"_). If so, remove the PM note or replace it with a
reference: _"(See Open Q5 — assigned to Anton.)"_ If not yet in §8, add it.

---

## Summary Table

| #   | Severity | Finding                                                                           | PRD Location             |
| --- | -------- | --------------------------------------------------------------------------------- | ------------------------ |
| F-1 | HIGH     | FR-4 Uptime: no window enumeration; 90d vs. Datadog retention conflict unresolved | §4.1 FR-4                |
| F-2 | HIGH     | No-Data → AMBER is a product decision buried in addendum, not PRD                 | §4.1 FR-2                |
| F-3 | HIGH     | Crawler write schema (serviceId, syncedAt, unmapped) is undefined                 | §4.1–4.2, §B             |
| F-4 | MEDIUM   | FR-13 impersonation: enforcement mechanism/layer not specified                    | §4.3 FR-13               |
| F-5 | MEDIUM   | SM-1: no enumerated in-scope application list; denominator unknown                | §7 SM-1                  |
| F-6 | MEDIUM   | FR-12: LOB normalization table storage and ownership undefined                    | §4.3 FR-12               |
| F-7 | LOW      | docs/mvp-implementation-plan.md §12 references non-existent prototype/demo.html   | addendum §Contradictions |
| F-8 | LOW      | FR-9 fallback distinguishability cross-references undefined 'ingestion records'   | §4.2 FR-9                |
| F-9 | LOW      | Perception encoding conflict in PM note, not §8 Open Questions — will be missed   | §4.4 FR-14 Note          |

---

## Repo Fact-Check (Brownfield Accuracy)

| PRD/Addendum Claim                                      | Repo Fact                                                                                                                                         | Status                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `nestjs-utils` ResilientHttpService pre-staged          | `libs/shared/nestjs-utils/` exists                                                                                                                | CONFIRMED                                  |
| `monitoringSource: 'Datadog'` in seeds                  | `apps/api/src/applications/seed/applications.seed.ts` lines 13, 25, 37…                                                                           | CONFIRMED                                  |
| `portfolio.model.ts:13-14` has perception field         | `apps/api/src/dashboard/portfolio.model.ts:13-14` — `health` and `perception` fields present                                                      | CONFIRMED                                  |
| `detail.seed.ts:860` references `/ops/feature-health`   | Line 860: `endpoint: \`https://${app.id}.corp.com/ops/feature-health\``                                                                           | CONFIRMED                                  |
| `PolarisMetadata.json:23` `AIintegration: false`        | `PolarisMetadata.json`: `"AIintegration": false`                                                                                                  | CONFIRMED                                  |
| Prototype has gauge + traffic light (encoding conflict) | `prototype/detail.html` lines 1024, 2307–2320: SVG gauge present; `detail-page.data.ts:327` `perceptionScore: 72` alongside `perception: 'amber'` | CONFIRMED                                  |
| NX 19.4.1 / TS 5.4.5 in copilot-instructions            | Actual: NX 22.0.2, TS 5.9.2 (package.json)                                                                                                        | STALE DOCS — addendum correctly flags this |
| `prototype/demo.html` referenced in plan doc            | Only `prototype/detail.html` and `prototype/portfolio.html` exist                                                                                 | STALE DOCS — addendum correctly flags this |
| Application model has no applicationServiceId           | `Application.ts` confirmed — no such field                                                                                                        | CONFIRMED (supports Finding F-3)           |

All addendum contradictions that were flagged are confirmed by repo inspection. The PRD does not
directly depend on the stale docs, and correctly routes readers to the addendum for ground truth.
