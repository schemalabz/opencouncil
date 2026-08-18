---
name: pgsync-test
description: E2E-test Elasticsearch indexing changes (schema.json, views.sql, pipeline.json) with the pgsync-test.sh harness — environment setup, version parity with prod, test recipes, verdict reading, and cleanup. Use before merging any change under elasticsearch/ or when debugging sync/deletion issues.
---

# pgsync-test: E2E testing of the PGSync → Elasticsearch pipeline

Orchestrates `opencouncil-tasks/scripts/pgsync-test.sh` against a local PostgreSQL and the real Elasticsearch cluster (`subjects_test` index). The reference for every procedure is `elasticsearch/README.md` — this skill covers only orchestration and the agent-side traps. Read the README's "Testing Schema Changes" section before the first run.

## When to use

- Any PR that touches `elasticsearch/schema.json`, `elasticsearch/views.sql`, or `elasticsearch/pipeline.json`
- Debugging sync bugs: documents not appearing, not updating, or not being deleted from the index

## Safety rails (read first)

- The ES API key is **cluster-wide**. The only guard keeping writes off the production index (`subjects-*`, behind the `subjects` alias) is the index name in the temp schema the harness builds. Never set `TEST_INDEX`; the default is `subjects_test`. (The alias adds one accidental rail: Elasticsearch refuses to delete an index through an alias name.)
- `PG_URL` in `opencouncil-tasks/.env` must point at **localhost** (the local nix DB). Never staging or prod.
- Preflight: capture the prod index identity, verify it unchanged after the run (`_cat/indices/subjects` resolves the alias to the current real index; its uuid changes legitimately only at a rebuild):
  ```bash
  curl -s "$ELASTICSEARCH_URL/_cat/indices/subjects?h=index,uuid,creation.date.string" -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY"
  ```

## 1. Environment setup

**Testing a PR branch:** point `OPENCOUNCIL_REPO` at a worktree — never switch branches in the main repo:
```bash
git worktree add ../opencouncil-worktrees/<branch> <branch>   # or update an existing one
```

**Local PostgreSQL — use the dedicated flake app.** Do NOT start the server with `pg_ctl` from the `nix develop` shell: that shell ships *plain* postgresql 16 (psql CLI only), and a server started from it fails during bootstrap with `could not access file "$libdir/postgis-3"` the moment PGSync queries `LocationSearchView`. The flake app handles everything (PostGIS-wrapped binary, initdb if needed, port 5432, `wal_level=logical`, replication slots, `listen_addresses=0.0.0.0` for Docker):

```bash
# check nothing is already running first
ss -tln | grep ':5432\b'

nix run .#dev-db-nix        # runs postgres in the FOREGROUND — background it as a task
```

- It `exec`s postgres directly, so stopping the background task stops postgres cleanly (single process — the "never kill the background task" rule for `nix run .#dev` does not apply here).
- `OC_DB_PORT=<port>` overrides the port if 5432 is taken (then also override `PG_URL` for the harness).
- `nix run .#dev-db-nix-locked` runs the production-matching PostGIS 3.3.5 build.

**pgsync image parity with production.** The harness uses `toluaina1/pgsync:latest`, but `docker run` never re-pulls a tag that exists locally — a cached image can be months behind what production runs, and pgsync behavior differs across versions (see the README FAQ on deletes that do not propagate). Test with the version production runs:
```bash
docker run --rm --entrypoint sh toluaina1/pgsync:latest -c 'pip show pgsync | head -2'
ssh root@134.122.74.255 'docker exec opencouncil-tasks-pgsync-1 pip show pgsync | head -2'
# if they differ, copy the exact prod image (upstream :latest may lack an amd64 manifest, so pull can fail):
ssh root@134.122.74.255 'docker save toluaina1/pgsync:latest | gzip' > /tmp/pgsync.tar.gz && docker load < /tmp/pgsync.tar.gz
```

**Test data model — two layers.** The full seed dump is the *substrate*: real production-derived data whose shape variety (NULL relations, geometries, unidentified speakers) is what makes bootstrap a meaningful coverage test — a bootstrap that "passes" on a few hand-made rows proves almost nothing. On top of it, each behavioral recipe (section 3) inserts its own *probe rows* with self-chosen `test-` prefixed IDs and controlled content. Assert only on probe rows, never on dump rows — the dump is regenerated from production and its contents drift.

