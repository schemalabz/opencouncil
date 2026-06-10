# Plan 001: Authenticate and tenant-scope the task-status callback endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5f3425a..HEAD -- src/app/api/cities/[cityId]/meetings/[meetingId]/taskStatuses src/lib/db/tasks.ts src/lib/tasks src/env.mjs`
> If any in-scope file changed since this plan was written, compare the
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

The endpoint that the external task backend calls back into —
`POST/PUT/DELETE /api/cities/{cityId}/meetings/{meetingId}/taskStatuses/{taskStatusId}`
— performs no authentication and does not verify that the task identified by
`{taskStatusId}` actually belongs to the `{cityId}/{meetingId}` in the path. The
handler looks the task up by its UUID alone and then runs task-result processing
(`handleTaskUpdate` → `processResult`), which writes transcripts, summaries, and
other derived data into the database. Two concrete problems follow:

1. **Missing authentication**: anyone who learns or guesses a task UUID can POST
   a fake `success` payload and have the app persist attacker-supplied "results"
   (e.g. a forged transcript/summary), or DELETE task records. There is no
   bearer token, signature, or session check on these state-changing methods.
2. **Broken tenant isolation (IDOR)**: because the task is fetched by `id` only,
   a caller can address any task through any city/meeting path. The composite
   `(cityId, councilMeetingId)` that the rest of the codebase uses for multi-tenant
   isolation is ignored here.

After this plan: the callback verifies the task belongs to the path tenant, and
state-changing methods require a shared callback secret (when configured),
closing the unauthenticated-write hole without breaking the existing backend
integration during rollout.

## Current state

- `src/app/api/cities/[cityId]/meetings/[meetingId]/taskStatuses/[taskStatusId]/route.ts`
  — the callback route. `GET`/`POST`/`PUT`/`DELETE` all resolve the task by
  `taskStatusId` only and ignore `params.cityId` / `params.meetingId`. No auth
  check anywhere in the file. Current `handleUpdateRequest`:

  ```ts
  // route.ts:56-78
  async function handleUpdateRequest(request: NextRequest, taskStatusId: string) {
      const taskStatus = await getTaskStatus(taskStatusId);
      if (!taskStatus) {
          return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
      }
      const update: TaskUpdate<any> = await request.json();
      try {
          const handler = taskHandlers[taskStatus.type];
          if (!handler) { throw new Error(`Unsupported task type: ${taskStatus.type}`); }
          await handleTaskUpdate(taskStatusId, update, handler);
          return NextResponse.json({ message: 'Task status updated successfully' });
      } catch (error) { /* ...500... */ }
  }
  ```

  The `POST`, `PUT`, and `DELETE` handlers receive `{ params }` typed as
  `{ taskStatusId: string }` only — note the route segment also provides
  `cityId` and `meetingId`, which the current type omits.

- `src/lib/db/tasks.ts:59-70` — `getTaskStatus(taskStatusId: string)` does
  `prisma.taskStatus.findUnique({ where: { id: taskStatusId } })`. The
  `TaskStatus` model has `cityId` and `councilMeetingId` columns (visible on the
  returned object — `route.ts:51` reads `taskStatus.cityId` and
  `taskStatus.councilMeetingId`), so tenant fields are available for comparison.

- `src/lib/tasks/tasks.ts:108-126` — the frontend starts a task by calling the
  backend with an `Authorization: Bearer ${env.TASK_API_KEY}` header and a
  `callbackUrl` pointing at this route. So a shared secret (`TASK_API_KEY`)
  already exists on both sides, but it is **not currently sent on the callback**.

- `src/env.mjs:37-38` declares `TASK_API_URL` and `TASK_API_KEY` (both required).
  Server env vars are validated here.

- Convention for service auth already exists: `src/lib/auth.ts:162-200` exports
  `validateBearerAuth(request)` and `withServiceOrUserAuth(request, opts)`.
  `validateBearerAuth` returns `null` when no Bearer header is present and throws
  `UnauthorizedError` on an invalid token. (You will NOT reuse these directly
  here because the callback authenticates a machine secret, not a user API key —
  but match their style: read the `Authorization` header, compare in constant
  time, return 401 on mismatch.)

