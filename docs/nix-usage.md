# Nix Usage Guide

This guide explains how to use the flake-based Nix setup to run OpenCouncil with either a remote database or a local database (via Nix or Docker), plus how to navigate the `process-compose` TUI.

## Install Nix

If you don’t already have Nix installed, you can install it with a single command:

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

## Enter the dev environment

From the repo root:

```bash
nix develop
```

## Run the stack (Process Compose TUI)

The recommended entrypoint is the flake app `dev`, which launches a `process-compose` TUI and manages logs.

### Local DB via Nix (default)

Starts a local Postgres + PostGIS as regular processes (no Docker) and then starts the Next.js dev server:

```bash
nix run .#dev
```

### Remote DB

Uses `DATABASE_URL` / `DIRECT_URL` from your `.env`:

```bash
nix run .#dev -- --db=remote
```

### Local DB via Docker (escape hatch)

Starts the dockerized PostGIS DB and then starts the Next.js dev server:

```bash
nix run .#dev -- --db=docker
```

### External DB (explicit URLs)

```bash
nix run .#dev -- --db=external --db-url "postgresql://..." --direct-url "postgresql://..."
```

### Prisma Studio

By default, the dev runner starts **Prisma Studio** for local DB modes (`--db=nix` and `--db=docker`).

- Disable it: `nix run .#dev -- --no-studio`
- Pin the port: `OC_PRISMA_STUDIO_PORT=5555 nix run .#dev`

## Process Compose basics

When you run `nix run .#dev`, you enter a `process-compose` terminal UI:

- **What’s running**:
  - `--db=remote`: `app` only
  - `--db=nix`: `db` + `app`
  - `--db=docker`: `db` + `app`
- **Exit**: quitting the TUI stops the processes started by it.
- **Logs**: the runner also writes copy/paste-friendly logs to files (see below).

If you’re unfamiliar with the TUI controls, run:

```bash
nix develop --command process-compose --help
```

## Logs (copy/paste friendly)

The runner writes logs under:

- `.data/process-compose/db.log`
- `.data/process-compose/app.log`
- `.data/process-compose/studio.log` (if Studio is enabled)

Example:

```bash
tail -200 .data/process-compose/db.log
tail -200 .data/process-compose/app.log
```

## Ports and configuration knobs

You can influence local DB defaults via environment variables:

- `OC_DB_PORT`: port for the local DB (if unset, the runner picks a free port starting from 5432)
- `OC_DB_DATA_DIR`: local DB data directory (default: `./.data/postgres`)
- `OC_DB_USER`, `OC_DB_PASSWORD`, `OC_DB_NAME`: credentials for local DB modes (defaults: `opencouncil` / `opencouncil` / `opencouncil`)
- `OC_APP_PORT`: app port (if unset, the runner picks a free port starting at 3000)
- `OC_PRISMA_STUDIO_PORT`: Prisma Studio port (if unset, the runner picks a free port starting at 5555)

For the flake dev runner (`nix run .#dev`), local DB modes (`--db=nix`, `--db=docker`) use the `OC_DB_*` defaults above so your `.env` can stay remote-oriented without breaking local bootstraps.

## Notes on `.env`

OpenCouncil validates environment variables at startup via `src/env.mjs`. Even with a local DB, you still need the non-DB secrets in `.env` today.

## `flake.lock` and version pinning

This repo uses Nix flakes. The **single source of truth** for Nix dependency versions is `flake.lock`:

- `flake.nix` declares inputs (e.g. which nixpkgs channel to use).
- `flake.lock` pins inputs to an exact revision + hash.

This means everyone who runs `nix develop` / `nix run` gets the same versions of Node, Postgres, Prisma engines, etc.

### Updating the lock file

Only update `flake.lock` intentionally, since it upgrades toolchain versions.

```bash
nix flake lock --update-input nixpkgs
```

## Prisma engines must match Prisma JS

On NixOS, Prisma engine binaries are typically provided via nixpkgs and wired through environment variables (the dev shell exports `PRISMA_*`).

Because of that, it’s important that the nixpkgs-provided Prisma CLI/engines **match** the repo’s `prisma` / `@prisma/client` versions. If they don’t match, you can see confusing runtime or CLI failures.

When upgrading Prisma JS deps, upgrade the nixpkgs pin in `flake.lock` accordingly (or vice-versa).

## Prisma CLI (inside the dev shell)

The dev shell includes the Prisma CLI:

```bash
nix develop --command prisma -v
```

You can also run Prisma Studio directly (outside the TUI):

```bash
nix develop --command prisma studio --port 5555
```

## PostgreSQL CLI (psql)

The dev shell includes `psql` for direct database access. The shell automatically loads your `.env` and exports `PSQL_URL` (the `DATABASE_URL` with query parameters stripped, since psql doesn't need them):

```bash
nix develop

# Connect to your database
psql "$PSQL_URL"

# Run a SQL file
psql "$PSQL_URL" < some-script.sql

# Quick query
psql "$PSQL_URL" -c "SELECT COUNT(*) FROM \"Subject\";"
```

## Reset Local Database

If you need to reset your local database and start fresh, use the cleanup command:

```bash
nix run .#cleanup
```

This will:
- Remove `.data/postgres` (local database files)
- Remove `.next` (Next.js build cache)

You'll be prompted for confirmation before deletion. After cleanup, simply run `nix run .#dev` again to create a fresh database with seeded data.

## Troubleshooting

- **DB port already in use**: the runner auto-selects a free port if `OC_DB_PORT` is not set. If you pin `OC_DB_PORT`, make sure it’s free.
- **Copy logs**: prefer `.data/process-compose/*.log` over the TUI when sharing errors.


