#!/usr/bin/env bash
set -o pipefail

#
# Manage database roles for OpenCouncil.
#
# All OpenCouncil databases live in a single DigitalOcean Managed PostgreSQL
# cluster. Roles are cluster-wide (one password, shared across databases),
# but GRANTS are per-database — a role's privileges in the production DB
# are independent from its privileges in staging.
#
# We use this to enforce isolation: each role can only CONNECT to the
# databases it needs, and only has the privileges required for its purpose.
#
# ┌─────────────────────┬──────────────────┬────────────────────┬──────────────┐
# │ Role                │ Production DB    │ Staging DB         │ Dev DBs      │
# ├─────────────────────┼──────────────────┼────────────────────┼──────────────┤
# │ readandwrite        │ full CRUD, owner │ no connect         │ no connect   │
# │ app_staging         │ no connect       │ full CRUD          │ no connect   │
# │ readonly            │ SELECT (content) │ no connect         │ no connect   │
# │ <developer>         │ no connect       │ full CRUD          │ full CRUD    │
# ├─────────────────────┼──────────────────┼────────────────────┼──────────────┤
# │ doadmin             │ admin            │ admin              │ admin        │
# └─────────────────────┴──────────────────┴────────────────────┴──────────────┘
#
# readandwrite    — Used by the production Next.js app. Can only touch production.
#                   It also runs the migrations, so it owns the production tables
#                   and the Elasticsearch views. Do not move that ownership without
#                   reading the es-deploy skill: a view owned by another role blocks
#                   views.sql and every later migration.
# app_staging     — Used by the staging Next.js app and PR previews.
# readonly        — Used by copy_db.sh to read production data. SELECT only on
#                   content tables (no user/auth/task data). See content_tables.sh.
# <developer>      — Per-developer roles (e.g., maria, andreas). Used for staging
#                   access, copy_db.sh targets, and remote dev DBs. One credential
#                   per developer for both staging and their personal dev DB.
# doadmin         — DigitalOcean auto-created superuser. Used only to manage roles.
#
# Two roles exist that this script does not manage:
#   pgsync       — Replicates PostgreSQL into Elasticsearch. A member OF
#                  readandwrite, because bootstrap drops triggers and that needs
#                  table ownership. Membership means it holds readandwrite's
#                  privileges — account for it when you audit production access.
#   notis_reader — Created by prisma/migrations, not in the DO dashboard. NOLOGIN,
#                  with SELECT on five notis views and nothing else. Each
#                  environment adds a login user with IN ROLE notis_reader. The
#                  migration refuses to run if notis_reader inherits from any role,
#                  so never grant it membership.
#
# NOTE: In DO Managed PostgreSQL, doadmin is a member OF user roles (not the
# other way around). This lets the admin manage all roles but does NOT give
# user roles admin privileges. Explicit grants are the real source of truth.
#
# IMPORTANT: Roles are cluster-wide but CONNECT is per-database. After creating
# a role, you must REVOKE CONNECT ON DATABASE ... FROM PUBLIC and explicitly
# GRANT CONNECT only to the roles that need it. Otherwise any role can connect
# to any database by default.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/content_tables.sh"

# Extra tables the readonly role needs beyond content tables.
# These are not copied by copy_db.sh but are needed for read access.
READONLY_EXTRA_TABLES=("_prisma_migrations" "TaskStatus")

usage() {
    cat <<'EOF'
Usage: setup_db_role.sh --db=<connection-string> [--role=<name>] [--type=<type>] [--verify]

Manage database roles for OpenCouncil. Connect as doadmin (or equivalent admin).

Options:
  --db=<url>       PostgreSQL connection string
  --role=<name>    Role name to set up or verify
  --type=<type>    Privilege type: "readonly" or "readwrite" (default: inferred from role name)
  --verify         Show current grants instead of applying changes.
                   If --role is omitted, shows all known roles.

Privilege types:
  readonly    — SELECT on the content tables and _prisma_migrations only.
                New tables are NOT granted automatically. This is deliberate:
                a new table can hold personal data, so a person decides each
                time. Re-run this script after you add one.
  readwrite   — Full CRUD on all tables. Also sets a default privilege for
                tables that doadmin creates later. A role that creates a table
                owns it, so it needs no grant for its own tables. A different
                readwrite role does: re-run this script for that role after a
                migration adds a table.

Type is inferred from the role name for known roles:
  readonly             → readonly
  readandwrite         → readwrite
  app_staging          → readwrite
Any other role name requires --type to be specified explicitly.

Examples:
  # See current grants for all known roles
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<db>" --verify

  # See grants for a specific developer
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<db>" --role=maria --verify

  # Set up known roles (type inferred)
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<prod-db>" --role=readonly
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<prod-db>" --role=readandwrite

  # Set up a developer's personal role on their dev DB
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<maria-devdb>" --role=maria --type=readwrite
EOF
    exit 1
}

