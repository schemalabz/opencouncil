# API Documentation Guide

This guide covers how to document, categorise, and maintain OpenCouncil's REST API specification
stored in `swagger.yaml`.

## Overview

OpenCouncil uses a single `swagger.yaml` file (OpenAPI 3.0) as the source of truth for API
documentation. The file is served to developers via two surfaces:

- **`/{locale}/docs`** — Interactive Swagger UI (filtered by the viewer's access level)
- **`/api`** — Raw JSON endpoint returning the OpenAPI spec (also filtered by access level)

Both surfaces filter endpoints based on the authenticated user's role, so admin-only routes are not
visible to unauthenticated visitors.

---

## Access Levels

Every API operation in `swagger.yaml` must carry an `x-access-level` extension field:

| Value         | Who can see it                             | Typical use cases                                  |
|---------------|--------------------------------------------|----------------------------------------------------|
| `public`      | Everyone (no authentication required)     | Read endpoints for cities, meetings, search, chat  |
| `user`        | Any authenticated user                    | Profile, notification preferences                  |
| `admin`       | Users who administer at least one entity  | Write endpoints for cities, meetings, parties, etc.|
| `superadmin`  | Superadmin accounts only                  | User management, system administration             |

The filtering logic is implemented in `src/lib/utils/openapi.ts`. Each level includes all levels
below it (a superadmin can see all endpoints).

### Authorization mapping

The access level in swagger maps to the following server-side checks:

| Access Level  | Server-side check                                                       |
|---------------|-------------------------------------------------------------------------|
| `public`      | None                                                                    |
| `user`        | `getCurrentUser()` returning a non-null user                            |
| `admin`       | `withUserAuthorizedToEdit({ cityId })` (or `partyId`/`personId`)        |
| `superadmin`  | `user.isSuperAdmin === true`                                            |

> **Critical distinction:** `withUserAuthorizedToEdit({})` called with **no entity arguments** only
> passes for superadmins. All `/api/admin/*` routes use this empty-args form and must carry
> `x-access-level: superadmin`. Only routes that pass a concrete entity ID (e.g. `{ cityId }`)
> map to `x-access-level: admin`.

---

## Adding a New Endpoint

When you add a new API route, update `swagger.yaml` in the same pull request. Follow these steps:

### 1. Identify the access level

Ask: "Who is allowed to call this endpoint?"

- Anyone → `public`
- Signed-in user only → `user`
- Admin of a city/party/person → `admin`
- Superadmin only → `superadmin`

### 2. Find or create the correct path entry

Paths follow the file URL structure. For example, a new `GET` on
`src/app/api/cities/[cityId]/meetings/[meetingId]/summary/route.ts` maps to
`/api/cities/{cityId}/meetings/{meetingId}/summary`.

```yaml
/api/cities/{cityId}/meetings/{meetingId}/summary:
  get:
    tags: [Meetings]
    summary: Get meeting summary
    description: Returns the AI-generated summary for a meeting.
    x-access-level: public          # <-- required
    parameters:
      - $ref: '#/components/parameters/cityId'
      - $ref: '#/components/parameters/meetingId'
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                text:
                  type: string
      '404':
        $ref: '#/components/responses/NotFound'
      '500':
        $ref: '#/components/responses/InternalError'
```

### 3. Add `security` for authenticated endpoints

Operations with `x-access-level: user`, `admin`, or `superadmin` must also declare:

```yaml
security:
  - sessionAuth: []
```

This tells Swagger UI to display the authentication requirement.

### 4. Reference shared components

Prefer `$ref` over inline definitions to keep schemas consistent:

```yaml
parameters:
  - $ref: '#/components/parameters/cityId'   # path parameters
responses:
  '401':
    $ref: '#/components/responses/Unauthorized'
  '403':
    $ref: '#/components/responses/Forbidden'
  '404':
    $ref: '#/components/responses/NotFound'
  '500':
    $ref: '#/components/responses/InternalError'
```

If the response type doesn't exist yet, add it to `components/schemas`.

### 5. Choose the right tag

Tags group endpoints in the Swagger UI. Use an existing tag when appropriate:

- `Cities`, `Administrative Bodies`, `Meetings`, `Parties`, `People`
- `Search`, `Statistics`, `Topics`, `Chat`
- `Subjects`, `Highlights`, `Map`, `Notifications`
- `User` — authenticated user profile/preferences
- `Admin — Notifications`, `Admin — Users`, `Admin — QR Campaigns`, `Admin — System`
- `Upload`

An operation can have multiple tags (e.g. an endpoint that appears in both `Meetings` and
`Admin — Notifications`).

---

## Documenting Request Bodies

Use explicit schemas rather than `type: object` with no properties.

```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [name, dateTime]
        properties:
          name:
            type: string
          dateTime:
            type: string
            format: date-time
          released:
            type: boolean
            default: false
```

For `multipart/form-data` (file uploads), mark file fields as `format: binary`:

```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          logo:
            type: string
            format: binary
```

---

## Writing Good Descriptions

Keep descriptions accurate and brief. Follow these conventions:

- **Summary** (required): One short sentence, no period. E.g. `Get parties for a city`.
- **Description** (optional, for complex endpoints): One or two sentences covering non-obvious
  behaviour, prerequisites, or side effects. E.g.
  > Creates a council meeting. Requires admin rights for the city. Also creates a Google Calendar
  > event and sends a Discord alert.
- **Parameter descriptions**: Describe constraints, not the type. E.g.
  > Maximum number of meetings to return (1–100).
- **Response descriptions**: Use `OK`, `Created`, `Deleted — no content` for success. Describe
  error conditions briefly: `City not found`, `Insufficient permissions`.
- Use British or American English consistently with the rest of the file (currently mixed — match
  what surrounds your change).

---

## Security Considerations

- **Never document internal-only endpoints** (e.g. task callback routes) in `swagger.yaml`. These
  are not part of the public or admin API.
- **Never expose secrets or tokens** in `example` values.
- Admin and superadmin endpoints must always list `security: [{ sessionAuth: [] }]` in addition to
  `x-access-level`, so Swagger UI shows a padlock icon and warns the user.
- If an endpoint has *mixed* access (e.g. some fields only available to superadmins), document the
  restriction in the **description**, not as a separate access level.

---

## Role-Based Filtering — How It Works

The filtering is implemented in `src/lib/utils/openapi.ts` and used by:

1. `src/app/[locale]/(other)/docs/page.tsx` — filters before rendering Swagger UI
2. `src/app/api/route.ts` — filters before serving the JSON spec

The `filterSpecByAccessLevel` function walks every path and every HTTP method, checks the
operation's `x-access-level`, and removes operations the user cannot access. An entire path entry
is removed if no operations remain after filtering.

The user's level is determined in the same way in both files:

```typescript
let userLevel: AccessLevel = 'public';
if (user) {
    if (user.isSuperAdmin) {
        userLevel = 'superadmin';
    } else if (user.administers.length > 0) {
        userLevel = 'admin';
    } else {
        userLevel = 'user';
    }
}
```

The `/docs` page also renders an `AccessBanner` that tells the viewer how many endpoints are hidden
and links to sign in if they are unauthenticated.

---

## Adding New Schema Types

When a new response shape appears in multiple endpoints, add a reusable schema under
`components/schemas`:

```yaml
components:
  schemas:
    MyNewType:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        createdAt:
          type: string
          format: date-time
```

Then reference it from operations:

```yaml
responses:
  '200':
    description: OK
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/MyNewType'
```

---

## Checklist Before Opening a PR

1. [ ] New or changed routes are documented in `swagger.yaml`
2. [ ] Each operation has `x-access-level` set correctly
3. [ ] Operations requiring authentication have `security: [{ sessionAuth: [] }]`
4. [ ] Path parameters use `$ref: '#/components/parameters/...'` where one exists
5. [ ] Error responses use `$ref: '#/components/responses/...'`
6. [ ] New response schemas are added to `components/schemas` if reusable
7. [ ] The access level matches the actual server-side auth check

---

## Instructions for LLMs Maintaining This Documentation

When adding or updating entries in `swagger.yaml`:

1. **Audit first.** Compare the actual route file (`route.ts`) against the existing swagger entry.
   Look at what HTTP methods are exported, what Zod/validation schemas are used, and what auth
   functions are called (`withUserAuthorizedToEdit`, `getCurrentUser`, etc.).

2. **Map auth checks to access levels.** Use the table in the *Access Levels* section above. If an
   endpoint calls `withUserAuthorizedToEdit({})` (no args), use `x-access-level: superadmin` — this
   form requires `isSuperAdmin === true`. Only use `x-access-level: admin` when a concrete entity ID
   (e.g. `{ cityId }`) is passed to the authorization check.

3. **Use existing `$ref` components.** Do not inline schemas that already exist in
   `components/schemas`. Search the file for the schema before creating a new one.

4. **Preserve existing formatting.** Use 2-space indentation, keep comments with `#`, and maintain
   the section structure (Cities, Meetings, etc.).

5. **Never document dev-only routes.** Routes under `src/app/api/dev/` are excluded from the spec
   by convention.

6. **Do not add `x-access-level: internal`** or any value not in the defined list. The filtering
   logic only recognises `public`, `user`, `admin`, and `superadmin`.

7. **Validate the YAML.** After editing, confirm the file parses cleanly with a YAML linter or by
   running the local dev server and visiting `/docs`.
