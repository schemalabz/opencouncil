#!/usr/bin/env bash
# Report the migrations in a release that break the code serving traffic now.
#
# A migration applies at the start of the App Platform build. The old instances
# keep every request until the new ones pass their health checks. So a release
# whose migration drops a column that the deployed code still selects fails
# every such query for the length of the build.
#
# Usage: check-destructive-migrations.sh <last-tag> <head-ref>
set -euo pipefail

LAST_TAG="${1:?usage: check-destructive-migrations.sh <last-tag> <head-ref>}"
HEAD_REF="${2:?usage: check-destructive-migrations.sh <last-tag> <head-ref>}"

DEPLOYED_SCHEMA=$(git show "$LAST_TAG:prisma/schema.prisma")

# Does a tree still name this identifier? Prisma writes an explicit column list
# into every query, so a name in the schema is a name the client selects.
names_identifier() {
    printf '%s\n' "$1" | grep -qE "(^|[[:space:]\"])$2([[:space:]\"?]|$)"
}

found_unsafe=0

# Only files the range adds. A migration already on production is already applied.
while IFS= read -r migration; do
    [ -n "$migration" ] || continue

    sql=$(git show "$HEAD_REF:$migration")

    # The statements that break a reader of the old schema. A DROP CONSTRAINT or
    # a DROP NOT NULL does not, so neither appears here.
    identifiers=$(printf '%s\n' "$sql" | grep -ioE \
        'DROP[[:space:]]+COLUMN[[:space:]]+"?[A-Za-z0-9_]+"?|DROP[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?"?[A-Za-z0-9_]+"?|RENAME[[:space:]]+COLUMN[[:space:]]+"?[A-Za-z0-9_]+"?|RENAME[[:space:]]+TO[[:space:]]+"?[A-Za-z0-9_]+"?|DROP[[:space:]]+TYPE[[:space:]]+"?[A-Za-z0-9_]+"?|ALTER[[:space:]]+COLUMN[[:space:]]+"?[A-Za-z0-9_]+"?[[:space:]]+(SET[[:space:]]+DATA[[:space:]]+)?TYPE' \
        | sed -E 's/[[:space:]]+(SET[[:space:]]+DATA[[:space:]]+)?TYPE$//I' \
        | sed -E 's/.*[[:space:]]"?([A-Za-z0-9_]+)"?$/\1/' | sort -u || true)

    for identifier in $identifiers; do
        names_identifier "$DEPLOYED_SCHEMA" "$identifier" || continue

        # The split point is the parent of the commit that adds the migration.
        # It is valid when the code there no longer names the identifier.
        adding_commit=$(git log --format=%H --diff-filter=A "$LAST_TAG..$HEAD_REF" -- "$migration" | tail -1)
        split="none"
        if [ -n "$adding_commit" ]; then
            parent=$(git rev-parse "$adding_commit^")
            parent_schema=$(git show "$parent:prisma/schema.prisma")
            names_identifier "$parent_schema" "$identifier" || split="$parent"
        fi

        echo "UNSAFE $migration $identifier split=$split"
        found_unsafe=1
    done
done < <(git diff --name-only --diff-filter=A "$LAST_TAG..$HEAD_REF" -- 'prisma/migrations/*/migration.sql')

[ "$found_unsafe" -eq 0 ] && echo "SAFE"
exit 0
