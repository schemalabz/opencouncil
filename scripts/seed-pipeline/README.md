# Seed pipeline

Turns a nightly SnapShooter backup into two personal-data-free seed artifacts and a manifest, and restores them into a local database. Design: the seeding pipeline design document (untracked; ask a maintainer).

## Run it

    nix run .#seed-pipeline -- produce --backup production.sql.gz --out ./seed-out
    nix run .#seed-pipeline -- verify ./seed-out
    nix run .#seed-pipeline -- restore --from ./seed-out/subset.tar.zst --into postgresql://opencouncil@127.0.0.1:5433/opencouncil
    nix run .#seed-pipeline -- measure-tasks --db 'postgresql://seed@localhost:5432/scratch?host=/tmp/oc-seed-AbC123'

Inside `nix develop`, `npm run seed-pipeline -- <command>` runs the same code from source.

`produce` and `verify` need Postgres with PostGIS 3.3.5, the version that the migrations pin, because they start a cluster. `nix run .#seed-pipeline` brings it. `npm run seed-pipeline` builds it on first use with `nix build .#postgres-compat`, when `SEED_PG_BIN` is not set. `cache.nixos.org` does not carry that build, so the first build compiles PostGIS from source. `restore` needs only `pg_restore`, `psql`, and `prisma` — client tools, not a server — so `npm run seed-pipeline -- restore` never triggers that build. `nix run .#seed-pipeline` is different: the packaged app carries `postgres-compat` in its runtime inputs, so every command of the app, `restore` too, needs that build.

The tests that start a cluster (`transient-postgres.test.ts`, `expected-counts.test.ts`) need `SEED_PG_BIN`. Without it, they skip. The dev shell unsets `SEED_PG_BIN`, also for `nix develop --command`, so set it inside the command:

    nix develop --command bash -c 'export SEED_PG_BIN="$(nix build .#postgres-compat --no-link --print-out-paths)/bin"; npx jest src/lib/seed-pipeline/transient-postgres.test.ts'

The end-to-end test (`tests/integration/seed-pipeline-e2e.test.ts`) needs greenmask, zstd, and the PostgreSQL 16 client tools. The dev shell has them. CI's Integration job gets the same versions from `nix build .#seed-tools`, and in CI the test fails instead of skipping when a tool is missing.

The transient cluster holds production rows before masking. Only the user who runs the pipeline can reach it: it has no TCP listener, its socket is in a private `/tmp/oc-seed-*` directory with mode 0700, and its data and log files are owner-only. Its URL is a socket URL, for example `postgresql://seed@localhost:5432/scratch?host=/tmp/oc-seed-AbC123`. Each run makes a new cluster directory under `<work>/cluster/`, and a new `<work>/run-*/` directory for Greenmask's configs, dumps, and logs, so runs can share a work directory. When the run stops the cluster, it removes the cluster directory, because the data directory and the server log hold table rows. Ctrl-C and SIGTERM stop the cluster too. When a stop fails, the command keeps its work directory and prints the command that stops the cluster.

`restore` needs an empty database. `pg_restore` runs with `--exit-on-error`, so an existing table stops the restore.

`measure-tasks` reports the task-row sizes and the taskId invariant for the selected meetings. It reads a local database. It writes nothing. The scratch cluster that `produce --keep-scratch` keeps is masked: the masking rules and the subset-only rules ran in it. Against that cluster, the response sizes and the taskId invariant read the values after masking. To measure the values before masking, point `measure-tasks` at a local database that holds the unmasked backup.

Every command refuses a database URL that does not name one local database in a form that psql, pg_restore, node-postgres, and Prisma all read the same way: `postgresql://user[:password]@host:port/database`, with the port, the user, and the database required, and with `localhost`, `127.0.0.1`, or `[::1]` as the host, or a socket directory in `?host=/path`. The only other query parameters it accepts are `password`, `sslmode`, `connect_timeout`, and `application_name`. Prisma ignores `port`, `user`, and `dbname` in the query string, and `service` and `hostaddr` can lead libpq to another host, so it refuses them.

## Configuration, one source each

