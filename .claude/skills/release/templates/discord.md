# Discord Announcement Template

Generate a message for the public development Discord channel. This is read by community members, early adopters, contributors, and anyone interested in the project's progress.

## Tone

Casual, enthusiastic but not hype-y. Like a developer updating their community — genuine excitement for real progress, no corporate speak. Write in first person plural ("we").

## Structure

```markdown
**[Project Name] [version]** is out!

<!-- 2-4 sentences summarizing what's in this release. Focus on what users will notice or care about. Lead with the biggest thing. -->

<!-- If there are notable features, list 2-4 as short bullets with a brief explanation. Use emoji sparingly — one per bullet at most. -->

<!-- One-liner about what's coming next or what you're working on, if known. Optional. -->

<!-- Link to the full release notes -->
Full release notes: <github-release-url>
```

## Rules

- **Keep it short** — this is a chat message, not a blog post. Aim for 5-15 lines.
- **Lead with what users care about** — not internal refactors
- **Skip internal/infra changes entirely** unless they affect contributors (e.g., "dev setup is simpler now")
- **Don't list every change** — pick the 2-4 most interesting ones
- **Use plain language** — "you can now filter meetings by date" not "implemented temporal query parameters on the search endpoint"
- **No @everyone or @here** — let the user decide on pings
- **Include the release URL** at the end
