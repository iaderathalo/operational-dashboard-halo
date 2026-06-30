# Story 5.7: Verify the dev deploy actually runs the DB migrations (not a manual load)

Status: ready-for-dev

## Story

As a developer, I want to confirm that the dev deploy runs the database migrations end-to-end
(`deploydb=true`) — not a manual data load — so that a fresh deploy provisions the schema/data
reproducibly and we are not silently depending on a one-off manual import.

## Context / Why

Carved out of `5-5` (deploy delivered). During `5-5` the dev data was loaded **manually** (via
`db/load-planview-applications.js`) before the auto-sync/migration path was proven, because the
unified-pipeline DB job was never confirmed to run. This story verifies the automatic path and
captures the deploy log as evidence.

## Confirmed mechanism (mapped 2026-06-19 → 2026-06-22)

The migration path **exists and is wired correctly**:

1. `.github/workflows/cicd.yml:113` job **`deploy_db`** → calls `mmctech/.../deployDB.yaml@v2.3` →
   launches a **K8s Job** (`WORKLOAD_KIND=Job` in `deployments/config/dev-db-execution.config`).
2. The Job runs `deployments/docker/Dockerfile.db-execution` → `deployments/docker/entrypointdb.sh`.
3. The entrypoint pulls **dynamic Mongo creds from Vault**, builds the `mongodb+srv://` URI from
   `API_MONGODB_API_DB_URL`, and injects it into **`migrations.json`** (`migrationsDir: db`,
   `migrationsCollection: migrations_changelog`).
4. **Env routing** (`entrypointdb.sh:271`): `cp env_script/*"$DEPLOY_ENV"* db/` — at build the
   `*_env_*` files are moved to `env_script/`; at runtime only the ones matching `$DEPLOY_ENV` (=
   `dev`) are copied back into `db/` and run via `MONGO_DB_CMD=npx mongo-migrate up` (= the
   `mongo-migrate-ts` bin). Both our migrations are `*_env_dev` so on a **dev** deploy they execute.
5. Only **`./db/*.ts`** is shipped into the image (`Dockerfile.db-execution:41`) — the stray
   committed compiled `db/1781040600000_..._dev.js` is **not** used by the deploy (it is build
   output; see hygiene note below).

## The 4 AND-ed gates (`cicd.yml:117-121`) and elimination

`deploy_db` only runs if **all** of:
`(deployToDev || main/development) && runDatabase=='true' && dbChangeDetected=='true' && isGitOps=='false'`.

| Gate                           | Verdict (2026-06-22)      | Evidence                                                                                          |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `deployToDev \|\| main/dev`    | ✅ pass                   | dispatched with "Deploy To Development Environment" checked                                       |
| `isGitOps=='false'`            | ✅ pass                   | `deployDEV` ran (the API deployed) — it also requires `isGitOps=='false'`, so GitOps is ruled out |
| `runDatabase=='true'`          | ✅ pass                   | `deploy-config.json` declares `"database":[{ "name":"db-execution","deploydb":true }]`            |
| **`dbChangeDetected=='true'`** | 🔴 **FALSE → root cause** | the pipeline's "Detect DB changes" step reported `db_changes_detected=false`                      |

## ROOT CAUSE — `db_changes_detected=false` on the runner

The unified pipeline ("Detect DB changes" step) computes:

```bash
changed_files=$(git diff --name-only HEAD^ HEAD)
db_changed=$(echo "$changed_files" | grep -E '^db/' || true)
if [[ -n "$db_changed" ]]; then db_changes_detected=true; else ... fi
```

In the run log the value reads `db_changes_detected=***`. **The
`\***`is the masked word`false`** — proof: line 10 (`db_changes_detected=true`) prints `true`in clear text, so "true" is not masked; the masked token must be the other boolean.`deploydb_destructive`is likewise`\*\*\*`(=false), consistent because its block only runs`if
db_changes_detected == "true"` and is therefore skipped.

**The paradox:** locally `git diff --name-only HEAD^ HEAD` on the current branch **does** include
`db/` files (`db/1781100000000_index_applications_env_dev.ts`, `db/load-planview-applications.js`) —
verified directly. Yet the runner gets an empty result → `false`. The branch has 3 commits, so
`HEAD^` exists in full history. The classic cause is a **shallow checkout** (`fetch-depth: 1`) in
the pipeline's detect step: on the runner `HEAD^` is not present, so the diff is empty and detection
falls to `false`. Notably, this repo's own `.github/workflows/check-db-scripts.yml` sets
`fetch-depth: 0` precisely to avoid this — the external `buildtest.yaml@gitOps_poc` detect step
apparently does not.