## Commands you will need

| Purpose          | Command                                             | Expected on success |
|------------------|-----------------------------------------------------|---------------------|
| Typecheck        | `npx tsc --noEmit`                                  | exit 0, no errors   |
| Unit tests       | `npm test`                                          | all pass            |
| Targeted test    | `npm test -- src/app/api/cities`                    | new tests pass      |
| Lint             | `npm run lint`                                      | exit 0              |
| Prisma types     | `npm run prisma:generate`                           | exit 0 (only if you touch schema — you should not) |

## Scope

**In scope** (the only files you should modify or create):
- `src/app/api/cities/[cityId]/meetings/[meetingId]/taskStatuses/[taskStatusId]/route.ts`
- `src/lib/db/tasks.ts` (extend `getTaskStatus` to accept optional tenant scoping)
- `src/env.mjs` (add the optional `TASK_CALLBACK_SECRET` var)
- `src/app/api/cities/[cityId]/meetings/[meetingId]/taskStatuses/[taskStatusId]/__tests__/route.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/tasks/tasks.ts` — `handleTaskUpdate` ordering and idempotency are a
  separate finding (CORRECTNESS-03 / "task marked succeeded before processResult").
  Do not refactor it here.
- The external task backend — you cannot change it; this plan is designed to be
  safe to merge *before* the backend is updated (see Step 4).
- The sibling `taskStatuses/route.ts` (the list endpoint) — leave it as is.

## Git workflow

- Branch: `advisor/001-secure-task-callback`
- Commit per logical step; conventional-commit style to match this repo's
  history (e.g. `fix(tasks): scope task-status callback to its tenant`). See
  `git log --oneline -5` for the style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `getTaskStatus` able to enforce tenant scope

In `src/lib/db/tasks.ts`, extend `getTaskStatus` to accept an optional scope and
apply it to the query. Keep the single-arg call sites working by making the
scope optional.

Target shape:

```ts
export async function getTaskStatus(
    taskStatusId: string,
    scope?: { cityId: string; councilMeetingId: string }
): Promise<TaskStatus | null> {
    const taskStatus = await prisma.taskStatus.findUnique({
        where: { id: taskStatusId },
    });
    if (!taskStatus) return null;
    if (scope && (taskStatus.cityId !== scope.cityId || taskStatus.councilMeetingId !== scope.councilMeetingId)) {
        return null; // task exists but not under this tenant path → treat as not found
    }
    return taskStatus;
}
```

Keep the existing `try/catch` error logging if it is present; only add the scope
check. Returning `null` on a tenant mismatch is deliberate — the route already
maps `null` to a 404, which does not leak whether the task exists under another
tenant.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Pass the path tenant through every handler in the callback route

In the route file, update the `params` types to include `cityId` and
`meetingId`, and pass `{ cityId, councilMeetingId: meetingId }` into every
`getTaskStatus(...)` call (in `GET`, `DELETE`, and `handleUpdateRequest`). Update
`handleUpdateRequest`'s signature to receive the params it needs.

Example for the POST/PUT path:

```ts
export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string; meetingId: string; taskStatusId: string } }
) {
    return handleUpdateRequest(request, params);
}

async function handleUpdateRequest(
    request: NextRequest,
    params: { cityId: string; meetingId: string; taskStatusId: string }
) {
    const taskStatus = await getTaskStatus(params.taskStatusId, {
        cityId: params.cityId,
        councilMeetingId: params.meetingId,
    });
    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }
    // ...unchanged from here...
}
```

Apply the same `getTaskStatus(..., { cityId, councilMeetingId })` scoping in
`GET` and `DELETE`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Add an optional callback secret env var

In `src/env.mjs`, add to the server schema (near `TASK_API_KEY` at line 38):

```ts
TASK_CALLBACK_SECRET: z.string().min(1).optional(),
```

