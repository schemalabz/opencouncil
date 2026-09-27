---
name: test-backup
description: Test the SnapShooter database backups — restore the newest main and Notis production dumps into a private throwaway PostgreSQL cluster, check them, and delete the cluster
argument-hint: "[main] [--keep] | --main <file> [--notis <file>] [--keep]"
---

# Test Backup Restore

`backup.sh test`, next to this file, does the whole test in one command. It fetches the newest `production` and `notis-production` dumps from the SnapShooter bucket. It restores them into a private PostgreSQL cluster that it creates for the run, checks them, and deletes the whole cluster. It prints a report that ends in `RESULT: PASS` or `RESULT: FAIL`. The exit code matches.

The restored data holds readers' names and phone numbers. Never print rows from it. Deleting the whole cluster is what removes that data: dropping a database leaves every restored row in PostgreSQL's write-ahead log. The cluster listens on a socket only, with no network port. The test never touches a developer's database, never applies migrations, and never starts Notis or the app. So it cannot send a message or call an external service.

## 1. Prerequisites

1. Nix. If `command -v nix` finds nothing, stop and tell the user that this skill needs the Nix environment. The script builds its PostgreSQL with PostGIS through the flake, as `.#postgres-postgis`. On a new machine, the first run downloads it from the binary cache.
2. The rclone remote `oc-backups`, set up once per machine. If `backup.sh` reports that it is missing, do not run the setup yourself: it prompts for a secret. Tell the user:

   - Create a read-only Spaces key for the `opencouncil-db-backups` bucket in the DigitalOcean control panel, under API → Spaces Keys. Without DigitalOcean access, ask a teammate who has it.
   - Run the setup in your own terminal. It asks for the key with hidden input and stores it only in `~/.config/rclone/rclone.conf`: never in the repository, the shell history or a transcript.

     ```bash
     nix develop --command bash .claude/skills/test-backup/setup-remote.sh
     ```

   - Without a key, test dumps downloaded from SnapShooter instead: `backup.sh test --main <file> --notis <file>`.

## 2. Run

```bash
nix develop --command .claude/skills/test-backup/backup.sh test
```

It downloads about 900 MB and takes about five minutes. Run it in the background. When you run it, set `OC_TEST_BACKUP_DIR` to a directory in your scratchpad first. The downloads and logs go there.

Arguments:

- `main`: test the main dump only. The Notis and pair checks are skipped.
- `--main <file> --notis <file>`: test dumps that are already downloaded. The age check is skipped. The command does not delete these files.
- `--keep`: keep the cluster running and the downloads after the run. Use `backup.sh check` to run the checks again and `backup.sh clean` to remove everything. Tell the user that a kept cluster holds production data.

`nix develop` prints its banner to standard output. Do not capture its output with `$(nix develop --command …)`.

## 3. Read the report

Show the user the report. For each `FAIL`, this is the meaning and the next step:

| Failure | Meaning | Next step |
|---|---|---|
| the test stopped before it finished | An unexpected error or an interrupt ended the run early. The cluster and the downloads are still deleted. | If the run was not interrupted, read the error printed above the `RESULT` line. |
| the newest dump is over the age limit | The SnapShooter job has stopped. A stopped job sends no failure notification. | Look at the job's recent runs in SnapShooter. For the Notis job, `permission denied for table …` means that `notis_backup` cannot read a table that a role other than `notis_production_app` created. Grant it `SELECT` on that table. |
| target holds no dump | The job has never written to its directory, or it writes somewhere else. | Compare the listed directories with `TARGET_DIR` in `backup.sh`. A renamed job writes to a new directory. |
| not a valid gzip file | The download or the dump is corrupt. | Run the test again. If it fails again, the dump in the bucket is bad. |
| unexpected restore errors | The dump does not restore cleanly. `syntax error at or near` means that a table failed to create, and its data spilled out. | Read the log that the report names. |
| a table is empty, or cannot be read | The job dumps the wrong database, or the code renamed the table. | Compare the database name in the SnapShooter job with the table list in `check_counts`. |
| no city has geometry | The PostGIS data did not restore. | Read the restore log. |
| active subscriptions refer to users that the main dump does not have | The two dumps disagree. A reader's main account is gone while Notis still serves them. | Report it. Readers who signed up between the two jobs do not count: the check excludes them. |

These lines are information, not failures:

- **Restore errors from missing roles, and from `aiven_extras` or `vector`.** Neither dump carries its roles, and those extensions exist only on the managed cluster. Each run starts from a new cluster, so the count changes only when production gains or loses a role.
- **Pending migrations.** The code has migrations that production has not run yet. This is normal between a merge and a release.
- **Ahead migrations.** Production has migrations that this branch does not have. Tell the user to rebase the branch.
