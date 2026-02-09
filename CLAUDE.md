# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

### Development
- `npm run dev` - Start development server with Turbo
- `npm run dev:fast` - Dev server with increased memory and telemetry disabled
- `npm run build` - Production build
- `npm run start` - Start production server

### Testing
- `npm test` - Run all tests (Jest + React Testing Library)
- `npm test -- path/to/file.test.ts` - Run specific test file
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests with testcontainers

### Database (Prisma)
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run migrations in dev
- `npm run prisma:studio` - Open Prisma Studio (visual editor)
- `npm run prisma:migrate:reset` - Reset database and re-run migrations
- `npx prisma db seed` - Seed database with sample data

### Utility Scripts
- `npm run lint` - Run ESLint
- `npm run email` - Test municipality email sending
- `npm run import:people` - Import people data
- `npm run generate-seed` - Generate seed data dump

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14 with App Router and TypeScript (strict mode)
- **Database**: PostgreSQL with PostGIS extension
- **ORM**: Prisma with type-safe queries
- **Authentication**: Auth.js (NextAuth v5) with Resend email provider
- **Search**: Elasticsearch for full-text search
- **AI**: Anthropic Claude for summaries and chat
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Styling**: Tailwind CSS + Radix UI components
- **i18n**: next-intl for internationalization

### Directory Structure
```
src/
├── app/              # Next.js App Router
│   ├── [locale]/    # Locale-parameterized routes
│   └── api/         # API routes (cities, search, chat, admin, etc.)
├── components/       # React components
│   ├── ui/          # Base UI components (Radix + Tailwind)
│   └── ...          # Domain-specific components (meetings, chat, map, etc.)
├── lib/             # Business logic & services
│   ├── db/          # Data access layer (Prisma queries)
│   ├── tasks/       # Task management for async jobs
│   ├── search/      # Elasticsearch integration
│   ├── notifications/ # Multi-channel notification system
│   ├── ai.ts        # Anthropic Claude integration
│   ├── s3.ts        # DigitalOcean Spaces
│   └── ...          # Other services (Discord, Google Calendar, etc.)
├── contexts/        # React Context for shared state
├── hooks/           # Custom React hooks
├── types/           # TypeScript type definitions
└── auth.ts          # Authentication setup
```

### Data Access Patterns

**All database queries use centralized functions in `src/lib/db/`**:
- `cities.ts` - City queries
- `meetings.ts` - Meeting queries
- `notifications.ts` - Notification logic
- Single Prisma instance with connection pooling

**Type Storage**:
- Store shared Prisma types in `src/lib/db/types/{entity}.ts`
- Re-export from `src/lib/db/types/index.ts`
- Import from `@/lib/db/types` to prevent circular dependencies

### Authentication Patterns

**Always use methods from `src/lib/auth.ts`**:
- `isUserAuthorizedToEdit()` - Returns boolean (for conditional UI)
- `withUserAuthorizedToEdit()` - Throws if not authorized (for API routes)

**CRITICAL**: Both methods are async and must be await-ed to prevent auth bypass bugs.

Example:
```typescript
const editable = await isUserAuthorizedToEdit({ cityId: data.meeting.cityId });
// or
await withUserAuthorizedToEdit({ partyId: params.partyId });
```

### Task System Architecture

OpenCouncil uses a **decoupled async job processing system**:

1. **Frontend** (this repo): Queues tasks in database as `TaskStatus` records
2. **Backend Server**: Separate service at `TASK_API_URL` processes tasks
3. **Callback Flow**: Backend POSTs results to `/api/taskStatuses/{id}`

**Task types** in `src/lib/tasks/`:
- `transcribe.ts` - Audio transcription
- `summarize.ts` - AI-generated summaries
- `generateVoiceprint.ts` - Speaker voice recognition
- `generatePodcast.ts` - Podcast generation
- `tasks.ts` - Task orchestration

**Discord Integration**: Admin alerts for task events via `DISCORD_WEBHOOK_URL`

### Search System

Located in `src/lib/search/`:
- Elasticsearch backend for full-text search across transcripts
- Natural language query parsing with filter extraction
- Supports filters: city, person, party, topic, date range, location
- Retry logic with exponential backoff

### Notification System