and add the matching `TASK_CALLBACK_SECRET: process.env.TASK_CALLBACK_SECRET,`
line in the `runtimeEnv`/experimental runtime mapping block lower in the file
(match exactly how `CRON_SECRET` is wired at `src/env.mjs:66` and `:133`).

**Verify**: `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0.

### Step 4: Enforce the secret on state-changing methods (when configured)

Add a guard helper at the top of the route file and call it at the start of
`POST`, `PUT`, and `DELETE` (NOT `GET`). Use constant-time comparison.

```ts
import { timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';

function callbackAuthFailed(request: NextRequest): NextResponse | null {
    const secret = env.TASK_CALLBACK_SECRET;
    if (!secret) {
        // Not yet configured: preserve existing behavior so we can ship this
        // before the task backend is updated. Surface it so it isn't forgotten.
        console.warn('TASK_CALLBACK_SECRET not set — task callback auth is disabled');
        return null;
    }
    const header = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
}
```

At the start of each of `POST`/`PUT`/`DELETE`:

```ts
const denied = callbackAuthFailed(request);
if (denied) return denied;
```

This makes enforcement **opt-in via env**: with `TASK_CALLBACK_SECRET` unset the
behavior is unchanged (safe to merge today); once the maintainer sets the secret
*and* configures the backend to send `Authorization: Bearer <secret>` on its
callbacks, the hole is closed.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Tests

Create
`src/app/api/cities/[cityId]/meetings/[meetingId]/taskStatuses/[taskStatusId]/__tests__/route.test.ts`.
Model it structurally after an existing API-route unit test that mocks the db
layer — `src/app/api/profile/__tests__/route.test.ts` and
`src/app/api/unsubscribe/__tests__/route.test.ts` are the patterns in this repo
(jest + mocked module dependencies). Mock `@/lib/db/tasks`, `@/lib/tasks/tasks`,
and `@/lib/tasks/registry` so no real DB or network is touched.

Cover these cases:
- **Tenant mismatch → 404**: `getTaskStatus` returns `null` for a scope that
  doesn't match; POST to a mismatched `{cityId}/{meetingId}` returns 404 and
  `handleTaskUpdate` is never called.
- **Happy path with no secret configured**: `TASK_CALLBACK_SECRET` unset, valid
  tenant → `handleTaskUpdate` is called, response 200.
- **Secret configured, missing/wrong header → 401**: set the env secret; POST
  without a matching `Authorization` header returns 401 and `handleTaskUpdate`
  is never called.
- **Secret configured, correct header → 200**: POST with
  `Authorization: Bearer <secret>` and matching tenant succeeds.

**Verify**: `npm test -- src/app/api/cities` → all pass, including the 4 new cases.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; the new `route.test.ts` exists and its 4 cases pass
- [ ] `getTaskStatus` rejects (returns `null` for) a task whose `cityId`/`councilMeetingId` don't match the requested scope
- [ ] `POST`/`PUT`/`DELETE` on the callback route call the secret guard; `GET` does not
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `5f3425a`).
- `getTaskStatus` is already tenant-scoped, or the route already authenticates —
  the finding may have been fixed; report instead of duplicating.
- `TaskStatus` does not actually expose `cityId` / `councilMeetingId` (your tenant
  comparison won't compile) — report; the schema assumption is wrong.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- **Operational follow-up (not code):** to actually close the hole, the
  maintainer must (1) set `TASK_CALLBACK_SECRET` in the app environment and
  (2) configure the task backend to send `Authorization: Bearer <that secret>`
  on every callback. Until both are done, enforcement stays disabled by design.
  Note this in the PR description so it isn't lost.
- A reviewer should confirm the 404-on-mismatch (rather than 403) is intended —
  it avoids leaking task existence across tenants.
- Related deferred finding: CORRECTNESS-03 (task marked `succeeded` before
  `processResult` completes) lives in `src/lib/tasks/tasks.ts` and is explicitly
  out of scope here; see `plans/README.md`.
