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
# │ app_production      │ full CRUD        │ no connect         │ no connect   │
# │ app_staging         │ no connect       │ full CRUD          │ no connect   │
# │ readonly            │ SELECT (content) │ no connect         │ no connect   │
# │ <developer>         │ no connect       │ full CRUD          │ full CRUD    │
# ├─────────────────────┼──────────────────┼────────────────────┼──────────────┤
# │ doadmin             │ admin            │ admin              │ admin        │
# └─────────────────────┴──────────────────┴────────────────────┴──────────────┘
#
# app_production  — Used by the production Next.js app. Can only touch production.
# app_staging     — Used by the staging Next.js app and PR previews.
# readonly        — Used by copy_db.sh to read production data. SELECT only on
#                   content tables (no user/auth/task data). See content_tables.sh.
# <developer>      — Per-developer roles (e.g., maria, andreas). Used for staging
#                   access, copy_db.sh targets, and remote dev DBs. One credential
#                   per developer for both staging and their personal dev DB.
# doadmin         — DigitalOcean auto-created superuser. Used only to manage roles.
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
  readonly    — SELECT on content tables + _prisma_migrations only
  readwrite   — Full CRUD on all tables + auto-grant on future tables

Type is inferred from the role name for known roles:
  readonly             → readonly
  app_production       → readwrite
  app_staging          → readwrite
Any other role name requires --type to be specified explicitly.

Examples:
  # See current grants for all known roles
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<db>" --verify

  # See grants for a specific developer
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<db>" --role=maria --verify

  # Set up known roles (type inferred)
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<prod-db>" --role=readonly
  ./scripts/setup_db_role.sh --db="postgresql://doadmin:.../<prod-db>" --role=app_production

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

DB_NAME=$(echo "$DB_URL" | sed -n 's#.*/\([^/?]*\).*#\1#p')

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

    if [ -z "$grants" ]; then
        echo "  No table grants."
    else
        echo ""
        printf "  %-35s %s\n" "TABLE" "PRIVILEGES"
        printf "  %-35s %s\n" "---" "---"
        while IFS=$'\t' read -r table privs; do
            printf "  %-35s %s\n" "$table" "$privs"
        done <<< "$grants"
    fi

    # Check for missing expected grants based on role type
    local expected_type=""
    case "$role" in
        readonly)             expected_type="readonly" ;;
        app_production|app_staging) expected_type="readwrite" ;;
    esac

    if [ -n "$expected_type" ]; then
        if [ "$expected_type" = "readonly" ]; then
            local missing=()
            for t in "${CONTENT_TABLES[@]}" "${READONLY_EXTRA_TABLES[@]}"; do
                echo "$grants" | grep -q "^${t}	" || missing+=("$t")
            done

            if [ ${#missing[@]} -gt 0 ]; then
                echo ""
                echo "  MISSING ${#missing[@]} expected table(s):"
                for t in "${missing[@]}"; do
                    echo "    - $t"
                done
                echo "  Run: ./scripts/setup_db_role.sh --db=... --role=$role"
            fi
        elif [ "$expected_type" = "readwrite" ]; then
            # Check all public tables have the expected CRUD grants
            local all_tables
            all_tables=$(psql "$DB_URL" -t -A -c "
                SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
            " 2>/dev/null)
            local missing=()
            while IFS= read -r t; do
                [ -z "$t" ] && continue
                echo "$grants" | grep -q "^${t}	.*DELETE.*INSERT.*SELECT.*UPDATE" || missing+=("$t")
            done <<< "$all_tables"

            if [ ${#missing[@]} -gt 0 ]; then
                echo ""
                echo "  MISSING full CRUD on ${#missing[@]} table(s):"
                for t in "${missing[@]}"; do
                    echo "    - $t"
                done
                echo "  Run: ./scripts/setup_db_role.sh --db=... --role=$role"
            fi
        fi
    fi
}

if [ "$VERIFY" = true ]; then
    if [ -n "$ROLE_NAME" ]; then
        verify_role "$ROLE_NAME"
    else
        verify_role "app_production"
        verify_role "app_staging"
        verify_role "readonly"
        verify_role "readandwrite"
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
        app_production|app_staging)        ROLE_TYPE="readwrite" ;;
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
#   app_production  → production only
#   app_staging     → staging only
# Developer roles (--type=readwrite with custom name) can target staging or *-devdb databases.
# They are never allowed on production.
validate_db_error=""
case "$ROLE_NAME" in
    readonly|app_production)
        if [ "$DB_NAME" != "production" ]; then
            validate_db_error="'$ROLE_NAME' should only be set up on the 'production' database, not '$DB_NAME'."
        fi
        ;;
    app_staging)
        if [ "$DB_NAME" != "staging" ]; then
            validate_db_error="'app_staging' should only be set up on the 'staging' database, not '$DB_NAME'."
        fi
        ;;
    *)
        # Custom role names (developers) can target staging or *-devdb databases
        if [ -n "$ROLE_TYPE" ] && [ "$DB_NAME" != "staging" ] && [[ "$DB_NAME" != *-devdb ]]; then
            validate_db_error="Developer role '$ROLE_NAME' can only target 'staging' or '*-devdb' databases, not '$DB_NAME'."
        fi
        ;;
esac

if [ -n "$validate_db_error" ]; then
    echo "ERROR: $validate_db_error"
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
    echo "  CREATE ROLE $ROLE_NAME WITH LOGIN PASSWORD '<password>';"
    echo ""
    echo "Or create it via the DigitalOcean dashboard, then re-run this script."
    exit 1
fi

# Precondition checks
if check_doadmin_membership "$ROLE_NAME"; then
    echo "WARNING: '$ROLE_NAME' is a member of doadmin and inherits full admin access."
    echo "Explicit grants will have no practical effect until membership is revoked:"
    echo ""
    echo "  REVOKE doadmin FROM $ROLE_NAME;"
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
        SQL="GRANT CONNECT ON DATABASE \"$DB_NAME\" TO $ROLE_NAME;
GRANT USAGE ON SCHEMA public TO $ROLE_NAME;
GRANT SELECT ON $CONTENT_TABLE_LIST$EXTRA_TABLE_LIST TO $ROLE_NAME;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO $ROLE_NAME;"
        ;;
    readwrite)
        SQL="GRANT CONNECT ON DATABASE \"$DB_NAME\" TO $ROLE_NAME;
GRANT USAGE ON SCHEMA public TO $ROLE_NAME;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $ROLE_NAME;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $ROLE_NAME;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $ROLE_NAME;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $ROLE_NAME;"
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
