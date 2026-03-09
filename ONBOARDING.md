# Onboarding Guide

Welcome to OpenCouncil! This guide is a single entry point for new contributors, connecting the development setup, git worktree practices, and the co-creation AI workflow into a step-by-step onboarding journey.

If you are working with an AI assistant, it can use this document as a starting point to help orient you. Feel free to ask it to explain any concept mentioned here in more detail.

---

## Are You New to Open Source?

If terms like **Issues**, **Pull Requests (PRs)**, and **Branches** are unfamiliar, start here:

- **Issues** are how we track bugs, features, and tasks. Browse [our open issues](https://github.com/schemalabz/opencouncil/issues) to find something to work on.
- **Pull Requests** are how you propose changes. You create a branch, make your changes, and open a PR for review.
- **Worktrees** let you work on multiple branches simultaneously without switching back and forth. See the [worktree section in CONTRIBUTING.md](./CONTRIBUTING.md#working-with-multiple-features-simultaneously) for our recommended workflow.

If you already know these concepts, skip ahead to the [Contributor Journey](#contributor-journey).

---

## Essential Documentation Map

Use this table to quickly find the right documentation based on what you want to do.

| Goal | Document |
|------|----------|
| Run the app for the first time | [README.md - Development Setup](./README.md#development-setup) |
| Understand the contribution workflow | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Use the Nix dev environment | [docs/nix-usage.md](./docs/nix-usage.md) |
| Use the Docker dev environment | [docs/docker-usage.md](./docs/docker-usage.md) |
| Configure environment variables | [docs/environment-variables.md](./docs/environment-variables.md) |
| Understand database seeding and test users | [docs/database-seeding.md](./docs/database-seeding.md) |
| Learn about the task processing system | [docs/task-architecture.md](./docs/task-architecture.md) |
| Write or understand Architectural Guides | [docs/guides/framework.md](./docs/guides/framework.md) |
| Work with AI co-pilots (prompts) | [docs/prompts/](./docs/prompts/) |
| Set up preview deployments | [docs/guides/preview-deployments.md](./docs/guides/preview-deployments.md) |
| Understand the UI component library | [docs/ui-components-guide.md](./docs/ui-components-guide.md) |
| Styling conventions | [docs/style.md](./docs/style.md) |

---

## Contributor Journey

### Phase 1: Exploration

Get familiar with what OpenCouncil does and how the project is organized.

1. **Read the [README.md](./README.md)** to understand the project mission: making local government transparent and accessible by digitizing, transcribing, and searching municipal council meetings.
2. **Browse the live site** at [opencouncil.gr](https://www.opencouncil.gr) to see the product in action.
3. **Explore the [GitHub Projects board](https://github.com/orgs/schemalabz/projects/1)** to see our roadmap and what is being worked on.
4. **Read [CONTRIBUTING.md](./CONTRIBUTING.md)** to understand the co-creation workflow with AI co-pilots.

### Phase 2: Setup

Get the development environment running on your machine.

#### Prerequisites

You need **one** of the following setups:

| Setup | Requirements | Recommended for |
|-------|-------------|-----------------|
| **Nix (recommended)** | [Nix with flakes](https://install.determinate.systems/nix) | NixOS users, reproducible environments |
| **Docker** | Docker Engine + Docker Compose | Quick start, most platforms |
| **Manual** | Node.js 18+, PostgreSQL 14+ with PostGIS | Full control over services |

#### Step-by-step

1. **Fork and clone the repository:**
   ```bash
   gh repo fork schemalabz/opencouncil --clone
   cd opencouncil
   ```

2. **Copy the environment file:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to fill in your API keys and configuration. See [docs/environment-variables.md](./docs/environment-variables.md) for details on each variable.

3. **Start the development environment** using your preferred method:

   **Nix (recommended):**
   ```bash
   nix run .#dev
   ```
   This launches a `process-compose` TUI that manages the database, Next.js dev server, and Prisma Studio automatically. See [docs/nix-usage.md](./docs/nix-usage.md) for all options (remote DB, Docker DB, etc.).

   **Docker:**
   ```bash
   ./run.sh
   ```
   This starts the dockerized PostgreSQL, runs migrations, seeds the database, and launches the dev server. See [docs/docker-usage.md](./docs/docker-usage.md) for advanced options.

   **Manual:**
   ```bash
   npm install
   docker compose up db -d          # or connect to your own PostgreSQL
   npx prisma migrate deploy
   npx prisma generate
   npx prisma db seed
   npm run dev
   ```

4. **Verify it works:** Open [http://localhost:3000](http://localhost:3000) in your browser. The database is automatically seeded with sample data and test users during setup (see [docs/database-seeding.md](./docs/database-seeding.md)).

### Phase 3: Development with Worktrees

Once your environment is running, pick an issue and start developing.

1. **Find an issue** on the [Issues page](https://github.com/schemalabz/opencouncil/issues) or the [Projects board](https://github.com/orgs/schemalabz/projects/1). Items in the "Ready" column are good candidates.

2. **Create a feature branch** (use a descriptive name like `feature/transcript-tags` or `fix/login-bug`):
   ```bash
   git checkout -b feature/your-feature-name main
   ```

3. **Use worktrees for parallel work** (optional but recommended when working on multiple features):
   ```bash
   git worktree add -b feature-branch-name ../opencouncil-feature-name main
   cd ../opencouncil-feature-name
   ./run.sh   # Automatically picks available ports
   ```
   See [CONTRIBUTING.md](./CONTRIBUTING.md#working-with-multiple-features-simultaneously) for the full worktree workflow, including cleanup.

4. **Use the AI co-pilots** to help with planning and implementation:
   - **Idea creation:** [docs/prompts/idea-creation.prompt.md](./docs/prompts/idea-creation.prompt.md) -- for turning raw ideas into well-defined issues.
   - **PRD creation:** [docs/prompts/prd-creation.prompt.md](./docs/prompts/prd-creation.prompt.md) -- for expanding issues into detailed plans.
   - **Implementation:** [docs/prompts/implementation.prompt.md](./docs/prompts/implementation.prompt.md) -- for AI pair programming during development.
   - **PR creation:** [docs/prompts/pull-request-creation.prompt.md](./docs/prompts/pull-request-creation.prompt.md) -- for writing comprehensive PR descriptions.

### Phase 4: Pull Request

When your changes are ready, submit them for review.

1. **Verify your changes build successfully:**
   ```bash
   npm run build
   ```

2. **Run the test suite:**
   ```bash
   npm test
   ```

3. **Run the pre-PR check** (if using Claude Code):
   ```
   /pre-pr
   ```

4. **Keep commits atomic and hygienic** -- each commit should build on its own and include any related test updates. Write clear, verbose commit messages. See the [committing guidelines in CONTRIBUTING.md](./CONTRIBUTING.md#committing-patches).

5. **Rebase on main** before submitting:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

6. **Open the Pull Request:**
   - Write a clear title.
   - Include `Closes #[issue_number]` in the description.
   - Use the [PR creation prompt](./docs/prompts/pull-request-creation.prompt.md) for help writing the description.

---

## Common Commands

### Development

| Command | Description |
|---------|-------------|
| `nix run .#dev` | Start full dev environment via Nix (recommended) |
| `./run.sh` | Start full dev environment via Docker |
| `npm run dev` | Start only the Next.js dev server |
| `npm run dev:fast` | Dev server with increased memory, telemetry disabled |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm test -- path/to/file.test.ts` | Run a specific test file |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:integration` | Run integration tests (requires Docker) |

### Database (Prisma)

| Command | Description |
|---------|-------------|
| `npm run prisma:generate` | Generate Prisma Client after schema changes |
| `npm run prisma:migrate` | Run migrations in dev |
| `npm run prisma:studio` | Open Prisma Studio (visual DB editor) |
| `npm run prisma:migrate:reset` | Reset database and re-run all migrations |
| `npx prisma db seed` | Seed the database with sample data |

> **Note:** When using Nix, prefix commands with `nix develop --command`, e.g., `nix develop --command npm run build`. Inside a `nix develop` shell, the prefix is not needed.

---

## Architecture Overview

OpenCouncil is a **Next.js 14** web application with the following stack:

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router, TypeScript strict mode) |
| **Database** | PostgreSQL with PostGIS extension |
| **ORM** | Prisma (type-safe queries, centralized in `src/lib/db/`) |
| **Authentication** | Auth.js (NextAuth v5) with Resend email provider |
| **Search** | Elasticsearch for full-text search across transcripts |
| **AI** | Anthropic Claude for summaries and chat |
| **Storage** | DigitalOcean Spaces (S3-compatible) |
| **Styling** | Tailwind CSS + Radix UI + class-variance-authority |
| **Internationalization** | next-intl |
| **Task Processing** | Decoupled backend ([opencouncil-tasks](https://github.com/schemalabz/opencouncil-tasks)) |

### Project Structure

```
opencouncil/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── [locale]/         # Locale-parameterized routes
│   │   └── api/              # API routes
│   ├── components/           # React components
│   │   ├── ui/               # Base UI (Radix + Tailwind)
│   │   └── ...               # Domain components (meetings, chat, map, etc.)
│   ├── lib/                  # Business logic & services
│   │   ├── db/               # Data access layer (Prisma queries)
│   │   ├── db/types/         # Shared Prisma types
│   │   ├── tasks/            # Async job management
│   │   ├── search/           # Elasticsearch integration
│   │   ├── notifications/    # Multi-channel notifications (email, WhatsApp, SMS)
│   │   ├── formatters/       # Formatting utilities (time, etc.)
│   │   ├── utils/            # General utilities
│   │   └── sorting/          # Sorting functions
│   ├── contexts/             # React Context providers
│   ├── hooks/                # Custom React hooks
│   ├── types/                # TypeScript type definitions
│   └── auth.ts               # Authentication setup
├── prisma/                   # Database schema and migrations
├── docs/                     # Documentation
│   ├── guides/               # Architectural guides per feature
│   └── prompts/              # AI co-pilot prompt files
├── flake.nix                 # Nix flake configuration
├── docker-compose.yml        # Docker Compose setup
├── run.sh                    # Docker dev runner script
└── CONTRIBUTING.md           # Contribution guidelines
```

### Key Patterns

- **Data access** is centralized in `src/lib/db/` -- never query Prisma directly from components or API routes.
- **Shared types** live in `src/lib/db/types/` and are re-exported from `src/lib/db/types/index.ts`.
- **Authentication** uses `isUserAuthorizedToEdit()` and `withUserAuthorizedToEdit()` from `src/lib/auth.ts` -- both are async and must be awaited.
- **Environment variables** are validated at build time via `src/env.mjs` using `@t3-oss/env-nextjs`. Always import from `@/env.mjs` instead of using `process.env`.
- **Server Components** are the default; add `"use client"` only when client-side interactivity is needed.

---

## Need Help?

- **Discord:** Join our [Discord server](https://discord.gg/VdwtVG43WB) to ask questions, get help, and connect with other contributors.
- **AI Pilot:** If you are using an AI assistant (Claude Code, Cursor, etc.), point it at this file and the [docs/prompts/](./docs/prompts/) directory. It can act as a mentor, explain concepts, and help you navigate the codebase.
- **GitHub Issues:** If you are stuck on a specific issue, leave a comment on the issue itself -- maintainers and other contributors are happy to help.
- **GitHub Projects Board:** Check the [Projects board](https://github.com/orgs/schemalabz/projects/1) to see what is currently in progress and find items ready to be picked up.
