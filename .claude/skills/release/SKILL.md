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

## Setup

Runs first in every mode, including dry-run — everything downstream reads `$REMOTE`, and a stale remote-tracking ref would quietly release the wrong commits.

```bash
# Use 'upstream' if it exists, otherwise 'origin' — varies by contributor setup
git remote | grep -q upstream && REMOTE=upstream || REMOTE=origin

# Every gh call needs the repo named explicitly: a contributor has both a fork
# (origin) and the upstream, and gh refuses to guess between them
REPO=$(gh repo view "$(git remote get-url $REMOTE)" --json nameWithOwner -q .nameWithOwner)
echo "Using remote: $REMOTE  ($REPO)"

git fetch $REMOTE --tags
```

Use `$REMOTE` and `$REPO` throughout instead of hardcoding a remote or a repository name, and prefer `$REMOTE/<branch>` over local branch names: in a repo that does its work in worktrees, local `main` and `production` are routinely stale.

## Argument Parsing

Parse `$ARGUMENTS` to determine the mode:

1. Extract `from:<branch>` if present → set `SOURCE_BRANCH` to `<branch>`, otherwise default to `main`.

2. If `$ARGUMENTS` contains `..`, treat it as an **explicit range**. Validate both refs exist:
   ```bash
   git rev-parse --verify <left-ref>
   git rev-parse --verify <right-ref>
   ```
   Set `RANGE="<left-ref>..<right-ref>"`, `EXPLICIT_RANGE=true` and `DRY_RUN=true`.

3. If `$ARGUMENTS` contains `dry-run`, leave `RANGE` unset — Step 2 derives it — and set `DRY_RUN=true`.

4. If `$ARGUMENTS` is empty (or only `from:<branch>`), leave `RANGE` unset — Step 2 derives it — and set `DRY_RUN=false`.

### Two ranges, and why they differ

- **`$RANGE` — what to write about.** Everything never announced: `$LAST_TAG..$REMOTE/$SOURCE_BRANCH`. Derived in Step 2 unless set explicitly here. Use it for every log/diff/content command.
- **`$MERGE_RANGE` — what to deploy.** `$REMOTE/production..$REMOTE/$SOURCE_BRANCH`. Used only by Step 1's "is there anything to deploy?" check; Step 6 pushes a refspec rather than reusing it.

They coincide only when the last tag sits exactly on production's tip. They diverge the moment someone pushes to production without tagging — a real and recurring case. Deriving release notes from `$MERGE_RANGE` would then silently omit every already-deployed-but-never-tagged commit from the release that finally tags them. Step 2 detects this and says so.

Skip Steps 1 and 6 entirely when `DRY_RUN=true`. Setup above always runs.

## Step 1: Pre-flight Checks

Verify the repo is in a clean state and the branches exist:

```bash
# Ensure working tree is clean
git status --porcelain

# Verify both branches exist
git rev-parse --verify $REMOTE/$SOURCE_BRANCH
git rev-parse --verify $REMOTE/production
```

Check there are actually changes to deploy:

```bash
MERGE_RANGE="$REMOTE/production..$REMOTE/$SOURCE_BRANCH"

# Show what source branch has that production doesn't
git log --oneline $MERGE_RANGE
```

If this is empty, production is already at the source branch's tip. That is **not** automatically "nothing to release" — production may hold untagged commits that still need a release. Check before stopping:

```bash
LAST_TAG=$(git tag --list '20[0-9][0-9].[0-9]*' --sort=-version:refname | head -1)
git log --oneline ${LAST_TAG:+$LAST_TAG..}$REMOTE/$SOURCE_BRANCH
```

The `${LAST_TAG:+…}` guard matters: with no tags yet, a bare `..$REMOTE/$SOURCE_BRANCH` means `HEAD..$REMOTE/$SOURCE_BRANCH`, which answers a different question and would be wrong silently.

If that is also empty, stop and tell the user — there's genuinely nothing to release. If it has commits, continue: this is a tag-only release (Step 6's fast-forward becomes a no-op, but the tag and GitHub release are still needed).

### Elasticsearch infrastructure check

The app deploys itself, and Prisma migrations run at build time — but the Elasticsearch infrastructure (`elasticsearch/schema.json`, `views.sql`, `pipeline.json`) deploys through a separate, manual channel. Check whether this release carries any of it:

```bash
git diff --stat $MERGE_RANGE -- elasticsearch/
```

If this is non-empty, tell the user this release carries Elasticsearch infrastructure, and coordinate with `/es-deploy` — that skill diffs the live infrastructure against the repository and states what belongs on each side of the release:

