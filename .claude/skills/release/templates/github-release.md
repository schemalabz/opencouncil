# GitHub Release Notes Template

Generate release notes for a GitHub Release. These are read by developers, contributors, and technical users who follow the project.

## Tone

Technical but accessible. Concise. No marketing language. Factual.

## Structure

```markdown
## Highlights

<!-- 1-3 sentence summary of what this release brings. Lead with the most impactful change. -->

## What's New

<!-- Bulleted list of new features. Each bullet: what it does and why it matters, in one line. -->
<!-- Omit this section if there are no new features. -->

## Changes

<!-- Bulleted list of enhancements to existing features. -->
<!-- Include UI polish, performance improvements, UX changes. -->
<!-- Omit this section if there are none. -->

## Fixes

<!-- Bulleted list of bug fixes. Each bullet: what was broken and what the fix does. -->
<!-- Omit this section if there are no fixes. -->

## Internal

<!-- Bulleted list of refactors, dependency updates, CI changes. -->
<!-- Keep this brief — one line per item. -->
<!-- Omit this section if there's nothing notable. -->

## Contributors

<!-- One line thanking everyone who authored code in this release, by @username: -->
<!-- "Thanks to @user1, @user2 and @user3 for contributing to this release." -->
```

## Rules

- **Don't list every commit** — group related changes into single bullets
- **Lead with user impact**, not implementation: "Meeting search now supports date range filters" not "Add date range params to SearchQuery type"
- **Reference PRs/issues** where relevant: `(#123)`
- **Skip trivial changes** — typo fixes, formatting, minor refactors don't need individual bullets unless they're the only changes
- **Always include the "Contributors" section** — GitHub builds the release page's contributor avatar list from the users @-mentioned in the release body, not from the commits. Without mentions, only the release author is shown. Use the usernames collected in Step 2 of the skill; never guess usernames from commit author names
- **Empty sections should be omitted entirely**, not left with "None" or "N/A"
