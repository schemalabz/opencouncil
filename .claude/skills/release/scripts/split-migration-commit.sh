#!/usr/bin/env bash
# Split the commit that adds a migration into code-then-migration.
#
# The release pushes `production` as a fast-forward to the source branch's tip,
# so the intermediate build must be a real ancestor on that branch. When one
# commit both drops a column and stops reading it, no such ancestor exists and
# this script makes one.
#
# It rewrites the branch locally and prints the new split SHA on the last line.
# It never pushes.
#
# The rewrite uses plumbing rather than an interactive rebase. `commit-tree`
# builds the two commits from trees that already exist, so the result does not
# depend on the abbreviation length in a rebase todo file, and no merge runs.
#
# Usage: split-migration-commit.sh <migration-path> <branch>
set -euo pipefail

MIGRATION="${1:?usage: split-migration-commit.sh <migration-path> <branch>}"
BRANCH="${2:?usage: split-migration-commit.sh <migration-path> <branch>}"

MIGRATION_DIR=$(dirname "$MIGRATION")

[ -z "$(git status --porcelain --untracked-files=no)" ] || {
    echo "ABORT: the working tree has changes. Commit or stash them first." >&2
    exit 1
}

OLD_TIP=$(git rev-parse "$BRANCH")

TARGET=$(git log --format=%H --diff-filter=A "$BRANCH" -- "$MIGRATION" | tail -1)
[ -n "$TARGET" ] || { echo "no commit adds $MIGRATION on $BRANCH" >&2; exit 1; }
PARENT=$(git rev-parse "$TARGET^")

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git log -1 --format=%B "$TARGET" > "$WORK/code-message"
cat > "$WORK/migration-message" <<'MSG'
migrate: drop what the previous commit stopped using

The migration is its own commit so a release deploys the code first and the
schema change second. See the destructive migration rule in CLAUDE.md.
MSG

START_REF=$(git symbolic-ref --quiet HEAD || git rev-parse HEAD)

# The first commit carries the target's tree without the migration folder.
git checkout --quiet --detach "$PARENT"
git read-tree "$TARGET"
git rm -r --cached --quiet "$MIGRATION_DIR"
TREE_CODE=$(git write-tree)
git reset --hard --quiet "$PARENT"

COMMIT_CODE=$(git commit-tree "$TREE_CODE" -p "$PARENT" -F "$WORK/code-message")

# The second commit restores the target's tree exactly, so it adds the folder
# and nothing else.
COMMIT_MIGRATION=$(git commit-tree "$TARGET^{tree}" -p "$COMMIT_CODE" -F "$WORK/migration-message")

# Replay whatever followed the target onto the new pair.
git rebase --quiet --onto "$COMMIT_MIGRATION" "$TARGET" "$BRANCH"

NEW_TIP=$(git rev-parse "$BRANCH")

# The rewrite moves content between two commits. It changes no content.
if [ -n "$(git diff "$OLD_TIP" "$NEW_TIP")" ]; then
    echo "ABORT: the rewrite changed content. Restore with: git branch -f $BRANCH $OLD_TIP" >&2
    exit 1
fi

echo "old tip:   $OLD_TIP"
echo "new tip:   $NEW_TIP"
echo "code:      $COMMIT_CODE  $(git log -1 --format=%s "$COMMIT_CODE")"
echo "migration: $COMMIT_MIGRATION  $(git log -1 --format=%s "$COMMIT_MIGRATION")"
echo "zero diff: confirmed"
echo "$COMMIT_CODE"