- **Before this release completes**: `views.sql` applied to production when a pending migration depends on it (a migration that drops a table or column a view reads is blocked until the view stops reading it — its comment states the prerequisite), and the ingest pipeline `PUT` when `pipeline.json` changed.
- **After this release**: everything else — the PGSync daemon fetches `schema.json` from the **production branch**, so a schema change reaches it only through this release, followed by a daemon recreate, and on a rebuild the bootstrap → verify → alias swap. The swap always waits for the released app to be live.

So the release is the middle of the sequence, not before or after it. Run `/es-deploy` first to get the split for this specific change; resume the release once its before-steps (if any) are done; hand back to `/es-deploy` after the deployment is ACTIVE.

### Create backup branches

Back up only what a release can actually lose, and clear the previous release's backups first — nothing in this workflow ever reads a backup older than one cycle.

```bash
# Detect hotfixes now: it decides whether production needs a backup, and it must be
# evaluated BEFORE the rebase below, which folds these commits into the source branch
HOTFIXES=$(git log --oneline $REMOTE/$SOURCE_BRANCH..$REMOTE/production)

# Previous releases' backups are dead weight once this release starts
git branch --list 'backup/*-pre-release-*' | tr -d ' ' | xargs -r git branch -D

TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Source branch: the hotfix rebase below rewrites these commits to new SHAs
git branch backup/$SOURCE_BRANCH-pre-release-$TIMESTAMP $REMOTE/$SOURCE_BRANCH

# Production: only when it carries commits that may exist nowhere else
if [ -n "$HOTFIXES" ]; then
  git branch backup/production-pre-release-$TIMESTAMP $REMOTE/production
fi
```

**Why production is usually skipped:** the release only ever fast-forwards production, so its pre-release tip stays reachable as an ancestor of the new tip — a backup pointer adds nothing. The exception is a hotfix applied directly to production: every other commit in a release arrived via a PR and so has a second home on a PR branch, but a direct hotfix may exist on no other ref anywhere.

Tell the user which backup branches were created. Note that a deleted branch's commits stay recoverable by SHA from the reflog, which git enables by default in any non-bare repo (`core.logAllRefUpdates`); once unreachable they survive `gc.reflogExpireUnreachable`, 30 days by default. These branches exist for discoverability — finding a commit by name instead of digging through `git reflog` — not as the only safety net.

### Check for production-only commits (hotfixes)

Production may have commits that source branch doesn't (e.g., hotfixes applied directly to production) — captured as `$HOTFIXES` above:

```bash
echo "${HOTFIXES:-none}"
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

## Step 1.5: Destructive Migration Check

A migration applies at the **start** of the App Platform build. The old instances serve every request until the new ones pass their health checks. So a release whose migration drops a column that the deployed code still selects breaks every such query for the length of the build. Release 2026.9.5 did this for 9 minutes and 36 seconds.

Run the check on the content range:

```bash
.claude/skills/release/scripts/check-destructive-migrations.sh "$LAST_TAG" "$REMOTE/$SOURCE_BRANCH"
```

`SAFE` means the release deploys as one build. Continue to Step 2 and use Step 6 unchanged.

An `UNSAFE` line means the release needs the two-build deploy in Step 6b. Read the `split=` field:

- `split=<sha>` — a valid split point exists. Record the SHA. Go to Step 2.
- `split=none` — the same commit drops the column and stops reading it, so no split point exists. Run **Step 1.6** to create one.

With no tags yet, `$LAST_TAG` is empty and this step does not apply. Skip it.

## Step 1.6: Make a Split Point

Run this only when Step 1.5 reports `split=none`. The branch broke the destructive migration rule in `CLAUDE.md`, so the same commit drops the column and stops reading it.

The fix rewrites the source branch. Three conditions protect it:

1. **The backup exists.** Step 1's `backup/$SOURCE_BRANCH-pre-release-<timestamp>` branch must already point at the old tip. Confirm it before you start.
2. **The diff is zero.** The script asserts this and exits non-zero if the rewrite changed any content.
3. **The user confirms.** A force-push to the default branch is a public action.

Check the branch is unprotected first. An enabled ruleset makes this path impossible:

```bash
gh api "repos/$REPO/rulesets" -q '.[] | select(.target=="branch") | "\(.name): \(.enforcement)"'
```

If a ruleset covering `$SOURCE_BRANCH` reports `active`, **stop**. Report it, and hand the split to the user.

Otherwise, from a clean working tree:

```bash
git checkout $SOURCE_BRANCH && git reset --hard $REMOTE/$SOURCE_BRANCH
OLD_TIP=$(git rev-parse $SOURCE_BRANCH)
.claude/skills/release/scripts/split-migration-commit.sh <migration-path> $SOURCE_BRANCH
```

The script prints the old tip, the new tip, both new commits and a `zero diff: confirmed` line. Its last line is the split SHA. Show all of it to the user. **Wait for a yes.** Then:

```bash
git push $REMOTE $SOURCE_BRANCH --force-with-lease=$SOURCE_BRANCH:$OLD_TIP
```

Re-run Step 1.5. It must now report `split=<sha>` with the SHA the script printed. Record it and continue to Step 2.

## Step 2: Gather Context

Determine the last release tag. It defines `$RANGE` — **unless** Argument Parsing already set one from an explicit `<ref>..<ref>`, which must win:

```bash
# Get the latest CalVer tag
LAST_TAG=$(git tag --list '20[0-9][0-9].[0-9]*' --sort=-version:refname | head -1)
echo "Last release: ${LAST_TAG:-none}"