# Parse arguments
VERIFY=false
ROLE_TYPE=""
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --db=*) DB_URL="${1#*=}" ;;
        --role=*) ROLE_NAME="${1#*=}" ;;
        --type=*) ROLE_TYPE="${1#*=}" ;;
        --verify) VERIFY=true ;;
        *) echo "Unknown parameter: $1"; usage ;;
    esac
    shift
done

[ -z "$DB_URL" ] && usage

# The role name is interpolated into SQL string literals and into GRANT as an
# identifier. Restrict it so the value cannot break out of either.
if [ -n "$ROLE_NAME" ] && ! [[ "$ROLE_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Error: role name may contain only letters, digits, underscore and hyphen."
    exit 1
fi

DB_NAME=$(echo "$DB_URL" | sed -n 's#.*/\([^/?]*\).*#\1#p')

# Every check below reads psql's stdout and discards its stderr, so a refused
# connection would otherwise surface as "role does not exist" or "no grants".
# Prove the connection works once, and let psql report the real reason.
if ! psql "$DB_URL" -c 'SELECT 1' > /dev/null; then
    echo "Cannot connect to '$DB_NAME' with the given --db connection string."
    exit 1
fi

# --- Precondition checks ---

# Check if a role inherits from doadmin (making explicit grants meaningless).
# In pg_auth_members, "member" inherits privileges of "roleid".
# DO Managed Databases inverts this: doadmin is a member OF user roles (so admin
# can manage them). We check the dangerous direction: role inheriting FROM doadmin.
check_doadmin_membership() {
    local role="$1"
    local is_member
    is_member=$(psql "$DB_URL" -t -A -c "
        SELECT 1 FROM pg_auth_members am
        JOIN pg_roles granted ON granted.oid = am.roleid
        JOIN pg_roles member ON member.oid = am.member
        WHERE member.rolname = '$role' AND granted.rolname = 'doadmin';
    " 2>/dev/null)
    [ "$is_member" = "1" ]
}

# Check if PUBLIC has CONNECT on the current database.
# Empty datacl means defaults apply (PUBLIC can connect).
# Non-empty datacl with "=...C..." means PUBLIC has explicit CONNECT.
check_public_connect() {
    local acl
    acl=$(psql "$DB_URL" -t -A -c "
        SELECT datacl FROM pg_database WHERE datname = current_database();
    " 2>/dev/null)
    # Empty ACL = default = PUBLIC can connect
    if [ -z "$acl" ]; then
        return 0
    fi
    # Non-empty: check for PUBLIC entry (empty grantee before =, e.g. {=CTc/doadmin} or ,=CTc/doadmin)
    echo "$acl" | grep -qE '(^\{|,)=[^/]*C'
}

# Print the tables from the argument list that this database does not have.
# A GRANT that names a relation which does not exist fails as a whole statement,
# so the caller must know before it builds one. Uses pg_class rather than
# information_schema, which hides objects the connected role cannot see.
absent_tables() {
    local in_list="" t
    for t in "$@"; do
        [ -n "$in_list" ] && in_list+=", "
        in_list+="'$t'"
    done
    # Callers run this in a command substitution, so exiting here would only end
    # the subshell. Return non-zero and let the caller decide.
    psql "$DB_URL" -t -A -c "
        SELECT x.name FROM unnest(ARRAY[$in_list]) AS x(name)
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = x.name
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        )
        ORDER BY x.name;
    " || return 1
}

# Which databases a role is meant to reach. Roles are cluster-wide but grants
# are per-database, so the same role is correct in one database and a mistake
# in another.
role_expected_here() {
    case "$1" in
        readonly|readandwrite) [ "$DB_NAME" = "production" ] ;;
        app_staging)           [ "$DB_NAME" = "staging" ] ;;
        *)                     [ "$DB_NAME" = "staging" ] || [[ "$DB_NAME" == *-devdb ]] ;;
    esac
}

role_expected_databases() {
    case "$1" in
        readonly|readandwrite) echo "the 'production' database" ;;
        app_staging)           echo "the 'staging' database" ;;
        *)                     echo "'staging' or a '*-devdb' database" ;;
    esac
}