- `tables.json`: every Prisma model of the main and the Notis schema, classified as content or private. Masking rules, subset-only rules, explicit-query tables, public-text tables, ignored tables. A Jest test fails when a model is not classified.
- A content table can also receive private rows from another code path. The `delete-when` action removes such rows. Today it removes the `Location` rows that no subject uses (readers' notification addresses), the unreleased meetings with everything that hangs off them, the speaker tags (with their identifications), decision candidates, and `generateHighlight` tasks those deletions leave behind, and, in `beforeNulling`, the highlights that a person made and did not showcase (private drafts). `beforeNulling` rules run before `produce` nulls the columns that point at private tables, because they read such a column (`Highlight.createdById`). `verify` cannot check them afterwards. The e2e test covers them.
- `pinned-meetings.txt`: meetings that are always in the subset, with a reason. Starts empty. `produce` stops when a pinned meeting does not exist, or has no subject or no speaker segment.

Everything else is derived at run time. The columns that point at private tables come from the foreign-key statements of the dump, which the stream filter captures. Composite keys declared out of primary-key order, self-referencing keys, and the keys of explicit-query tables come from `pg_constraint`. PGSync's change capture comes from the catalog too: every trigger that calls `public.table_notify()`, the function, and the materialized view `public._view`. `produce` drops them, because no consumer runs PGSync, and a restored `_view` is not populated, so every write on a synced table would fail.

## Command options

- `--n <count>`: latest released meetings per administrative body that have a transcript, default 2. `produce` and `measure-tasks` accept it.
- `--work <dir>`: work directory. `produce`, `verify`, and `restore` accept it. Without it, the command makes a temp directory and removes it at the end.
- `--scratch-url <url>`: `produce` only. Use this empty local database instead of a transient cluster. Connect as a superuser: the filtered restore sets `lc_messages`, which only a superuser can set.
- `--keep-scratch`: `produce` only. Keep the transient cluster and the work directory after the run, and print the command that stops the cluster and removes its directories. With `--scratch-url`, it keeps nothing.

## What `produce` does

1. Streams the backup through a filter that keeps only content tables, into a transient scratch cluster.
2. Asserts every private table is empty.
3. Applies the `beforeNulling` rules. Then it nulls the columns that point at private tables, and re-adds the foreign keys the restore skipped. Scratch then has production's schema.
4. Runs `prisma migrate deploy` as a rehearsal of pending migrations against production's schema and its content rows. The private tables are empty, so a migration that reads them rehearses on no rows. The rehearsal runs with PGSync's triggers, as production does.
5. Derives the constraint work from the migrated catalog: re-declares misordered composite keys, and drops the keys Greenmask cannot carry. `post-restore.sql` re-adds the dropped keys. Then it drops PGSync's triggers, `table_notify()`, and `_view`.
6. Applies the masking rules and dumps `full.tar.zst`.
7. Applies the subset-only rules and dumps `subset.tar.zst`.
8. Writes `manifest.json` with expected per-table counts computed by `expected-counts.sql`.

`produce` takes the time once when it starts, and the meeting window of every query in the run compares meeting dates with that time, so a meeting date that passes during the run changes nothing. When `produce` starts, it also takes the output directory with a `.produce.lock` file that holds its process id, so a second run into the same directory stops. A lock whose process no longer runs is taken over. Then it removes the `manifest.json` and the `verify-report.json` of an earlier run. It writes each archive under a temporary name, and renames both just before it writes `manifest.json`. So a failed run leaves no new archive, and an archive without a manifest belongs to no finished run.

The subset holds the latest N released meetings with a transcript per administrative body of every supported city, the pinned meetings, and the rows that hang off them. The tables that no selected meeting reaches ship whole, for every city: `City` (geometry only for supported cities), `Person`, `Party`, `Role`, `AdministrativeBody`, `Topic`, `CityMessage`, and `Consultation`.

`verify` checks each artifact against the size and the checksum in the manifest. Then it restores each artifact with foreign keys enforced into its own throwaway database, and checks `prisma migrate status`, that the private tables are empty, writes, and the masking rules. The full artifact holds the old rows that the subset leaves out, so only its own check sees a row shape that a masking rule misses. The subset also gets its counts compared with the manifest, its meetings, and the subset-only rules. Last, `verify` scans both artifacts for email-like and phone-like strings outside public-text tables. The write check runs a no-op update of one row on every counted table that has rows and a primary key, in a transaction that it always rolls back. A trigger or a rule that breaks on a copy of the database therefore fails `verify`. It writes `verify-report.json` also when a step throws. The report records the `producedAt` and the checksums of the manifest, so it names the artifacts it checked.

## Artifact contents

A `pg_dump` directory archive plus `post-restore.sql`, compressed with zstd. Restore: `pg_restore --no-owner --no-privileges --exit-on-error`, then `post-restore.sql`, then `prisma migrate deploy`. `restore` does exactly that. When a `manifest.json` sits next to the archive, `restore` first checks the archive against the size and the checksum that the manifest records.