# Content range: everything never announced. The ${LAST_TAG:+…} guard falls
# back to the full history on a repo with no tags yet; a bare '..ref' would
# silently mean 'HEAD..ref'.
if [ -z "$EXPLICIT_RANGE" ]; then
  RANGE="${LAST_TAG:+$LAST_TAG..}$REMOTE/$SOURCE_BRANCH"
fi
echo "Content range: $RANGE"
```

### Check for untagged production commits

Skip this when `$EXPLICIT_RANGE` is set — the user named the span deliberately.

```bash
# Commits already on production that no tag covers
git log --oneline ${LAST_TAG:+$LAST_TAG..}$REMOTE/production
```

If this is non-empty, someone pushed to production outside this workflow and never tagged it. **Tell the user explicitly** — which commits, and that the release notes therefore cover more than the pending merge does. This is expected to happen from time to time; it is not an error and does not block the release. `$RANGE` already accounts for it, so no adjustment is needed — but the user should know the notes are announcing work that has been live for a while, since that can affect how the Discord message is worded.

Collect the commit log for the range:

```bash
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

### Collect contributors

GitHub builds the release page's "Contributors" list from the users @-mentioned in the body — not from the commits. Credit everyone who authored code in the range.

**Never read contributors from PR numbers in commit subjects.** Only a squash merge writes `(#N)` into the subject. A rebase merge writes nothing, so a rebase-merged PR's author reads like a direct push and disappears. That is how the 2026.9.2 notes named one contributor of two. Ask GitHub instead, which resolves a login per commit whatever the merge method was:

```bash
HEAD_SHA=$(git rev-parse "${RANGE##*..}^{commit}")            # peel: compare 404s on a tag object
case "$RANGE" in
  *..*) BASE=$(git rev-parse "${RANGE%%..*}^{commit}") ;;
  *)    BASE=$(git rev-list --max-parents=0 "$HEAD_SHA" | tail -1) ;;   # bare ref: no tag yet
esac

gh api "repos/$REPO/compare/$BASE...$HEAD_SHA" --paginate \
  -q '.commits[] | "\(.author.login // .commit.author.email)/\(.author.type // "-")  <- \(.committer.login // .commit.committer.email)/\(.committer.type // "-")"' \
  | sort | uniq -c | sort -rn
```

**Assert the count first:** the first column must sum to `git rev-list --count $RANGE` — one less on a bare ref, where the compare excludes the root commit. Without `--paginate` the API returns 250 commits of any longer range, and any `gh` failure pipes through as a clean empty list — both look like a valid answer.

Then take each row in this order — the never-mention check comes first, because a bot can sit in either slot:

1. **Never @mention a bot:** `/Bot` in the type field, plus `claude` and `web-flow` (a merge made in the web UI), which both report `/User`.
2. **Bot author, human committer → credit the committer.** An agent-written commit that a person pushed carries `claude` as the author.
3. **A never-mention identity on both sides credits nobody** — rule 1 decides that, so `claude <- claude` counts even though both report `/User`. Normal for an agent's direct push and for a Dependabot merge; do not ask the user about it. Confirm the work is not invisible instead — rule 5's command does not select these rows, they have a login. Run `gh api "repos/$REPO/commits/<sha>/pulls"` on the group's commits, which names the pull request author, who belongs in the list when no other row already credits them.
4. **Otherwise credit the author**, a bot in the committer slot included. A differing committer usually only rebased or merged.
5. **A bare email is unresolved** — that commit email is on no account. Ask the pull request it came from, once per distinct email:

   ```bash
   gh api "repos/$REPO/compare/$BASE...$HEAD_SHA" --paginate \
     -q '.commits[] | select(.author.login == null) | "\(.commit.author.email)\t\(.sha)"' \
     | sort -u -k1,1 | while IFS=$'\t' read -r email sha; do
         printf '%s -> ' "$email"; gh api "repos/$REPO/commits/$sha/pulls" -q '.[0].user.login // "no PR"'
       done
   ```

