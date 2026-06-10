# Plan 003: Authenticate, rate-limit, and validate the chat endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5f3425a..HEAD -- src/app/api/chat`
> If `src/app/api/chat/route.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `5f3425a`, 2026-06-10

## Why this matters

`POST /api/chat` (`src/app/api/chat/route.ts`) accepts an arbitrary request
body, runs Elasticsearch search on it, and forwards it to the Anthropic API via
`aiChatStream(...)` — with **no authentication, no rate limiting, and no input
validation**. The body is destructured straight from `req.json()` and
`messages[messages.length - 1].content` is used without bounds checks. Concretely:

- **Uncapped cost / abuse**: an anonymous caller can drive unlimited Anthropic
  and Elasticsearch calls, turning the endpoint into a money-burning DoS amplifier.
- **Crash on malformed input**: `messages.length` and
  `messages[messages.length - 1].content.substring(...)` throw if `messages` is
  absent, empty, or not an array — an unhandled 500 path on the first log line.

This plan adds (1) a per-request input schema, (2) a lightweight rate limit, and
(3) a decision point on whether chat requires a logged-in user. It deliberately
does **not** change the streaming response shape, so the frontend keeps working.

## Current state

- `src/app/api/chat/route.ts:309-338` — the POST handler. It immediately starts a
  `TransformStream`, returns the stream, then in an async IIFE does:

  ```ts
  // route.ts:328-338
  logEssential('Chat Session Started');
  const { messages, cityId, useMockData } = await req.json();
  logEssential('Chat Request Details', {
      messages: messages.length,                                   // throws if messages is undefined
      cityId: cityId || 'none',
      useMockData: shouldUseMockData(useMockData),
      lastMessage: messages[messages.length - 1].content.substring(0, 50)  // throws if empty
  });
  ```

  There is no `import { auth } from '@/auth'` and no session/bearer check in the
  file. Downstream it calls `search({...})` (`route.ts:363`) and
  `aiChatStream(enhancedPrompt.system, enhancedPrompt.messages, AI_CONFIG)`
  (`route.ts:394`).

- The request comes from the client hook `src/hooks/useChat.ts` (chat UI). The
  message shape is `{ role: 'user' | 'assistant', content: string }[]` plus an
  optional `cityId` and a dev-only `useMockData` flag (`shouldUseMockData` already
  forces it off outside `IS_DEV`, `route.ts:304-307`).

- Validation convention: this repo uses **Zod** throughout (`zod` is a
  dependency; schemas live under `src/lib/zod-schemas/` with tests in
  `src/lib/zod-schemas/__tests__/`). Match that style.

- Auth convention: `src/auth.ts` exports `auth`; server code reads the session
  via `auth()` (used in `src/middleware.ts` and elsewhere). API routes under
  `/api` are **excluded from the middleware matcher** (`src/middleware.ts:41`
  matcher `'/((?!api|_next|_vercel|.*\\..*).*)'`), so this route is not
  protected by middleware — any auth must be in the handler.

## Commands you will need

| Purpose        | Command                                  | Expected on success |
|----------------|------------------------------------------|---------------------|
| Typecheck      | `npx tsc --noEmit`                        | exit 0              |
| Unit tests     | `npm test`                               | all pass            |
| Targeted test  | `npm test -- src/app/api/chat`           | new tests pass      |
| Lint           | `npm run lint`                           | exit 0              |

## Suggested executor toolkit

- Read an existing Zod schema + its test as a pattern before writing the new one:
  `src/lib/zod-schemas/topic.ts` and `src/lib/zod-schemas/__tests__/topic.test.ts`.

## Scope

**In scope**:
- `src/app/api/chat/route.ts` (add validation + rate limit + optional auth gate)
- `src/lib/zod-schemas/chat.ts` (create — the request schema) and re-export it
  from `src/lib/zod-schemas/index.ts` if that barrel exists (match the others)
- `src/lib/zod-schemas/__tests__/chat.test.ts` (create — schema tests)

**Out of scope** (do NOT touch):
- The streaming response format / SSE event shape — the client depends on it.
- `src/lib/ai.ts` (`aiChatStream`) and `src/lib/search/*` — leave AI/search
  internals alone.
- The mock-data branch behavior beyond what validation requires.

## Git workflow

- Branch: `advisor/003-secure-chat-endpoint`
- Conventional commits, e.g. `fix(chat): validate, rate-limit, and gate the chat API`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a Zod request schema

Create `src/lib/zod-schemas/chat.ts`:

```ts
import { z } from 'zod';

export const chatMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(8000),
});

export const chatRequestSchema = z.object({
    messages: z.array(chatMessageSchema).min(1).max(50),
    cityId: z.string().min(1).optional(),
    useMockData: z.boolean().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
```

If `src/lib/zod-schemas/index.ts` exists and re-exports the other schemas, add
`export * from './chat';` to match the convention.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Validate the body before any work

In `route.ts`, replace the raw destructure with a `safeParse`. Because the
handler streams, emit a clean error through the existing error path rather than
changing the response contract. Parse the JSON inside a try/catch and, on
failure, write the existing `ERROR_MESSAGE` to the stream and close it (mirror
how the handler already reports errors at its outer `catch`).

Target shape (inside the async IIFE, replacing lines ~330-338):

```ts
let parsed;
try {
    parsed = chatRequestSchema.parse(await req.json());
} catch {
    await writer.write(encoder.encode(/* same SSE error frame the outer catch uses */));
    await writer.close();
    return;
}
const { messages, cityId, useMockData } = parsed;
```

Use the *same* error-framing the existing outer `catch` block uses (find it near
the end of the IIFE and reuse its exact encoder/write/close sequence) so the
client renders the error identically. After this, `messages` is guaranteed
non-empty, so the existing `messages[messages.length - 1].content` lines are safe.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Add a lightweight rate limit

Add an in-process token-bucket / fixed-window limiter keyed by client IP
(`request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'`), applied
at the very top of `POST` before the stream is created. On limit exceeded,
return `NextResponse.json({ error: 'Too many requests' }, { status: 429 })`.

