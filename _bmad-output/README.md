# BMAD Output — Planning & Implementation Documentation

Planning and implementation artifacts produced with the BMAD method for the **Operational
Dashboard**. They document the product's intent, architecture, and decision history — and serve as
grounding context for GitHub Copilot / AI tooling working in this repo.

## Source of truth (as of 2026-06-26)

- **Azure DevOps (ADO) is the live backlog.** Epics, stories, and sprints are tracked there. ADO
  answers **what / when**.
- **These docs are reference documentation, not a live tracker.** They answer **why / how**.
- Treat `implementation-artifacts/sprint-status.yaml` and the per-story tracking as a
  **point-in-time snapshot**. If anything here conflicts with ADO, **ADO wins**.

## Layout

### `planning-artifacts/` — durable documentation (ages well; keep current)

- `briefs/` — product brief + addendum
- `prds/` — Phase-1 PRD, review rubric, decision log
- `architecture/` — crawler solution design, ADR-001 (Datadog ingestion pattern)
- `research/` — technical spikes (Datadog enrichment, Dremio/PlanView live source, synthetics,
  watchdog, card-sourcing & maturity, platform enhancement, market research)
- `epics-stories/` — phase backlogs (historical; **superseded by ADO** for tracking)
- `proposal-*.md`, `work-scope-reconciliation-*.md` — leadership-facing summaries

### `implementation-artifacts/` — execution records (snapshot; ADO is the live equivalent)

- `sprint-status.yaml` — sprint snapshot (**not live**)
- `stories/` — per-story implementation specs: the detailed "how" behind delivered and planned work
  (data contracts, mapping rules, acceptance criteria)

## BMAD framework (`_bmad/`) — not versioned

The BMAD tooling itself (`_bmad/`) is **not** committed — it is reproducible per environment, like
`node_modules`. Installed version: **6.8.0** (modules: `core`, `bmm`; optionally `bmb`, `cis`).

Install / update from the repo root:

```bash
npx bmad-method install
```

On networks where the external module registry is blocked, install `core` + `bmm` only. The
generated Copilot agent files (`.github/agents/`, `.agents/skills/`) are what get committed so the
Custom Agents are available to the team — not `_bmad/`.

## Conventions & hygiene

- **English only.**
- **No secrets/credentials** — architecture references only (token/Vault/etc. are described, never
  valued).
- **Raw meeting transcripts are intentionally not tracked** (excluded via `.gitignore`); only
  distilled docs live here.
- **Don't auto-commit every BMAD regeneration.** Sync the planning docs deliberately; let ADO own
  execution tracking so the two don't drift.

## Using these with Copilot

When working on a feature, point Copilot at the **PRD**, the relevant **architecture** doc, and the
matching **story spec** — they carry the grounded context (data contracts, mapping rules, prior
decisions) the code assumes.