# Tables this script has an opinion about: ordinary tables in public that an
# extension does not own. PostGIS brings its own (spatial_ref_sys), which no
# application role needs to write.
APP_TABLES_SQL="FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.objid = c.oid AND d.deptype = 'e'
      )"

# --- Verify ---

verify_role() {
    local role="$1"
    echo ""
    echo "=== $role on $DB_NAME ==="

    local exists
    exists=$(psql "$DB_URL" -t -A -c "SELECT 1 FROM pg_roles WHERE rolname = '$role';" 2>/dev/null)
    if [ "$exists" != "1" ]; then
        echo "  Role does not exist."
        return
    fi

    # Precondition warnings
    if check_doadmin_membership "$role"; then
        echo "  WARNING: inherits from doadmin — has full admin access regardless of grants below"
    fi

    # Check CONNECT privilege
    local has_connect
    has_connect=$(psql "$DB_URL" -t -A -c "SELECT has_database_privilege('$role', current_database(), 'CONNECT');" 2>/dev/null)
    echo "  CONNECT: $has_connect"
    if [ "$has_connect" = "t" ] && check_public_connect; then
        echo "  (via PUBLIC default — not explicitly granted)"
    fi

    # Table grants
    local grants
    grants=$(psql "$DB_URL" -t -A -F $'\t' -c "
        SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type)
        FROM information_schema.role_table_grants
        WHERE grantee = '$role'
        GROUP BY table_name
        ORDER BY table_name;
    " 2>/dev/null)

    echo ""
    if [ -z "$grants" ]; then
        echo "  No grants made directly to $role."
    else
        echo "  Granted directly to $role (what this script manages):"
        echo ""
        printf "  %-35s %s\n" "TABLE" "PRIVILEGES"
        printf "  %-35s %s\n" "---" "---"
        while IFS=$'\t' read -r table privs; do
            printf "  %-35s %s\n" "$table" "$privs"
        done <<< "$grants"
    fi
    echo ""
    echo "  The checks below use effective access, which also counts privileges"
    echo "  held through PUBLIC or through membership of another role."

    # Default privileges are keyed to the role that CREATES the object, so a rule
    # registered for doadmin never fires for a table a migration creates. Show
    # which rules exist rather than leaving the operator to guess.
    local defaults
    defaults=$(psql "$DB_URL" -t -A -F $'\t' -c "
        SELECT pg_get_userbyid(defaclrole),
               CASE defaclobjtype
                   WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences'
                   WHEN 'f' THEN 'functions' WHEN 'T' THEN 'types'
                   ELSE defaclobjtype::text END,
               array_to_string(defaclacl, ' ')
        FROM pg_default_acl
        WHERE strpos(array_to_string(defaclacl, ' '), '$role=') > 0;
    ")
    if [ -n "$defaults" ]; then
        echo ""
        echo "  Default privileges (apply only to objects that the creator makes):"
        while IFS=$'\t' read -r creator objtype acl; do
            [ -z "$creator" ] && continue
            echo "    when $creator creates $objtype: $acl"
        done <<< "$defaults"
    fi

    # Check for missing expected grants based on role type
    local expected_type=""
    case "$role" in
        readonly)                   expected_type="readonly" ;;
        readandwrite|app_staging)   expected_type="readwrite" ;;
    esac

    if [ -n "$expected_type" ] && ! role_expected_here "$role"; then
        # Listing every table as "missing" here would be noise: the role is not
        # supposed to reach this database at all. Report the exception instead.
        local reachable
        reachable=$(psql "$DB_URL" -t -A -c "
            SELECT count(*) $APP_TABLES_SQL
              AND (has_table_privilege('$role', c.oid, 'SELECT')
                OR has_table_privilege('$role', c.oid, 'INSERT')
                OR has_table_privilege('$role', c.oid, 'UPDATE')
                OR has_table_privilege('$role', c.oid, 'DELETE'));
        ")
        echo ""
        echo "  $role is not meant to reach '$DB_NAME'. It belongs on $(role_expected_databases "$role")."
        if [ "$reachable" = "0" ]; then
            echo "    Holds no table privileges here. Correct."
        else
            echo "    WARNING: it can reach $reachable table(s) here. Revoke them."
        fi
        if [ "$has_connect" = "t" ]; then
            echo "    WARNING: it can CONNECT to '$DB_NAME'. Revoke with:"
            echo "      REVOKE CONNECT ON DATABASE \"$DB_NAME\" FROM \"$role\";"
        fi
    elif [ -n "$expected_type" ]; then
        if [ "$expected_type" = "readonly" ]; then
            # Two different conditions hide behind one missing row: the table is
            # here but ungranted (setup fixes it), or the table is not in this
            # database at all (setup cannot fix it, and would fail outright).
            local expected=("${CONTENT_TABLES[@]}" "${READONLY_EXTRA_TABLES[@]}")
            local absent
            if ! absent=$(absent_tables "${expected[@]}"); then
                echo "  Could not read the table list from $DB_NAME."
                return
            fi
            local not_here=()
            for t in "${expected[@]}"; do
                if [ -n "$absent" ] && grep -qxF "$t" <<< "$absent"; then
                    not_here+=("$t")
                fi
            done

            # has_table_privilege answers what the role can do, counting
            # privileges held through PUBLIC or through role membership. The
            # listing above shows only direct grants, so it can look emptier.
            local expected_list="" t_
            for t_ in "${expected[@]}"; do
                [ -n "$expected_list" ] && expected_list+=", "
                expected_list+="'$t_'"
            done
            local unreadable
            unreadable=$(psql "$DB_URL" -t -A -c "
                SELECT c.relname
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relname = ANY(ARRAY[$expected_list])
                  AND NOT has_table_privilege('$role', c.oid, 'SELECT')
                ORDER BY c.relname;
            ")

            if [ -n "$unreadable" ]; then
                echo ""
                echo "  $(wc -l <<< "$unreadable") table(s) the role cannot read:"
                sed 's/^/    - /' <<< "$unreadable"
                echo "  Run: ./scripts/setup_db_role.sh --db=... --role=$role"
            fi

            if [ ${#not_here[@]} -gt 0 ]; then
                echo ""
                echo "  ${#not_here[@]} table(s) listed in content_tables.sh but not in $DB_NAME:"
                for t in "${not_here[@]}"; do
                    echo "    - $t"
                done
                echo "  The setup script cannot grant these. Either $DB_NAME is behind on"
                echo "  migrations, or content_tables.sh lists a table that no longer exists."
            fi
        elif [ "$expected_type" = "readwrite" ]; then
            # Report the privileges the role actually lacks, per table. Reading
            # the direct grants instead would report a table as missing SELECT
            # when PostGIS granted that SELECT to PUBLIC, or report every table
            # as missing for a role that holds them through membership.
            local incomplete
            incomplete=$(psql "$DB_URL" -t -A -F $'\t' -c "
                SELECT relname, missing FROM (
                    SELECT c.relname, array_to_string(ARRAY(
                        SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
                        WHERE NOT has_table_privilege('$role', c.oid, p)
                    ), ', ') AS missing
                    $APP_TABLES_SQL
                ) t WHERE missing <> '' ORDER BY relname;
            ")

            if [ -n "$incomplete" ]; then
                echo ""
                echo "  $(wc -l <<< "$incomplete") table(s) without full read and write access:"
                while IFS=$'\t' read -r table missing; do
                    [ -z "$table" ] && continue
                    echo "    - $table (missing $missing)"
                done <<< "$incomplete"
                echo "  Run: ./scripts/setup_db_role.sh --db=... --role=$role"
            fi
        fi
    fi
}

if [ "$VERIFY" = true ]; then
    if [ -n "$ROLE_NAME" ]; then
        verify_role "$ROLE_NAME"
    else
        verify_role "readandwrite"
        verify_role "app_staging"
        verify_role "readonly"
    fi
    echo ""
    exit 0
fi

# --- Setup ---

[ -z "$ROLE_NAME" ] && usage

# Infer type from known role names, or require --type
if [ -z "$ROLE_TYPE" ]; then
    case "$ROLE_NAME" in
        readonly)                          ROLE_TYPE="readonly" ;;
        readandwrite|app_staging)          ROLE_TYPE="readwrite" ;;
        *)
            echo "Error: unknown role '$ROLE_NAME'. Specify --type=readonly or --type=readwrite."
            exit 1
            ;;
    esac
fi

if [ "$ROLE_TYPE" != "readonly" ] && [ "$ROLE_TYPE" != "readwrite" ]; then
    echo "Error: --type must be 'readonly' or 'readwrite'"
    exit 1
fi

# Validate role is being applied to the correct database to prevent mistakes.
# Known roles have strict database requirements:
#   readonly        → production only
#   readandwrite    → production only
#   app_staging     → staging only
# Developer roles (--type=readwrite with custom name) can target staging or *-devdb databases.
# They are never allowed on production.
if ! role_expected_here "$ROLE_NAME"; then
    echo "ERROR: '$ROLE_NAME' should only be set up on $(role_expected_databases "$ROLE_NAME"), not '$DB_NAME'."
    echo ""
    echo "This check prevents accidentally granting privileges on the wrong database."
    echo "If you're sure this is correct, file a bug — the validation may need updating."
    exit 1
fi

# Check if role exists
ROLE_EXISTS=$(psql "$DB_URL" -t -A -c "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE_NAME';" 2>/dev/null)
if [ "$ROLE_EXISTS" != "1" ]; then
    echo "Role '$ROLE_NAME' does not exist yet."
    echo ""
    echo "Create it first (as doadmin):"
    echo "  CREATE ROLE \"$ROLE_NAME\" WITH LOGIN PASSWORD '<password>';"
    echo ""
    echo "Or create it via the DigitalOcean dashboard, then re-run this script."
    exit 1
fi

# Precondition checks
if check_doadmin_membership "$ROLE_NAME"; then
    echo "WARNING: '$ROLE_NAME' is a member of doadmin and inherits full admin access."
    echo "Explicit grants will have no practical effect until membership is revoked:"
    echo ""
    echo "  REVOKE doadmin FROM \"$ROLE_NAME\";"
    echo ""
    read -p "Continue anyway? [y/N] " CONFIRM_INHERIT
    [ "$CONFIRM_INHERIT" != "y" ] && [ "$CONFIRM_INHERIT" != "Y" ] && echo "Aborted." && exit 0
    echo ""
fi

if check_public_connect; then
    echo "NOTE: PUBLIC has CONNECT on '$DB_NAME'. Any role can connect to this database."
    echo "To enforce CONNECT isolation, revoke PUBLIC access:"
    echo ""
    echo "  REVOKE CONNECT ON DATABASE \"$DB_NAME\" FROM PUBLIC;"
    echo ""
fi

# The readonly grant names every table, so one absent relation makes PostgreSQL
# reject the whole statement and apply nothing. Fail here, with the cause, rather
# than after the operator has confirmed.
if [ "$ROLE_TYPE" = "readonly" ]; then
    if ! ABSENT=$(absent_tables "${CONTENT_TABLES[@]}" "${READONLY_EXTRA_TABLES[@]}"); then
        echo "Failed to read the table list from $DB_NAME."
        exit 1
    fi
    if [ -n "$ABSENT" ]; then
        echo "ERROR: $DB_NAME does not have $(wc -l <<< "$ABSENT") table(s) that the grant names:"
        sed 's/^/  - /' <<< "$ABSENT"
        echo ""
        echo "The GRANT names each table, so PostgreSQL rejects the whole statement and"
        echo "applies nothing. One of two things is true:"
        echo "  - $DB_NAME is behind on migrations. Deploy them, then re-run this script."
        echo "  - scripts/content_tables.sh lists a table that no longer exists. Remove it"
        echo "    there — copy_db.sh reads the same list and would fail on it too."
        exit 1
    fi
fi

# Build quoted table lists
CONTENT_TABLE_LIST=""
for t in "${CONTENT_TABLES[@]}"; do
    [ -n "$CONTENT_TABLE_LIST" ] && CONTENT_TABLE_LIST+=", "
    CONTENT_TABLE_LIST+="\"$t\""
done

EXTRA_TABLE_LIST=""
for t in "${READONLY_EXTRA_TABLES[@]}"; do
    EXTRA_TABLE_LIST+=", \"$t\""
done

case "$ROLE_TYPE" in
    readonly)
        SQL="GRANT CONNECT ON DATABASE \"$DB_NAME\" TO \"$ROLE_NAME\";
GRANT USAGE ON SCHEMA public TO \"$ROLE_NAME\";
GRANT SELECT ON $CONTENT_TABLE_LIST$EXTRA_TABLE_LIST TO \"$ROLE_NAME\";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO \"$ROLE_NAME\";"
        ;;
    readwrite)
        SQL="GRANT CONNECT ON DATABASE \"$DB_NAME\" TO \"$ROLE_NAME\";
GRANT USAGE ON SCHEMA public TO \"$ROLE_NAME\";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"$ROLE_NAME\";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"$ROLE_NAME\";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"$ROLE_NAME\";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"$ROLE_NAME\";"
        ;;
esac

echo "Will run on $DB_NAME:"
echo ""
echo "$SQL"
echo ""
read -p "Continue? [y/N] " CONFIRM
[ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ] && echo "Aborted." && exit 0

psql "$DB_URL" -c "$SQL"
if [ $? -ne 0 ]; then
    echo "Failed to apply grants."
    exit 1
fi

echo ""
echo "Done. Verifying:"
verify_role "$ROLE_NAME"
echo ""