Keep it simple and dependency-free (a `Map<string, { count: number; resetAt: number }>`
module-scoped, e.g. 20 requests / 60s). Document the window in a comment.

> This is per-instance only and resets on redeploy — adequate as a first abuse
> brake. Note in "Maintenance notes" that a shared Redis limiter is the
> production-grade follow-up (Redis is already a dependency).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Decide and implement the auth gate — STOP for the maintainer's call

Whether chat is meant to be public (any site visitor) or restricted to
logged-in users is a product decision and changes user-facing behavior. Do NOT
guess.

- **STOP and ask the operator** which of these to implement:
  - (a) **Public** — keep anonymous access; rely on Steps 2–3 (validation +
    rate limit) as the only protection.
  - (b) **Authenticated** — require a session: call `const session = await auth();`
    at the top of `POST` and return `401` when `!session?.user`. (`auth` is
    imported from `@/auth`.)

Implement only the chosen option. If the operator is unavailable, implement (a)
and clearly flag in your report that the auth gate was left open per the default.

**Verify** (for option b, if chosen): `npx tsc --noEmit` → exit 0.

### Step 5: Tests

Create `src/lib/zod-schemas/__tests__/chat.test.ts`, modeled on
`src/lib/zod-schemas/__tests__/topic.test.ts`. Cover:
- valid minimal request (`messages: [{role:'user', content:'hi'}]`) parses;
- empty `messages` array rejects;
- a message with `content: ''` rejects;
- `messages` longer than 50 rejects;
- a `content` longer than 8000 chars rejects;
- unknown `role` rejects.

**Verify**: `npm test -- src/lib/zod-schemas` → all pass, including the new file.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; `src/lib/zod-schemas/__tests__/chat.test.ts` exists and passes
- [ ] `POST /api/chat` rejects malformed bodies via the Zod schema (no unguarded
      `messages[...]` access remains — `grep -n "messages\[messages.length" src/app/api/chat/route.ts`
      only appears after the schema parse)
- [ ] A 429 path exists for excessive requests
- [ ] The auth decision from Step 4 is implemented (or default-(a) flagged in the report)
- [ ] No out-of-scope files modified (`git status`)
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `5f3425a`).
- The handler already validates input or checks auth — report instead of duplicating.
- Reusing the existing SSE error frame in Step 2 is unclear because the outer
  `catch` block's format can't be located — report what you found.
- Step 4's auth decision is needed and the operator is unavailable (implement (a),
  flag it, continue).

## Maintenance notes

- The rate limiter is in-process and per-instance; a Redis-backed limiter
  (Redis is already a dependency, see `@neshca/cache-handler`) is the
  production follow-up for multi-instance correctness.
- If chat is gated to authenticated users (option b), update any anonymous entry
  points in the UI (`src/hooks/useChat.ts` and its callers) so unauthenticated
  visitors get a sign-in prompt rather than a silent 401.
- A reviewer should confirm the streaming/SSE contract is byte-for-byte
  unchanged for the happy path.
