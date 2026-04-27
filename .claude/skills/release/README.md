# Release Skill

A portable Claude Code skill for CalVer releases with multi-channel content generation.

## What It Does

`/release` handles the full release cycle:

1. **Pre-flight** — checks branch state, creates backup branches, detects hotfixes that need rebasing
2. **Content generation** — reads the diff between staging and production, generates two markdown outputs:
   - **GitHub Release notes** — technical, for developers and contributors
   - **Discord announcement** — casual, for the community
3. **Release** — fast-forwards production to staging, tags a CalVer version, creates a GitHub release

You review and approve everything before any public-facing action.

## Setup

### 1. Install the skill

Copy the `release/` directory into your project's `.claude/skills/`:

```
.claude/skills/release/
├── SKILL.md
├── README.md
├── templates/
│   ├── github-release.md
│   └── discord.md
```

### 2. Adopt Conventional Commits

The quality of generated release content depends on well-structured commits. Your project should follow [Conventional Commits](https://www.conventionalcommits.org/). Document the convention in your `CONTRIBUTING.md` (for humans) and reference it from your `CLAUDE.md` (for AI agents).

The skill parses commit types (`feat`, `fix`, `refactor`, etc.) to categorize changes, but also reads the actual diff — so it works even with imperfect commit messages.

### 3. Prerequisites

The skill uses standard tools:
- `git` — with permission to create tags and push to staging/production branches
- `gh` — GitHub CLI, authenticated (`gh auth status`)

### 4. Git workflow requirements

The skill assumes:
- **Two deployment branches**: `staging` and `production`
- **Linear history**: production is always fast-forwarded to staging (`--ff-only`), never merge commits
- **Hotfix handling**: if production has commits staging doesn't, staging is rebased on top of production before the release

The remote is detected automatically (`upstream` if it exists, otherwise `origin`).

### 5. Customize templates (optional)

Edit the files in `templates/` to match your project's voice and audience. The defaults are generic enough for most projects.

## Usage

```
/release              # Full release: generate content, merge, tag, create GitHub release
/release dry-run      # Generate content only, no merge/tag/GitHub release
```

## CalVer Scheme

Versions follow `YYYY.MM.N`:
- `YYYY` — four-digit year
- `MM` — month (no leading zero)
- `N` — sequential counter, starting at 1, resets each month

Examples: `2026.4.1`, `2026.4.2`, `2026.5.1`

Used by: pip, Ubuntu, JetBrains IDEs, Unity, and others.

## How It Works

1. Detects the upstream remote (`upstream` or `origin`)
2. Creates backup branches for both staging and production
3. Checks for production-only hotfixes — requires rebase if found
4. Finds the last `YYYY.MM.*` tag and reads all changes since
5. Categorizes changes by user impact
6. Generates two markdown outputs, each with its own tone and audience
7. On approval: fast-forwards production to staging, tags, pushes, creates GitHub release
8. Prints Discord announcement markdown for you to copy

The skill reads the actual diff, not just commit messages. This means it can produce accurate release notes even if commit messages are imperfect — though good commits make the output better.