## Other findings

- 🔴 **Destructive load migration:** `db/1781040600000_load_planview_active_applications_env_dev.ts`
  `up()` does `collection.deleteMany({})` then re-inserts. Effects: (a) `check-db-scripts.yml` flags
  it destructive (greps `db/*.ts` for `deleteMany`); (b) sets `deploydb_destructive=true` (matters
  for prod promotion); (c) on dev it wipes + reloads `applications` from the 27 MB JSON each run.
  Datadog enrichment lives in `HealthSnapshot` / the read-time projection, **not** persisted on
  `applications`, so the reload is non-destructive to enrichment — but re-run a Datadog sync
  afterward to be safe.
- 🟡 **Manual-load vs changelog:** the manual loader populated data outside the migration framework,
  so `migrations_changelog` is likely empty → on the first real `deploy_db`, both migrations run
  (load wipes+reloads, index creates indexes), then are recorded so subsequent deploys skip them
  (unless `db/` changes again).
- 🟢 **Hygiene:** `db/1781040600000_..._dev.js` is **tracked compiled output** (its `.ts` source
  exists; only `.ts` is shipped). It should be removed from version control — and removing it
  doubles as a clean `db/` change for the experiment below.

## Fix / next steps

1. **Experiment (in our control + hygiene):** make a commit whose latest diff clearly touches `db/`
   — e.g. `git rm db/1781040600000_load_planview_active_applications_env_dev.js` (remove tracked
   build output) — push to `feat/il/datadog-live-health`, and re-dispatch `cicd.yml` with
   `deployToDev=true`.
   - ✅ If `deploy_db` now runs → open the Job log, confirm `npx mongo-migrate up` applies + records
     both migrations in `migrations_changelog`, capture the log → **5-7 done**.
   - 🔴 If `db_changes_detected` is still `false` → **definitively the external pipeline's shallow
     checkout** → escalate (see below).
   - ⚠️ The commit must be scoped to the `db/` change only — do **not** commit
     `apps/ui/.../environment.ts` `.gitignore`, `aws-api.yml`, or the BMAD artifacts.
2. **Escalation evidence (Bernie / platform):** _"The `buildtest.yaml@gitOps_poc` 'Detect DB
   changes' step runs `git diff --name-only HEAD^ HEAD` on a shallow checkout; locally that diff
   includes `db/` files but the runner reports `db_changes_detected=false`, so `deploy_db` is
   skipped. Fix: add `fetch-depth: 0` to that step's checkout, mirroring our
   `check-db-scripts.yml`."_
3. **Fallback (stopgap only):** run the migrations manually against dev Mongo to stay unblocked —
   but this does **not** satisfy 5-7's "verify the auto-run" goal; it is temporary while platform
   fixes the checkout.

## Verification checklist (to mark done)

- (a) Dispatch `cicd.yml` `deployToDev=true` from a `db/`-touching commit.
- (b) Confirm **"Deploy DB to Dev"** is GREEN, not skipped (and `db_changes_detected=true` in
  build_test).
- (c) Job log shows `npx mongo-migrate up` applying + recording migrations in
  `migrations_changelog`.
- (d) Confirm the load migration's reload is non-destructive to Datadog enrichment (it is, by
  design) and re-run a Datadog sync if data was just wiped/reloaded.

## References

- Sprint: `sprint-status.yaml` → `5-7-verify-deploy-db-migrations`. Carved out of `5-5`.
- Mechanism files: `cicd.yml`, `deployGitOps.yml`, `check-db-scripts.yml`, `deploy-config.json`,
  `deployments/config/dev-db-execution.config`, `deployments/docker/Dockerfile.db-execution` +
  `entrypointdb.sh`, `migrations.json`, `db/1781040600000_load_planview...ts`,
  `db/1781100000000_index_applications_env_dev.ts`.
- Memory: [[dev-deploy-and-sync]], [[deploy-env-var-wiring]]. Related blocker: `5-8` (egress).

## Dev Agent Record

### File List

- (verification story — no app code change; optional hygiene commit removes
  `db/1781040600000_..._dev.js`)