When the change under test introduces **new data shapes** (a new column, a new tagged form, a legacy-vs-new distinction), the dump predates them and cannot cover them: build fixtures for exactly those shapes — but on top of the seeded substrate, not instead of it.

**Verify the substrate is present** before testing:
```bash
psql "postgresql://opencouncil:opencouncil@localhost:5432/opencouncil" -At \
  -c 'SELECT count(*) FROM "Subject";' -c $'SELECT count(*) FROM "Subject" WHERE description ~ \'\\(REF:\';'
```
The full seed (`prisma/seed_data.json`) has ~239 subjects with thousands of REF links — plenty for every recipe, no fixture injection needed. If you see only 2 subjects (the Serbian review fixture), the full seed never ran: run `nix run .#dev` once (it migrates and seeds the local DB automatically), or seed manually — but pin `DATABASE_URL` to localhost first, because `.env` usually points at a remote DB:
```bash
DATABASE_URL="postgresql://opencouncil:opencouncil@localhost:5432/opencouncil" \
  nix develop --command npx prisma db seed
```

**If the schema references an ingest pipeline** (`"pipeline"` key), the pipeline must exist on the cluster before the run, or every bulk write fails. Create/update it from the repo file — command in the README, section "Create or Update the Pipeline".

## 2. Running the harness

From `opencouncil-tasks/` (the dev shell lacks `jq`; bring both tools):
```bash
cd ../opencouncil-tasks
nix shell nixpkgs#jq nixpkgs#postgresql_16 --command bash -c \
  'OPENCOUNCIL_REPO=../opencouncil-worktrees/<branch> ./scripts/pgsync-test.sh'            # bootstrap only
# or --daemon for live-sync tests (runs in foreground; background it and drive tests from another shell)
```

Notes:
- The script sources `opencouncil-tasks/.env` from its working directory, **overwriting your exported variables** — and another session may have repointed `PG_URL` there. To control the env, run from a directory that has no `.env` and export everything yourself; always echo the resolved `PG_URL` before the run.
- "Documents indexed: 0" right after bootstrap is usually **refresh lag** on the serverless cluster, not a failure — re-check `GET /subjects_test/_count` a few seconds later.
- Stop a backgrounded daemon with `docker stop pgsync-test-daemon`; the script's trap then removes its redis. Keep the script's output — a crashed daemon without logs is undiagnosable.

## 3. Test recipes (daemon mode)

- **Deletion propagation** — the **deletion probe**, mandatory for any schema.json change; it catches root-table DELETE misrouting that nothing else catches, and es-deploy runs the same probe against production after a deploy:
  1. Insert a throwaway subject with a `test-` prefixed id (copy `cityId` and `councilMeetingId` from an existing row).
  2. Wait until the document appears in the index.
  3. `DELETE` the row in PostgreSQL. Expect the document to return 404 within ~15 seconds.
  4. Read the daemon status line while it runs: `Db` counts accepted NOTIFY events, `Elasticsearch` counts operations sent, `Xlog` counts WAL-slot events (mostly startup catch-up). `Db` moved but `Elasticsearch` did not → the event was accepted and **misrouted** (the root-table `base_tables` bug — CI guards the invariant, the probe is the runtime proof). `Db` did not move → the notification was **dropped before the daemon** — check the trigger function version (README FAQ on deletes that do not propagate).
- **Pipeline stripping** — after bootstrap, `GET /subjects_test/_doc/<id>`: `description` and nested `speaker_contributions[].text` must contain no `[text](REF:...)`. Then the live path: `UPDATE` a description with fresh REF links, confirm the synced document is stripped. Definition-only check without pgsync: the `_simulate` example in the README.
- **New fields / metrics** — verify against a probe row whose expected values you computed yourself, and re-check after a live `UPDATE` of the parent `Subject` row (child-table writes alone do not re-sync — README FAQ "When do the discussion metrics refresh?").

## 4. Cleanup checklist

```bash
docker stop pgsync-test-daemon 2>/dev/null           # trap removes pgsync-test-redis
psql "postgresql://opencouncil:opencouncil@localhost:5432/opencouncil" \
  -c "SELECT pg_drop_replication_slot('opencouncil_subjects_test');"   # else WAL accumulates on the local DB
# subjects_test: keep for inspection or delete; re-runs recreate it either way
# verify prod untouched: re-run the preflight _cat/indices command, compare the uuid
```

The pgsync triggers and `table_notify()` on the local DB can stay — the next run reuses them.
