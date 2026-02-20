# Pre-PR Quality Check

You are running a comprehensive quality check before a Pull Request is opened. Your job is to find real issues — not to nitpick style. Focus on things that would cause a reviewer to request changes.

## Git Workflow Context

This project uses a fork-based workflow. Contributors push to their fork (`origin`) and open PRs against the upstream repository (`upstream`). When running commands:
- **Base branch**: Use `upstream/main` if the `upstream` remote exists, otherwise `origin/main`
- **Push target**: Always push to `origin` (the contributor's fork)
- **PR target**: PRs are opened from `origin` against `upstream`

## Setup: Gather Context

First, determine the base branch:

```bash
# Determine the base ref
git remote | grep -q upstream && BASE=upstream/main || BASE=origin/main
git merge-base HEAD $BASE
```

Collect (using `$BASE` throughout):
- **Changed files**: `git diff --name-only $(git merge-base HEAD $BASE)..HEAD`
- **Full diff**: `git diff $(git merge-base HEAD $BASE)..HEAD`
- **Commit messages**: `git log --format="%H%n%s%n%n%b%n---" $(git merge-base HEAD $BASE)..HEAD`
- **Number of commits**: `git rev-list --count $(git merge-base HEAD $BASE)..HEAD`

Read the project standards documents — these are your source of truth for what the rules are:
- Read `CONTRIBUTING.md` (for commit and process standards)
- Read `CLAUDE.md` (for code standards)

If either file is missing, note it and skip the checks that depend on it.

## Check 1: Commit Hygiene

Using the standards from `CONTRIBUTING.md` sections on "Committing Patches" and "Squashing Commits", verify:

1. **No fixup/squash commits remaining** — reject subjects starting with `fixup!`, `squash!`, `amend!`, or `WIP`
2. **No @mentions** — scan all commit messages for `@username` patterns
3. **Message format** — subject line exists and is <=50 chars; body is separated by blank line if present
4. **Message accuracy** — cross-reference each commit's message against its actual diff. Flag messages that don't accurately describe their changes (e.g., says "refactor" but adds new functionality, or describes changes to files not in the diff)

## Check 2: Code Quality (changed files only)

Using the rules from `CLAUDE.md` "Code Guidelines" section, check **only the changed files**. Do not review unchanged code.

### Dead code detection
For every **new or modified** exported function, component, type, or constant:
- Search the codebase for usages beyond its definition file
- Flag symbols that are defined but never imported/used elsewhere (unless they are page components, API route handlers, or other framework entry points)

### DRY violations
- Scan changed files for magic strings/numbers appearing 2+ times that should be constants
- Look for duplicated code blocks (5+ similar lines) within and across changed files
- Check if similar logic already exists elsewhere in the codebase that could be reused

### CLAUDE.md rule compliance
Apply every rule from the "Code Guidelines" and "Code Organization & DRY Principles" sections against the changed files. Common things to check:
- No `any` types or casts to `any`
- Path imports use `@/` alias
- No unnecessary dynamic imports
- Dev components use conditional `require()` pattern (not static imports)
- Server-side URLs use `env.NEXTAUTH_URL`, not `NEXT_PUBLIC_*`
- Imports are at the top of files
- Time formatting uses utilities from `src/lib/formatters/time.ts`

## Check 3: Production Safety

**Only run this check if any changed files are in `src/components/dev/`, `src/app/api/dev/`, or if new npm packages were added.**

Using the standards from `CLAUDE.md` "Dev-Only Components" section:

1. **Import chain tracing**: For every file in `src/components/dev/`, search all non-dev files for static imports of that component. The only allowed pattern is conditional `require()` guarded by `process.env.NODE_ENV === 'development'`
2. **API route guards**: Check that every handler in `src/app/api/dev/` routes guards execution with a development environment check
3. **New dependencies**: If `package.json` changed, check if any new packages are only used in dev paths but added to `dependencies` instead of `devDependencies`

If no dev files were touched and no new packages added, mark this check as **N/A**.

## Check 4: Build & Lint

Run the build and lint commands. Use `nix develop --command` prefix as required by the project.

```bash
nix develop --command npm run build
```

```bash
nix develop --command npm run lint
```

For lint output, only flag warnings/errors from **changed files**. Ignore pre-existing lint issues in unchanged files.

If the build fails, this is an automatic **FAIL** — report the error and stop further checks.

## Check 5: Tests

```bash
nix develop --command npm test
```

- Report any test failures
- If new files were added that contain logic (not just types/constants), note whether corresponding test files exist (this is a **WARN**, not a fail)

## Final Report

Present results as a summary table, then details.

### Summary

```
| Check                | Status              |
|----------------------|---------------------|
| Commit Hygiene       | PASS / FAIL / WARN  |
| Code Quality         | PASS / FAIL / WARN  |
| Production Safety    | PASS / FAIL / N/A   |
| Build & Lint         | PASS / FAIL         |
| Tests                | PASS / FAIL / WARN  |
```

### Verdict

State one of:
- **READY FOR PR** — all checks pass (warnings are acceptable)
- **NEEDS ATTENTION** — one or more checks failed; list what must be fixed

### Details

For each finding:
- Reference the specific `file:line` location
- Explain what the issue is and why it matters
- Suggest a fix when the solution is obvious

Keep the report concise. Group related findings together. Don't pad the report with praise for things that are fine — focus on what needs attention.

## Fixing Findings

When the user asks you to fix issues from the report, commit each fix as a `fixup!` commit targeting the original commit that introduced the issue. This preserves atomic commit history — the user can then run `git rebase --autosquash` to fold fixes into their respective commits before opening the PR.

For example, if commit `abc123 feat: add widget` introduced a DRY violation:
```bash
git commit --fixup=abc123
```
