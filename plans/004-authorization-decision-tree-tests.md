# Plan 004: Add decision-tree tests for the authorization layer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5f3425a..HEAD -- src/lib/auth.ts`
> If `src/lib/auth.ts` changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5f3425a`, 2026-06-10

## Why this matters

`checkUserAuthorization` in `src/lib/auth.ts` is the single gate that decides who
may edit cities, parties, people, and meetings — every `isUserAuthorizedToEdit`
and `withUserAuthorizedToEdit` call routes through it. It encodes a non-trivial
decision tree (superadmin bypass, direct-administration grants, city→party/person
hierarchy, and `cityId`+`councilMeetingId` cross-validation) and has **no direct
test**. Other test files only *mock* the auth functions; the real branching logic
is unverified, so a regression (e.g. a hierarchy check flipped, or a tenant
cross-check dropped) would ship silently and become an IDOR/privilege bug. Adding
focused tests locks this behavior down — and complements plans 001 and 003,
which depend on this layer being correct.

## Current state

`src/lib/auth.ts` (top of file is `"use server"`):

- `getCurrentUser()` (lines 9-25): `await auth()` for the session, then
  `prisma.user.findUnique({ where: { email }, include: { administers: { include: { city, party, person } } } })`.
  Returns `null` if no session email.

- `checkUserAuthorization({ cityId?, partyId?, personId?, councilMeetingId? })`
  (lines 27-107) — **not exported**. Logic, in order:
  1. Throws if more than one of `partyId`/`personId` is set (lines 44-46).
  2. Throws if `partyId`/`personId` is combined with `cityId`/`councilMeetingId` (48-50).
  3. Throws if `councilMeetingId` is set without `cityId` (52-54).
  4. `getCurrentUser()`; if no user → `return false` (56-57).
  5. `user.isSuperAdmin` → `return true` (59-60).
  6. No params at all → `return false` (62-64).
  7. If `cityId` && `councilMeetingId`: `prisma.councilMeeting.findUnique({ where: { cityId_id: { cityId, id: councilMeetingId } } })`; throws if not found (66-81).
  8. Direct access: `user.administers.some(a => (cityId && a.cityId===cityId) || (partyId && a.partyId===partyId) || (personId && a.personId===personId))` → true (83-90).
  9. Hierarchy: if `partyId|personId`, look up the entity's `cityId` via
     `prisma.party.findUnique` / `prisma.person.findUnique`; if the user
     administers that city → true (92-104).
  10. Otherwise `return false` (106).

- Exported wrappers: `isUserAuthorizedToEdit(args)` (line 134) returns the boolean
  from `checkUserAuthorization`; `withUserAuthorizedToEdit(args)` (line 109) throws
  `"Not authorized"` when it's false. **Test through `isUserAuthorizedToEdit`**
  (exported) to exercise `checkUserAuthorization`.

Mocking convention (from `src/lib/__tests__/people.test.ts:1-20`): mock
`../db/prisma` with a `default` export object of `jest.fn()`s, and mock other
modules with `jest.mock`. Here you must mock the **dependencies** of `auth.ts`
(`@/auth` for the session and `@/lib/db/prisma` for lookups) while importing the
**real** `auth.ts`.

## Commands you will need

| Purpose       | Command                              | Expected on success |
|---------------|--------------------------------------|---------------------|
| Targeted test | `npm test -- src/lib/__tests__/auth` | new tests pass      |
| All unit tests| `npm test`                           | all pass            |
| Typecheck     | `npx tsc --noEmit`                    | exit 0              |

## Scope

**In scope**:
- `src/lib/__tests__/auth.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/lib/auth.ts` — this plan only *adds tests*; do not change the logic. If a
  test reveals a genuine bug, STOP and report it rather than "fixing" it here.
- Any other test file.
- Integration/testcontainers setup — these are fast unit tests with mocked
  prisma + session, matching the repo's dominant pattern.

## Git workflow

- Branch: `advisor/004-auth-tests`
- Conventional commit: `test(auth): cover the authorization decision tree`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Scaffold the test file with mocked session + prisma

Create `src/lib/__tests__/auth.test.ts`. Set up mocks BEFORE importing `auth.ts`:

```ts
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: () => mockAuth() }));

