# Contributing to OpenCouncil

OpenCouncil operates an open contributor model where anyone is welcome to contribute towards development in the form of peer review, testing and patches. This document explains the practical process and guidelines for contributing

## Getting Started

To get started with development, you'll need to set up the project on your local machine. The main `README.md` file contains detailed, up-to-date instructions for this process. We recommend you follow that guide before proceeding.

> [!TIP]
> Please follow the [Development Setup guide in our README.md](./README.md#development-setup) to get your environment up and running.

## Contributor Workflow

Our development methodology is founded on a **co-creation partnership** between human contributors and AI. The human provides the creative leadership and strategic direction; the AI acts as a thinking partner and a powerful co-creator, automating the heavy lifting of planning and coding. **This process is supported by a series of dedicated AI co-pilots, each guided [by a prompt that can be found in our repository](/docs/prompts/)**.

This workflow is designed to be flexible. A single contributor can take a task from start to finish, or different contributors can collaborate on separate steps. Anyone is welcome to initiate any part of the process.

### How to Contribute: From Idea to Issue

All work is tracked via GitHub Issues. Whether an idea comes from our public roadmap or a new proposal from a contributor, it must become a well-defined issue before development can begin. This ensures every task is clearly specified.

There are two primary sources for contributions:

1.  **Our Public Roadmap**: Our [GitHub Projects board](https://github.com/orgs/schemalabz/projects/1) contains our high-level roadmap. When an item from the backlog is ready to be worked on, we move it to the "Ready" column. This signals that it's ready to be fleshed out into a full GitHub Issue.

2.  **New Proposals**: If you have a new feature idea, a bug report, or a suggestion not on our roadmap, you can propose it directly.

#### The Issue Creation Process

Both roadmap items and new proposals are transformed into a formal GitHub Issue through a collaborative process between a contributor and an AI co-pilot.

1.  A contributor takes a raw idea—either from the roadmap's "Ready" column or their own proposal.
2.  They engage the "Idea Creation" AI co-pilot ([`docs/prompts/idea-creation.prompt.md`](./docs/prompts/idea-creation.prompt.md)).
3.  Through a collaborative dialogue, the AI helps the contributor clarify their thoughts, link it to a Feature Pillar (an existing Architectural Guide), and formulate a clear description.
4.  The final output is a perfectly formatted GitHub Issue, ready to be created. Once the issue is created, it is ready to be picked up for development.

### Collaborative Planning: The PRD

This step is most useful for complex features or changes. A well-defined GitHub Issue is expanded into a detailed, actionable plan called a Product Requirements Document (PRD). This is a co-creation process where a contributor acts as the creative lead and an AI co-pilot serves as a co-creator.

1.  A contributor selects a GitHub Issue.
2.  They engage the "PRD Creation" AI co-pilot ([`docs/prompts/prd-creation.prompt.md`](./docs/prompts/prd-creation.prompt.md)), providing the Issue content.
3.  The AI reads the Issue, the linked Architectural Guide, and proactively gathers context from the codebase.
4.  The AI drafts a complete PRD, and the human-AI team iterates on it until the plan is solid.

### Implementation: AI Pair Programming

With a plan from a PRD or a simple Issue, the next step is to translate it into production-ready code and documentation. This is done collaboratively, with a human developer acting as the lead/reviewer and an AI pair programmer assisting with implementation.

1.  With a finalized plan, the developer engages the "Implementation" AI pair programmer ([`docs/prompts/implementation.prompt.md`](./docs/prompts/implementation.prompt.md)).
2.  The AI proposes a technical strategy, and together they tackle the implementation file-by-file.
3.  The AI writes the code, the human reviews, provides direction, and tests.
4.  As the final step, they collaboratively update any relevant Architectural Guide.
5.  The final Pull Request contains both the new code and the updated documentation.

### Committing Patches

To maintain a clean and understandable project history, we follow best practices for creating commits. While our AI pair programmer assists in this process, the human contributor is the final reviewer responsible for the quality of each commit.

-   **Keep Commits Atomic:** In general, commits should be atomic and diffs should be easy to read. For this reason, do not mix any formatting fixes or code moves with actual code changes.

-   **Ensure Commits are Hygienic:** Make sure each individual commit is hygienic: that it builds successfully on its own without warnings, errors, regressions, or test failures. This means tests must be updated in the same commit that changes the behavior.

-   **Write Clear Commit Messages:** Good commit messages are crucial for future contributors, both human and AI. We utilize tools like Cursor's built-in generator as a starting point, but we ask contributors to ensure the final message is verbose by default and follows this structure:
    -   A short subject line (50 characters max).
    -   A blank line.
    -   Detailed explanatory text as separate paragraph(s), explaining the reasoning for your decisions. A single title line is sufficient only if it is completely self-explanatory (e.g., "Correct typo in CONTRIBUTING.md").

-   **No @mentions:** Please do not include any `@mentions` in commit messages.

### Squashing Commits

If your pull request contains small, incremental, or "fixup" commits (commits that change the same line of code repeatedly), you may be asked to [squash](https://git-scm.com/docs/git-rebase#_interactive_mode) your commits. This makes the history easier to read and understand. The basic squashing workflow is shown below.

```bash
git checkout your_branch_name
git rebase -i HEAD~n
# n is normally the number of commits in the pull request.
# Set commits from 'pick' to 'squash' (or other actions as needed), save and quit.
# On the next screen, edit/refine commit messages.
# Save and quit.
git push -f # (force push to GitHub)
```

Please update the resulting commit message, if needed. It should read as a coherent message. In most cases, this means not just listing the interim commits.

If your change contains a merge commit, the above workflow may not work and you will need to remove the merge commit first. See the next section for details on how to rebase.


### Rebasing Changes

Before your pull request can be merged, it needs to be up-to-date with the `main` branch. Instead of merging the `main` branch into your feature branch, we prefer that you [rebase](https://git-scm.com/docs/git-rebase) your branch on top of `main`. This creates a clean git history, where code changes are only made in non-merge commits. This simplifies auditability because merge commits can be assumed to not contain arbitrary code changes. The basic rebasing workflow is shown below.

```bash
git checkout your_branch_name
git fetch origin
git rebase origin/main
# If conflicts arise, resolve them, stage the resolved files, and continue with:
# git rebase --continue
# Repeat until rebase is complete.
git push -f # (force push to GitHub)
```

### Creating the Pull Request

Once your code and documentation changes are complete, you are ready to submit a Pull Request. Please follow these guidelines to ensure a smooth review process.

1.  **Branch Naming:** Create a descriptive branch name.
    -   Examples: `feature/transcript-tags`, `fix/login-bug`.
    -   If your Pull Request is based on a PRD, name your branch after the PRD file (e.g., `add-review-flag-to-utterances`) for a clear link between the plan and implementation.
2.  **PR Title:** Write a clear and concise title that summarizes the change.
3.  **Link to the Issue:** In the PR description, include the phrase `Closes #[issue_number]` to automatically link your PR to the GitHub Issue that it resolves.
4.  **PR Description:** A good description is vital for reviewers. We have a dedicated AI co-pilot prompt ([`docs/prompts/pull-request-creation.prompt.md`](./docs/prompts/pull-request-creation.prompt.md)) to help you write a comprehensive one.
5.  **Draft PRs:** If your work is still in progress but you'd like to get early feedback, please open a "Draft" Pull Request.
