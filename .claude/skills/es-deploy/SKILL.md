---
name: es-deploy
description: Reconcile the production Elasticsearch infrastructure (ingest pipeline, index and alias, PGSync schema and daemon, PostgreSQL views) to the state committed in the repository. Run after merging any change under elasticsearch/, or any time to detect and repair drift.
disable-model-invocation: true
---

# es-deploy: reconcile production Elasticsearch to the repository

The repository is the desired state. The live systems — the cluster, the deployed schema, the production database views, the PGSync daemon — are the actual state. This skill observes both, plans the difference, and applies it in a fixed order. Because it reconciles rather than replays a changelog, it is also the repair tool: it converges from any starting state, including drift nobody remembers creating.

Every procedure it references lives in `elasticsearch/README.md`, sections "Versioned indices and the alias", "Deploying a Schema Change", and "Configure the Ingest Pipeline" — read those first. The deletion probe lives in the pgsync-test skill. This file adds only the orchestration: what to observe, how to decide, and in which order to act.

## Hard rules

1. **Interactive only.** Refuse to run without a terminal that can confirm. Never run this skill headless, from cron, or inside a workflow.
2. **Deploy only released state.** `elasticsearch/` must be identical between `upstream/main` and `upstream/production` (the release sits in the middle of the sequence — if they differ, the plan states which steps wait for the release). The local checkout matches that state, with no uncommitted changes under `elasticsearch/`, and CI (the schema-invariants test) is green on it.
3. **Print the target triple before any write**: `ELASTICSEARCH_URL`, the resolved real index name, and the `DATABASE_URL` host+database. Nothing ties the index to the database; a mismatch looks like an ordinary run and corrupts the production index.
4. **The canonical order is fixed.** Observation decides *which* steps apply; it never reorders them: lint → pipeline → views → schema+daemon → bootstrap → verify → swap → cleanup. The phases of this file are in that order — execute top to bottom, never ahead.
5. **Never round-trip `schema.json` through a JSON parser.** The file is hand-formatted; edit it with targeted text substitutions only. The versioned index name lives in the repository `schema.json` and a rebuild bumps it by commit — there is no out-of-band stamping.
6. **Start with an env inventory.** State which file provides what before using any of it: the opencouncil `.env` provides the cluster URL, the ES API key (verify its *shape*: combined base64 vs id+secret pair — both formats have existed), and read-only DB URLs; the tasks host `.env` provides the daemon's `PG_URL` and `SCHEMA_URL`. Locate variables by name, never by line number — the file gets reshuffled.

## Phase 1 — Observe (read-only)

Collect the actual state. All credentials come from `.env` (cluster) and the tasks host (`ssh root@134.122.74.255`, container `opencouncil-tasks-pgsync-1`, `SCHEMA_URL` in `/root/opencouncil-tasks/.env`).

| What | Desired (repo) | Actual (live) |
|---|---|---|
| Alias → real index | logical name `subjects` | `GET /_alias/subjects`. If `subjects` is still a real index, the one-time alias transition (README) has not happened yet — every rebuild plan must include it |
| Ingest pipeline | `elasticsearch/pipeline.json` | `GET /_ingest/pipeline/strip-refs`, compare normalized JSON |
| Mapping | the `mapping` block in `schema.json` | `GET /<real-index>/_mapping`: field set and declared types, ignore `_meta` |
| Deployed schema | `schema.json` at the released ref | `curl $SCHEMA_URL` (serves the **production branch**), diff against `git show upstream/production:elasticsearch/schema.json` — and against `main` to see what a release would deploy |
| Views | `views.sql` | transactional dry-run on the production DB: `psql -c 'BEGIN' -f elasticsearch/views.sql -c 'ROLLBACK'` — a clean run means the file applies; an undefined-column error means a **pending migration dependency**; also compare the view list in `pg_views` |
| Daemon | running, pgsync ≥ 7.x | `ssh … docker ps`, `pip show pgsync` in the container; env is baked at container creation — `docker inspect` it, and use `--force-recreate` after any `.env` change |
| View ownership | every view owned by the migration user (`readandwrite`) | `SELECT viewname, viewowner FROM pg_views` — a view owned by anyone else blocks `views.sql` and future migrations |
| pgsync role membership | `pgsync` is a member of `readandwrite` | `SELECT pg_has_role('pgsync','readandwrite','member')` — bootstrap drops triggers, which requires table ownership |
| Default privileges | pgsync-created objects auto-grant the app | `SELECT * FROM pg_default_acl` — the rule that keeps `_view` readable across bootstraps (see README "Production roles") |
| PGSync redis | one `queue:<db>_<index>:*` set for the current index | inspect the keyspace (`redis-cli --scan`) before touching anything |
| Slots | one slot for the current index | `SELECT slot_name, active, wal_status FROM pg_replication_slots` on the production DB — flag slots for indices that no longer exist (they retain WAL forever) |
| Pending migrations | — | `git log $REMOTE/production..$REMOTE/main -- prisma/migrations/` plus a grep of those migrations for `DROP COLUMN`/`ALTER COLUMN` on tables the views read |

Print the full observation table before planning.

## Phase 2 — Plan

Derive the action set from the drift, then order it canonically:

- **No drift anywhere** → report "in sync", stop. This is a valid and common outcome.
- **The release is the middle of every schema-carrying sequence** (`SCHEMA_URL` serves the production branch): bridge views and pipeline changes go before it, daemon/bootstrap/swap after it. The plan states the split explicitly. If the views dry-run fails on a missing column, even the views wait: "views depend on a migration — release first, then re-run `/es-deploy`".
- **Mapping drift** (any kind — new fields, changed types, embedding or analyzer changes, dynamic-mapping damage) → **rebuild**: new versioned index `subjects-YYYY-MM` per the README's "Versioned indices and the alias". There is no in-place mapping path: the mapping block only applies at index creation, and a rebuild is cheap enough that maintaining a second path is not worth its hazards.
- **Pipeline drift** → `PUT` from `pipeline.json` (idempotent).
- **Deployed-schema drift** (SCHEMA_URL serves something other than the repo's released schema.json) → the schema travels by release; plan a release and a daemon recreate, never an out-of-band edit.
- **Views drift that changes the shape of a view the running schema references** → plan a daemon stop before applying views; the daemon comes back as part of the schema+daemon step.
- **A rebuild** additionally plans: bump the index name in `schema.json` by commit (+ release, since `SCHEMA_URL` serves production), delete the old index's `queue:*` redis keys by name (never `FLUSHALL` without inspecting the keyspace), bootstrap into the new index, verify it, alias swap, then drop the old slot and redis keys at the swap — the previous index itself stays for the validation window (Phase 7).
- **Views step is a bridge**: when issue #638 lands (view DDL through Prisma migrations), the apply-views step leaves this skill — only the drift check remains, and the release carries the views too.

Present the plan as a numbered list with the reason for each step.

## Phase 3 — Confirm

Show the plan and the target triple (rule 3). Proceed only on an explicit interactive yes. If any write targets an index other than the one the alias resolves to (rebuilds do), say so explicitly. State the **staleness window**: from the daemon stop until the alias swap, search serves the current index without updates — give the operator the expected span (bootstrap + verify + release) so they can time the run.

## Phase 4 — Execute

Run only the planned steps, always in this order:

1. **Lint** — re-assert the schema invariants (`npx jest src/lib/search/__tests__/schema-invariants.test.ts`). CI already guards this; the re-run is belt-and-braces for a stale checkout.
2. **Pipeline** — `PUT` from `pipeline.json` (README "Create or Update the Pipeline"), then verify with `_simulate`.
3. **Views** — apply `views.sql` to the production DB (daemon stopped first if planned).
4. **Schema + daemon** — the schema reaches the daemon from the production branch (merge → release), then recreate the daemon (`docker compose up -d --force-recreate pgsync` — a plain restart keeps env baked at creation). On a rebuild: delete the old redis keys first, run the documented `--bootstrap` command, and monitor progress by the target index's `_count`, not the log — the status line stays silent until the initial pull completes.
5. **`_view` check** — after any bootstrap, verify the app user appears in `SELECT relacl FROM pg_class WHERE relname='_view'`. The default-privileges rule makes this automatic; its absence means the rule was lost and app writes are failing right now.

The alias swap is **not** part of this phase — it comes after Phase 5 verification and the release-liveness check below.

## Reading a restarted daemon

- After a restart the daemon may run a **full catch-up pull** — up to the entire corpus at the daemon's chunk size — before printing its first status line. The log is silent for the whole pull. (Why the redis checkpoint sometimes fails to shortcut this is an open question; the file-vs-redis checkpoint fallback is the prime suspect.)
- **Do not restart a silent daemon before checking whether it is working.** A restart discards the pull's progress and starts over. Distinguish working from wedged with evidence: `pg_stat_activity` shows its cursor (`FETCH FORWARD …`, `ClientRead` = server waiting on the client), and the container's sockets show the truth — `nsenter -t <container-pid> -n ss -tnp`: a draining `Send-Q` and climbing `bytes_sent` mean it is uploading to Elasticsearch; a frozen `Send-Q` across samples means it is wedged.
- A repeated write of unchanged text is absorbed by the inference cache (per-allocation), so an accidental re-sync costs latency, not embedding compute — verify with the README's "Measuring inference" method, never by assuming.

## Phase 5 — Verify

Run the README's "Verify" block in full: mapping-vs-repo diff, `terms` aggregation on every declared keyword field, semantic query sanity, a new field read from a document that predates the change, `_count` (not `_cat`). Then the **deletion probe** against production, exactly as the pgsync-test skill describes it — a throwaway row with a `test-` id, deleted within a minute, with the daemon counters read while it runs. If sizing questions come up, measure inference honestly (README "Measuring inference").

## Phase 6 — Alias swap

Only after Phase 5 passes **and the released app is live**. Being live is not implied by the migration having run — migrations execute at build *start*; verify the deployment itself:

```bash
doctl apps list                          # find the production app id
doctl apps list-deployments <app-id>     # the top row must be Phase ACTIVE, not DEPLOYING
```

An old app can carry queries the new index no longer supports, so the swap always waits for `ACTIVE`. Then the atomic `_aliases` call (README "Versioned indices and the alias"), and a live search through the production site as the final end-user check.

## Phase 7 — Cleanup and record

- Immediately after the swap: drop the previous index's replication slot and its Redis keys. The slot has no rollback value (rolling back is an alias swap; the previous index serves as-is) and an active cost — an unconsumed slot retains WAL at the database's full write rate.
- The previous index itself is the rollback lever and costs storage only: **never delete it in the same run as the swap.** It stays through a validation window; a later `/es-deploy` run's observation flags it and deletes it once the new index has held for that window. Keep at most one previous index.
- Re-check `pg_replication_slots` for orphans. The WAL monitor (`check-wal.sh`, 4-hourly cron on the tasks host → `logs/wal-check.log`, Discord alerts) discovers slots by iteration, so it follows index renames on its own — its log is also the retention record if a slot was ever left behind.
- Report the deploy: what drifted, what was applied, verification results, and anything left deliberately (an old index in its validation window). If the deploy was part of a release, this report belongs in the release thread.