Ask the user only when a person is still unresolved after all five. Never guess a username from a display name.

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

**If Step 1.5 reported an `UNSAFE` line, use [Step 6b](#step-6b-two-build-deploy) for the production push.** The single fast-forward below takes the site down for the length of the build.

After the user approves the outputs:

1. **Tag the release** at the source branch's tip — the exact commit production is about to serve:
   ```bash
   git tag -a $NEXT_VERSION $REMOTE/$SOURCE_BRANCH -m "Release $NEXT_VERSION"
   ```
   Name `$REMOTE/$SOURCE_BRANCH` rather than tagging `HEAD` — for the reason given in Setup, `HEAD` is not reliably the commit being released.

2. **Fast-forward production**, without switching branches:
   ```bash
   git push $REMOTE $REMOTE/$SOURCE_BRANCH:production
   ```
   This makes the remote's `production` point at the same commit as the source branch. The server rejects any non-fast-forward push, so this cannot create a merge commit or clobber production — a divergence aborts it, exactly as `--ff-only` would.

   If it is rejected as non-fast-forward, **stop**. Production has diverged from the source branch — the hotfix rebase in Step 1 was not completed. Do not add `--force`.

   The refspec push's only cost is that the local `production` branch stays where it was. Nothing in this workflow reads it, and one line resyncs it:
   ```bash
   git fetch $REMOTE && git branch -f production $REMOTE/production
   ```

   *Alternative, if the user wants local branches to move along with the release:* `git checkout production && git merge $REMOTE/$SOURCE_BRANCH --ff-only && git push $REMOTE production`. Identical result on the remote, but it rewrites the working tree twice and leaves HEAD on `production`.

3. **Push the tag**:
   ```bash
   git push $REMOTE $NEXT_VERSION
   ```

4. **Create the GitHub release** using the approved release notes:
   ```bash
   gh release create $NEXT_VERSION --repo $REPO --target production \
     --title "$NEXT_VERSION" --notes-file <release-notes-file>
   ```
   `$REPO` comes from Setup. Pass `--repo` explicitly: without it `gh` fails with `No default remote repository has been set`.

5. Print the Discord announcement markdown for the user to copy.

**Always confirm with the user before pushing and creating the GitHub release.** These are public-facing, non-reversible actions.

**If a push or release command is blocked by the permission layer**, do not look for a way around it. Report exactly what is done so far and hand the user the remaining commands to run themselves, then verify the outcome:
```bash
git fetch $REMOTE --tags && git log --oneline -1 $REMOTE/production
gh release view $NEXT_VERSION --repo $REPO --json tagName,isDraft,url
```

## Step 6b: Two-Build Deploy

Use this instead of Step 6's item 2 when Step 1.5 reported an `UNSAFE` line. Everything else in Step 6 is unchanged: the tag still names the source branch's tip, and the GitHub release still targets `production`.

`$SPLIT` is the SHA that Step 1.5 reported, or the one Step 1.6 produced.

1. **Deploy the code that stops reading the column:**
   ```bash
   git push $REMOTE $SPLIT:production
   ```
   This is a fast-forward, because `$SPLIT` is an ancestor of the tip. The migration is not in this tree, so the schema does not change.

2. **Wait for it to serve traffic:**
   ```bash
   .claude/skills/release/scripts/wait-for-commit.sh https://opencouncil.gr/api/health $SPLIT
   ```
   This takes about 10 minutes. The script prints a line every 30 seconds. Report progress to the user; do not wait silently.

   If it times out, **stop**. Do not push the second build. Production serves `$SPLIT`, which is a working tree, so there is no incident. Report it and hand the check to the user.

3. **Deploy the migration:** continue with Step 6 from item 2 onward, unchanged. The code serving traffic during that build is `$SPLIT`, which no longer reads the dropped column.

Only the tip is tagged. One release produces one tag, and `$SPLIT` gets none.

**The first release that ships `/api/health` cannot poll it**, because the route reaches production only through that release. Skip item 2 for that release. This is accepted; do not build a fallback.


## Notes

- Stop only when the source branch has nothing past the **last tag** — that, not "nothing past production", is what makes a release empty.
- If the commit history is messy (many fixups, WIP commits), focus on the diff rather than the messages to understand what actually changed.
- **Linear history is enforced**: source branch and production must always share a linear history. Step 6's refspec push guarantees it server-side (git rejects non-fast-forwards by default), as would `--ff-only` locally. If it is rejected, something is wrong — investigate rather than forcing.
