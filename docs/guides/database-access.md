# Database Access

Procedures for accessing and working with the different OpenCouncil databases. For how the databases fit into the overall deployment topology, see [infrastructure.md](../infrastructure.md).

## Overview

All databases live in a single DigitalOcean Managed PostgreSQL cluster. Roles are **cluster-wide** (one password, shared across all databases in the cluster), but **grants are per-database** — a role's privileges on the production DB are independent from its privileges on staging.

> **Important:** Always use port `25060` (direct connection) for scripts and role management. Port `25061` is the connection pool, which uses pool names (e.g., `stagpool`) instead of database names and may not work correctly with `COPY` operations.

### Roles

| Role | Production DB | Staging DB | Dev DBs | Notes |
|------|--------------|------------|---------|-------|
| `readandwrite` | Full CRUD, owns tables | No grants | No grants | Production app credential. It also runs the migrations, so it owns the tables and the Elasticsearch views. |
| `app_staging` | No grants | Full CRUD | No grants | Staging app credential. Ready to replace `doadmin` on staging. |
| `readonly` | SELECT on content tables | No grants | No grants | Source credential for `copy_db.sh`. Cannot read `User`, `Session`, `Account` or `Notification`. |
| `<developer>` | No grants | Full CRUD | Full CRUD | Per-person (e.g. `maria`, `andreas`). One credential for both staging and the personal dev database. |
| `doadmin` | Admin | Admin | Admin | DO auto-created. Used for role management only. |

`setup_db_role.sh` manages the five roles above. Two more roles exist that it does not manage:

| Role | What it is | Why it matters here |
|------|-----------|---------------------|
| `pgsync` | Replicates PostgreSQL into Elasticsearch. | It is a **member of `readandwrite`**, because bootstrap drops triggers and that needs table ownership. Membership gives it `readandwrite`'s privileges, so count it when you audit who can read production. See the `es-deploy` skill. |
| `notis_reader` | `NOLOGIN` role with SELECT on the five `notis_*` views and nothing else. | `prisma/migrations` creates it, not the DO dashboard. Each environment adds a login user with `IN ROLE notis_reader`. The migration **fails** if `notis_reader` inherits from any role, so never grant it membership. |

Ownership of the production tables and views sits with `readandwrite`. Do not move it without reading the `es-deploy` skill first: a view owned by another role blocks `views.sql` and every later migration.

## Managing Roles

Use `scripts/setup_db_role.sh` to verify and set up role permissions. The script checks for common issues (doadmin inheritance, PUBLIC CONNECT defaults) and grants only the minimum privileges needed.

```bash
# Verify current grants for all roles on a database
./scripts/setup_db_role.sh --db="postgresql://doadmin:<pw>@<host>:25060/<db>?sslmode=require" --verify

# Verify a specific role
./scripts/setup_db_role.sh --db="..." --role=readonly --verify

# Set up a role (shows SQL and asks for confirmation)
./scripts/setup_db_role.sh --db="..." --role=readonly
```

The script validates that roles are applied to the correct database:
- `readonly` and `readandwrite` → only on `production`
- `app_staging` → only on `staging`
- Developer roles → only on `staging` or `*-devdb`

### Creating new roles

Create roles via the **DigitalOcean dashboard** (Databases > Users & Databases > Add User) so passwords are visible and manageable in the UI. Then run the setup script to apply the correct permissions:

```bash
# After creating the role in DO dashboard:
./scripts/setup_db_role.sh --db="postgresql://doadmin:<pw>@<host>:25060/<db>" --role=<name>
```

### The `readonly` role

Grants SELECT on the content tables (defined in `scripts/content_tables.sh`, the same tables `copy_db.sh` operates on), plus `_prisma_migrations` and `TaskStatus`. `copy_db.sh` does not copy these two tables, but the role needs read access to them. Sensitive tables (User, Session, Account, Notification) are excluded — the role cannot read them at all.

New tables are invisible to `readonly` by default. When you add a table to `scripts/content_tables.sh`, re-run the setup script to grant access.

The grant names every table, so PostgreSQL rejects the whole statement if one of them does not exist, and applies nothing. The script checks first and stops with the cause: either the database is behind on migrations, or `content_tables.sh` lists a table that no longer exists. `--verify` reports the same two conditions separately, because only the first one is a grant the setup script can add.