const mockPrisma = {
  user: { findUnique: jest.fn() },
  councilMeeting: { findUnique: jest.fn() },
  party: { findUnique: jest.fn() },
  person: { findUnique: jest.fn() },
};
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }));

import { isUserAuthorizedToEdit } from '@/lib/auth';

// helper: set the "logged in user" that getCurrentUser() resolves to
function loginAs(user: unknown) {
  mockAuth.mockResolvedValue(user ? { user: { email: 'u@example.com' } } : null);
  mockPrisma.user.findUnique.mockResolvedValue(user ?? null);
}

beforeEach(() => jest.clearAllMocks());
```

> If `@/lib/db/prisma` is imported elsewhere in `auth.ts` as a named `prisma`
> export as well as default, the mock above covers both. Confirm by reading the
> import line `import prisma from "@/lib/db/prisma"` at `auth.ts:4`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Write the decision-tree cases

Cover each branch (use `isUserAuthorizedToEdit`):

1. **No session → false**: `loginAs(null)`; `isUserAuthorizedToEdit({ cityId: 'c1' })` resolves `false`.
2. **Superadmin → true**: `loginAs({ isSuperAdmin: true, administers: [] })`;
   `{ cityId: 'c1' }` resolves `true` (and `{}` resolves `true`).
3. **No params, non-superadmin → false**: `loginAs({ isSuperAdmin: false, administers: [] })`; `{}` resolves `false`.
4. **Direct city admin → true**: user administers `c1`
   (`administers: [{ cityId: 'c1', partyId: null, personId: null }]`); `{ cityId: 'c1' }` → `true`;
   `{ cityId: 'c2' }` → `false`.
5. **cityId + councilMeetingId, meeting belongs to city → true** for a city
   admin: mock `councilMeeting.findUnique` to resolve `{ cityId: 'c1' }`;
   `{ cityId: 'c1', councilMeetingId: 'm1' }` → `true`.
6. **cityId + councilMeetingId, meeting not found → throws**: mock
   `councilMeeting.findUnique` → `null`; expect the call to reject.
7. **Hierarchy: party in an administered city → true**: user administers `c1`
   but not the party directly; mock `party.findUnique` → `{ cityId: 'c1' }`;
   `{ partyId: 'p1' }` → `true`. And `{ partyId: 'p1' }` with the party in `c2`
   the user does NOT administer → `false`.
8. **Invalid param combos throw**: `{ partyId: 'p1', personId: 'x1' }` rejects;
   `{ partyId: 'p1', cityId: 'c1' }` rejects; `{ councilMeetingId: 'm1' }` (no
   cityId) rejects.

Use `await expect(isUserAuthorizedToEdit(args)).resolves.toBe(true|false)` and
`await expect(...).rejects.toThrow()` accordingly.

**Verify**: `npm test -- src/lib/__tests__/auth` → all new cases pass.

### Step 3: Full suite

**Verify**: `npm test` → all pass (no regressions in other files from the new mocks).

## Test plan

The deliverable *is* the test file. Structural pattern: `src/lib/__tests__/people.test.ts`
(prisma mocked via `default` export). Cases enumerated in Step 2: the 8 numbered
scenarios covering every branch of `checkUserAuthorization`.

- Verification: `npm test -- src/lib/__tests__/auth` → all pass; `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `src/lib/__tests__/auth.test.ts` exists and exercises `isUserAuthorizedToEdit`
- [ ] All 8 scenario groups from Step 2 are present and pass
- [ ] `npm test` exits 0 (no regressions elsewhere)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `src/lib/auth.ts` is unchanged (`git diff --stat src/lib/auth.ts` empty)
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" line references don't match `src/lib/auth.ts` (drift).
- A test for expected-correct behavior fails because the *logic* is wrong (you've
  found a real authorization bug) — report it; do NOT change `auth.ts` to make a
  test pass.
- The `"use server"` directive or `@/auth` mock prevents `auth.ts` from importing
  under jest after a reasonable attempt — report the error.

## Maintenance notes

- These tests pin the authorization contract; if the decision tree in `auth.ts`
  is intentionally changed later, update them in the same PR.
- A reviewer should check that the mocks assert *which* prisma lookups happened
  (e.g. that the hierarchy branch only queries `party`/`person` when needed), not
  just the boolean result, so the tests catch logic short-circuits.
- Natural follow-up (separate plan): testcontainers integration coverage that
  exercises the real prisma `administers` joins end to end.
