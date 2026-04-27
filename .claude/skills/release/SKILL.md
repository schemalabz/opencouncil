---
name: release
description: Merge source branch (default main) to production, create a CalVer release, and generate release content (GitHub release notes, Discord announcement)
disable-model-invocation: true
argument-hint: "[dry-run] [from:<branch>] | <ref>..<ref>"
---

# Release

Merge a source branch into production, tag a CalVer release, and generate release content for multiple channels.

## Arguments

- `$ARGUMENTS` — optional, space-separated tokens:
  - `dry-run` — generate content without merging, tagging, or publishing
  - `from:<branch>` — override the source branch (default: `main`). Examples: `from:staging`, `from:develop`
  - `<ref>..<ref>` — generate content for an arbitrary git range. Implies dry-run — no merge, tag, or publish. Examples:
    - `abc123..def456` — between two commits
    - `2026.4.1..2026.4.2` — between two tags
    - `2026.4.2..HEAD` — from a tag to current HEAD
  - *(empty)* — full release: main → production merge, tag, GitHub release, content generation

Tokens can appear in any order. `from:<branch>` is ignored when an explicit `<ref>..<ref>` range is given.

## Argument Parsing

Parse `$ARGUMENTS` to determine the mode:

1. Extract `from:<branch>` if present → set `SOURCE_BRANCH` to `<branch>`, otherwise default to `main`.

2. If `$ARGUMENTS` contains `..`, treat it as an **explicit range**. Validate both refs exist:
   ```bash
   git rev-parse --verify <left-ref>
   git rev-parse --verify <right-ref>
   ```
   Set `RANGE="<left-ref>..<right-ref>"` and `DRY_RUN=true`.

3. If `$ARGUMENTS` contains `dry-run`, set `RANGE="$REMOTE/production..$REMOTE/$SOURCE_BRANCH"` and `DRY_RUN=true`.

4. If `$ARGUMENTS` is empty (or only `from:<branch>`), set `RANGE="$REMOTE/production..$REMOTE/$SOURCE_BRANCH"` and `DRY_RUN=false`.

Use `$RANGE` in all subsequent git log/diff commands. Skip Steps 1 and 6 entirely when `DRY_RUN=true`.

## Step 1: Pre-flight Checks

Determine the upstream remote (varies by contributor setup):

```bash
# Use 'upstream' if it exists, otherwise 'origin'
git remote | grep -q upstream && REMOTE=upstream || REMOTE=origin
echo "Using remote: $REMOTE"
```

Use `$REMOTE` throughout all subsequent steps instead of hardcoding a remote name.

Verify the repo is in a clean state and the branches exist:

```bash
# Ensure working tree is clean
git status --porcelain

# Fetch latest
git fetch $REMOTE

# Verify both branches exist
git rev-parse --verify $REMOTE/$SOURCE_BRANCH
git rev-parse --verify $REMOTE/production
```

Check there are actually changes to release:

```bash
# Show what source branch has that production doesn't
git log --oneline $REMOTE/production..$REMOTE/$SOURCE_BRANCH
```

If there are no commits between source branch and production, stop and tell the user — there's nothing to release.

### Create backup branches

Before any destructive operations, snapshot the current state of both branches:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
git branch backup/$SOURCE_BRANCH-pre-release-$TIMESTAMP $REMOTE/$SOURCE_BRANCH
git branch backup/production-pre-release-$TIMESTAMP $REMOTE/production
```

Tell the user the backup branch names so they can recover if anything goes wrong.

### Check for production-only commits (hotfixes)

Production may have commits that source branch doesn't (e.g., hotfixes applied directly to production):

```bash
# Commits on production that are NOT on source branch
git log --oneline $REMOTE/$SOURCE_BRANCH..$REMOTE/production
```

If this returns any commits, **source branch must be rebased on top of production before proceeding**. Tell the user:
- Show them the production-only commits
- Explain that source branch needs to be rebased onto production to maintain linear history
- **Do not proceed with the release until this is resolved**

The rebase should happen on the source branch before the release continues:
```bash
git checkout $SOURCE_BRANCH
git rebase $REMOTE/production
git push $REMOTE $SOURCE_BRANCH --force-with-lease
```

**Always confirm with the user before force-pushing.** After the rebase, re-run the pre-flight checks.

## Step 2: Gather Context

Determine the last release tag and collect the changes in `$RANGE`:

```bash
# Get the latest CalVer tag
LAST_TAG=$(git tag --list '20[0-9][0-9].[0-9]*' --sort=-version:refname | head -1)
echo "Last release: ${LAST_TAG:-none}"