### Auditing access

For a deep one-time audit of the full cluster state (all roles, memberships, ownership, default privileges, ACLs):

```bash
psql "postgresql://doadmin:<pw>@<host>:25060/<db>?sslmode=require" -f scripts/inspect_db_access.sql
```

## Copying Production Data

The `scripts/copy_db.sh` script copies content table data from one database to another. This is how we keep staging and remote dev databases populated with real data from production.

**The production database should never be accessed directly from development machines** — running `copy_db.sh` with the `readonly` role is the only sanctioned way to get production data out.

### Usage

```bash
# Copy production → staging
./scripts/copy_db.sh \
  --source="postgresql://readonly:<pw>@<host>:25060/production?sslmode=require" \
  --target="postgresql://app_staging:<pw>@<host>:25060/staging?sslmode=require" \
  --clear

# Copy production → remote dev database
./scripts/copy_db.sh \
  --source="postgresql://readonly:<pw>@<host>:25060/production?sslmode=require" \
  --target="postgresql://maria:<pw>@<host>:25060/maria-devdb?sslmode=require" \
  --clear
```

### What it does

- Copies content tables (defined in `scripts/content_tables.sh`) — **not** user data or task statuses, to protect privacy and avoid stale task state
- With `--clear`: deletes target data before copying (prompts for confirmation with a random code)
- Without `--clear`: appends data (will fail on duplicate primary keys)

### Safety checks

The script validates several things before copying:

1. **Migration parity**: verifies the target has all migrations present in the source — otherwise `COPY` would reference columns that don't exist
2. **FK ordering**: validates the table copy order respects foreign key dependencies
3. **Column compatibility**: verifies every column of every copied table in the source also exists in the target. Migration parity compares migration *names* only, so a target that is ahead of the source passes it even if the extra migration dropped a column. This check compares column names, not types or enum labels
4. **Orphan FKs**: detects FK columns pointing to tables not in the copy list (e.g., user references) and NULLs them automatically to avoid constraint violations

If any check fails, the script aborts before touching data.

### Which role for which side?

| Parameter | Role needed | Why |
|-----------|-------------|-----|
| `--source` | `readonly` | Only runs `SELECT` / `COPY TO STDOUT` on content tables |
| `--target` | Developer role or `app_staging` | Needs `DELETE` (with `--clear`) and `INSERT` |

## Setting Up a Remote Dev Database

When a new team member joins (or you need a fresh dev environment), follow these steps to set up their own remote database with proper credentials.

### 1. Create the database and role in DigitalOcean

In the DO dashboard (**Databases > your-cluster**):
- **Users & Databases > Add Database**: create a database named `<name>-devdb` (e.g., `maria-devdb`)
- **Users & Databases > Add User**: create a role matching their name (e.g., `maria`). Creating via the dashboard ensures the password is visible and manageable in the UI.

### 2. Grant permissions

Run the setup script twice — once for their dev database, once for staging access:

```bash
# Grant full CRUD on their dev database
./scripts/setup_db_role.sh \
  --db="postgresql://doadmin:<pw>@<host>:25060/maria-devdb?sslmode=require" \
  --role=maria \
  --type=readwrite

# Grant full CRUD on staging (shared environment)
./scripts/setup_db_role.sh \
  --db="postgresql://doadmin:<pw>@<host>:25060/staging?sslmode=require" \
  --role=maria \
  --type=readwrite
```

### 3. Populate with data

Copy production content data into the new database:

```bash
./scripts/copy_db.sh \
  --source="postgresql://readonly:<pw>@<host>:25060/production?sslmode=require" \
  --target="postgresql://maria:<pw>@<host>:25060/maria-devdb?sslmode=require" \
  --clear
```

### 4. Connect locally

The developer adds the connection string to their `.env`:

```
DATABASE_URL="postgresql://maria:<pw>@<host>:25060/maria-devdb?sslmode=require"
DIRECT_URL="postgresql://maria:<pw>@<host>:25060/maria-devdb?sslmode=require"
```

Then runs the dev server against it:

```bash
nix run .#dev -- --db=remote
```

The same `maria` credentials also work for connecting to staging when needed.