Multi-channel delivery in `src/lib/notifications/`:
- **Email**: Via Resend
- **WhatsApp**: Via Bird API
- **SMS**: Via Bird API
- Matching engine for user preferences (topics, locations, people, parties)
- Approval workflow with pending queue
- Rate limiting (500ms delays between sends)

### Key Integrations

| Service | Purpose | Key Files |
|---------|---------|-----------|
| Anthropic Claude | AI summaries, chat | `src/lib/ai.ts` |
| Elasticsearch | Full-text search | `src/lib/search/` |
| Resend | Email auth & notifications | Auth config, `src/lib/notifications/` |
| Bird API | WhatsApp/SMS | `src/lib/notifications/bird.ts` |
| DigitalOcean Spaces | Video/audio storage | `src/lib/s3.ts` |
| Google Calendar | Event scheduling | `src/lib/google-calendar.ts` |
| Discord | Admin alerts | `src/lib/discord.ts` |
| Mapbox | Interactive maps | `src/components/map/` |

## Git Commit Rules
- Never add `Co-Authored-By` lines for AI in commit messages

## Code Guidelines

### General Rules
- Never cast to `any` or use `any` as a type
- Path imports: Use `@/` alias for src directory (e.g., `@/lib/db/cities`)
- Never use dynamic imports unless explicitly requested
- Avoid unnecessary try/catch blocks
- Never create markdown files after completing tasks (unless directly asked)
- Use time formatting utilities from `src/lib/formatters/time.ts` (e.g., `formatTimestamp`, `formatDate`, `formatDuration`)

### Code Organization & DRY Principles

**Import Organization**:
- **All imports must be at the top of the file** - Never use dynamic imports or imports in the middle of functions unless absolutely necessary
- Group imports logically: React/Next.js first, then third-party, then local
- Use consistent import style within a file

**Don't Repeat Yourself (DRY)**:
- **Always check for duplicated logic** - If two components have similar code blocks (>10 lines), extract to a shared utility
- Common extraction targets:
  - Filtering/sorting logic → Extract to `src/lib/utils/` or `src/lib/sorting/`
  - URL parameter handling → Extract to utilities
  - Data transformation logic → Extract to utilities
  - Complex calculations → Extract to helper functions
- **Location for shared utilities**:
  - `src/lib/utils/` - General utilities (e.g., `filterURL.ts`, `administrativeBodies.ts`)
  - `src/lib/sorting/` - Sorting functions (e.g., `people.ts`)
  - `src/lib/formatters/` - Formatting functions (e.g., `time.ts`)

**Before committing code**:
1. Search for similar code patterns in the codebase
2. Check if logic exists in multiple places
3. Extract duplicates to shared utilities
4. Ensure all imports are at the top of files

### TypeScript
- Strict mode is enabled
- Use interfaces/types for data structures
- Proper error typing in catch blocks

### React Components
- Functional components with hooks only
- PascalCase for component names
- camelCase for functions/variables
- Server Components by default, Client Components (`"use client"`) when needed
- Server Actions with `"use server"` directive

### Forms & Validation
- React Hook Form for form handling
- Zod schemas for validation
- `@hookform/resolvers` for integration

### Styling
- Tailwind CSS utility-first approach
- class-variance-authority for component variants
- Radix UI primitives for accessible components
- Framer Motion for animations

### Testing
- Jest with jsdom environment
- React Testing Library for component tests
- Testcontainers for integration tests with PostgreSQL
- Module alias `@/` mapped in jest.config.js

## Database Schema Notes

**Key Models** (30+ total):
- `City` - Municipalities with PostGIS geometry
- `CouncilMeeting` - Meetings with media
- `Person` - Council members with voiceprints
- `Party` - Political parties
- `SpeakerSegment` - Speaker time intervals
- `Utterance` & `Word` - Transcription data
- `Subject` - Agenda items
- `Notification` - User notifications
- `TaskStatus` - Async job tracking

**Composite Keys**: Many models use `(cityId, id)` pairs for multi-tenant data isolation

## Environment Setup

Required services:
- PostgreSQL 14+ with PostGIS extension
- Elasticsearch instance
- Task API server (separate backend)
- S3-compatible storage (DigitalOcean Spaces)

See `.env.example` for required environment variables.