# Commit log for the range
git log --format="%H %s" $RANGE
```

Collect the raw material:

```bash
# Diff stat for scope overview
git diff --stat $RANGE

# Changed files
git diff --name-only $RANGE
```

Read the full diff for understanding the substance of changes:

```bash
git diff $RANGE
```

**Important**: Commit messages are a signal, not the source of truth. Always cross-reference messages against the actual diff to understand what really changed. Commits may understate, overstate, or mislabel changes.

## Step 3: Determine Version

CalVer format: `YYYY.MM.N` where N is a sequential counter starting at 1, resetting each month.

```bash
YEAR=$(date +%Y)
MONTH=$(date +%-m)
PREFIX="${YEAR}.${MONTH}"

# Find the highest N for this month
LAST_N=$(git tag --list "${PREFIX}.*" --sort=-version:refname | head -1 | awk -F. '{print $3}')

if [ -z "$LAST_N" ]; then
  NEXT_VERSION="${PREFIX}.1"
else
  NEXT_VERSION="${PREFIX}.$((LAST_N + 1))"
fi

echo "Next version: $NEXT_VERSION"
```

## Step 4: Analyze Changes

Before generating any output, analyze the changes and categorize them:

1. **User-facing features** — new functionality visible to end users
2. **Bug fixes** — things that were broken and are now fixed
3. **Improvements** — enhancements to existing features (UI polish, performance, UX)
4. **Infrastructure/internal** — refactors, dependency updates, CI changes, developer tooling

Prioritize by impact to users. Minor internal refactors may not deserve mention in the Discord announcement but belong in the GitHub release notes.

## Step 5: Generate Outputs

Generate two markdown outputs, each following its template. Read each template before generating:

1. **GitHub Release notes** — see [templates/github-release.md](templates/github-release.md)
2. **Discord announcement** — see [templates/discord.md](templates/discord.md)

Present both outputs to the user for review before proceeding.

## Step 6: Merge and Release

**Skip this step if `$ARGUMENTS` contains `dry-run`.**

After the user approves the outputs:

1. **Fast-forward production to source branch** (linear history — no merge commits):
   ```bash
   git checkout production
   git merge $REMOTE/$SOURCE_BRANCH --ff-only
   ```
   If the fast-forward fails, **stop**. This means production has diverged from source branch — the hotfix rebase in Step 1 was not completed. Do not force merge.

2. **Tag the release** on the production branch:
   ```bash
   git tag -a $NEXT_VERSION -m "Release $NEXT_VERSION"
   ```

3. **Push production and the tag**:
   ```bash
   git push $REMOTE production
   git push $REMOTE $NEXT_VERSION
   ```

4. **Create the GitHub release** using the approved release notes:
   ```bash
   gh release create $NEXT_VERSION --target production --title "$NEXT_VERSION" --notes-file <release-notes-file>
   ```

5. Print the Discord announcement markdown for the user to copy.

**Always confirm with the user before pushing and creating the GitHub release.** These are public-facing, non-reversible actions.

## Notes

- If there are no changes between source branch and production, stop — don't create an empty release.
- If the commit history is messy (many fixups, WIP commits), focus on the diff rather than the messages to understand what actually changed.
- **Linear history is enforced**: source branch and production must always share a linear history. The `--ff-only` merge guarantees this. If it fails, something is wrong — investigate rather than forcing.
