# Contributing to OpenCouncil

OpenCouncil operates an open contributor model where anyone is welcome to contribute towards development in the form of peer review, testing and patches. This document explains the practical process and guidelines for contributing

## Getting Started

To get started with development, you'll need to set up the project on your local machine. The main `README.md` file contains detailed, up-to-date instructions for this process. We recommend you follow that guide before proceeding.

> [!TIP]
> Please follow the [Development Setup guide in our README.md](./README.md#development-setup) to get your environment up and running.

## Contributor Workflow

Our development methodology is founded on a **co-creation partnership** between human contributors and AI. The human provides the creative leadership and strategic direction; the AI acts as a thinking partner and a powerful co-creator, automating the heavy lifting of planning and coding.

This workflow is designed to be flexible. A single contributor can take a task from start to finish, or different contributors can collaborate on separate steps. Anyone is welcome to initiate any part of the process.

### The Starting Point: The GitHub Issue

**Purpose**: This is the entry point for all contributions. Whether you have an idea for a new feature, have found a bug, want to improve our documentation, or suggest a refactoring, creating an issue is the first step.  
**Audience**: Any contributor and an AI co-pilot.

#### Crafting the Issue
1.  A contributor has a raw idea, a bug report, or any other starting point.
2.  They engage the "Idea Creation" AI co-pilot.
3.  Through a collaborative dialogue, the AI helps the contributor clarify their thoughts, link it to a Feature Pillar (an existing Architectural Guide), and formulate a clear description.
4.  The final output is a perfectly formatted GitHub Issue, ready to be created.

#### LLM Workflow
> (see `docs/prompts/idea-creation.prompt.md`)

### Collaborative Planning: The PRD

**Purpose**: To expand a well-defined GitHub Issue into a detailed, actionable plan. This step is most useful for complex features or changes.  
**Audience**: A contributor (as the creative lead) and an AI co-pilot (as the co-creator).

#### The AI Co-Creation Process
1.  A contributor selects a GitHub Issue.
2.  They engage the "PRD Creation" AI co-pilot, providing the Issue content.
3.  The AI reads the Issue, the linked Architectural Guide, and proactively gathers context from the codebase.
4.  The AI drafts a complete PRD, and the human-AI team iterates on it until the plan is solid.

#### LLM Workflow
> (see `docs/prompts/prd-creation.prompt.md`)

### Implementation: AI Pair Programming

**Purpose**: To collaboratively translate a plan (from a PRD or a simple Issue) into production-ready code and documentation.  
**Audience**: A human developer (as the lead/reviewer) and an AI pair programmer.

#### The AI Pair Programming Process
1.  With a finalized plan, the developer engages the "Implementation" AI pair programmer.
2.  The AI proposes a technical strategy, and together they tackle the implementation file-by-file.
3.  The AI writes the code, the human reviews, provides direction, and tests.
4.  As the final step, they collaboratively update any relevant Architectural Guide.
5.  The final Pull Request contains both the new code and the updated documentation.

#### LLM Workflow
> (see `docs/prompts/implementation.prompt.md`)

### Committing Patches

To maintain a clean and understandable project history, we follow best practices for creating commits. While our AI pair programmer assists in this process, the human contributor is the final reviewer responsible for the quality of each commit.

-   **Keep Commits Atomic:** In general, [commits should be atomic](https://en.wikipedia.org/wiki/Atomic_commit#Atomic_commit_convention) and diffs should be easy to read. For this reason, do not mix any formatting fixes or code moves with actual code changes. When implementing a plan from a PRD, each logical step or sub-step should correspond to a single commit. This ensures the project's history mirrors the structure of the plan, making changes easy to review, understand, and, if necessary, revert.

-   **Ensure Commits are Hygienic:** Make sure each individual commit is hygienic: that it builds successfully on its own without warnings, errors, regressions, or test failures. This means tests must be updated in the same commit that changes the behavior.

-   **Write Clear Commit Messages:** Good commit messages are crucial for future contributors, both human and AI. We utilize tools like Cursor's built-in generator as a starting point, but we ask contributors to ensure the final message is verbose by default and follows this structure:
    -   A short subject line (50 characters max).
    -   A blank line.
    -   Detailed explanatory text as separate paragraph(s), explaining the reasoning for your decisions. A single title line is sufficient only if it is completely self-explanatory (e.g., "Correct typo in CONTRIBUTING.md").

-   **No @mentions:** Please do not include any `@mentions` in commit messages.

### Creating the Pull Request

Once your code and documentation changes are complete, you are ready to submit a Pull Request. Please follow these guidelines to ensure a smooth review process.

1.  **Branch Naming:** Create a descriptive branch name.
    -   Examples: `feature/transcript-tags`, `fix/login-bug`.
    -   If your Pull Request is based on a PRD, name your branch after the PRD file (e.g., `add-review-flag-to-utterances`) for a clear link between the plan and implementation.
2.  **PR Title:** Write a clear and concise title that summarizes the change.
3.  **Link to the Issue:** In the PR description, include the phrase `Closes #[issue_number]` to automatically link your PR to the GitHub Issue that it resolves.
4.  **PR Description:** A good description is vital for reviewers. We have a dedicated AI co-pilot prompt to help you write a comprehensive one.
    > (see `docs/prompts/pull-request-creation.prompt.md`)
5.  **Draft PRs:** If your work is still in progress but you'd like to get early feedback, please open a "Draft" Pull Request.
