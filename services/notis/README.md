# Notis (ο Νότης)

The per-resident WhatsApp agent for OpenCouncil. This app owns the agent core
(`src/agent/` — pure over injected deps), the dry-run endpoint, the playground,
its own database, and the public landing at `notis.opencouncil.gr`. See the
"New notifications (Notis)" PRD in Notion for the full design; the queue
consumer and Bird arrive in later PRs.

## Local development

From the repo root (npm workspaces — one install covers everything):

```bash
npm install
cp services/notis/.env.example services/notis/.env   # add a real ANTHROPIC_API_KEY
npm run dev -w notis                                  # http://localhost:3001
```

Admin access uses the main app's session: run the main dev server, sign in
there as a superadmin (the QuickLogin dev bar works), then open
`http://localhost:3001/admin`. Notis reads the port-suffixed dev cookie
(localhost cookies ignore ports; the port comes from `OPENCOUNCIL_BASE_URL`,
so multi-instance setups follow that URL), hashes it, and validates the hash
against the `notis_admin_sessions` view — so `MAIN_DATABASE_URL` must point
at a database that has the notis views migration. Set
`OPENCOUNCIL_BASE_URL=http://localhost:3000` in dev so the login page links
to your local sign-in and the cookie port matches.

Simulation state lives in your browser's localStorage. Every step calls the
real model against the public `opencouncil.gr/mcp` (on claude-sonnet-5) — a
decide-only wake costs a couple of cents, a research/send wake ~$0.10-0.25, an
editorial brief ~$0.05-0.10 per meeting (cached on the queue item). A wake
that searches the web adds $0.01 per search, three searches at most.

### Databases

Notis has two connections, both optional — without them the service runs the
stateless playground-only mode:

- `NOTIS_DATABASE_URL` — Notis's own Postgres (subscriptions, wakes, queue).
  Locally: `docker compose --profile with-db up notis-db` (port 5433), then
  `npm run prisma:migrate -w notis`. Client generation: `npm run prisma:generate -w notis`
  (the `build` script runs it automatically).
- `MAIN_DATABASE_URL` — the main database's `notis_*` views, read-only. Use a
  login user in the `notis_reader` role. Ops step per environment, as a
  superuser on the main database:

  ```sql
  CREATE USER notis_service LOGIN PASSWORD '...' IN ROLE notis_reader;
  ```

  Grant that role nothing else. The migration refuses to run if `notis_reader`
  inherits from another role, because the read-only containment is what makes
  a separate service safe against the main database.

- `NOTIS_ALERT_WEBHOOK_URL` — a Discord webhook for operational alarms. Set it
  in every deployed environment. The janitor's blast-radius guard REFUSES to
  delete when too many subscriptions look orphaned, and that refusal is
  permanent until a person clears the backlog — this webhook is how anyone
  learns it happened. Without it the refusal reaches the logs and nobody
  else.

  The role can `SELECT` the five views and nothing else.

### Bird (WhatsApp)

Notis has its OWN Bird webhook subscription and signing key, separate from
the main app's. Both subscriptions receive all conversation events. Notis
answers every reader; the main app's webhook only reconciles the delivery
status of its own sends (the admin test-send tool). A message from a phone
no reader has draws silence from both. See
[docs/bird-setup.md](../../docs/bird-setup.md), "The Notis webhook
subscription".

All four variables are optional. Without them, the webhook route rejects
events in production and outbound sends fail with an alert:

- `BIRD_API_KEY`, `BIRD_WORKSPACE_ID`, `BIRD_WHATSAPP_CHANNEL_ID`,
  `BIRD_SMS_CHANNEL_ID` — same values as the main app's. The SMS id exists
  so SMS conversation events are recognized and ignored; without it an
  unmatched channel id classifies as WhatsApp.
- `BIRD_WEBHOOK_SECRET` — the signing key of the NOTIS subscription. Do not
  reuse the main app's secret.
- `BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION`, `BIRD_WHATSAPP_TEMPLATE_NOTIS_INTRO`,
  `BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_AGENDA`, `BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS`,
  `BIRD_WHATSAPP_TEMPLATE_DEMOS_FOLLOWUP` (and `..._DEMOS_INTRO` for the
  threads it opened before notis_intro existed) — the Bird project id of each
  shell in `src/agent/templates.ts`. A shell without its id is unaddressable:
  the poller holds the readers who need it and alerts, instead of enrolling
  them into a thread that never opens.

To exercise the inbound path locally without Bird, send a signed synthetic
event: `npx tsx --env-file=.env scripts/send-test-webhook.ts +306990000001 "γεια σου"`.

Tests: `npm test -w notis`. Re-record a golden fixture (live API, costs money):
`cd services/notis && npx tsx scripts/record-scenario.ts fixtures/scenarios/<name>.json`.

## DigitalOcean App Platform component (dashboard-managed)

The app spec lives in the DO dashboard, not the repo. The Notis component:

| Setting | Value |
|---|---|
| Type | Web service, Node buildpack |
| Source dir | `/` (repo root — the workspace install needs the root lockfile) |
| Build command | `npm ci && SKIP_ENV_VALIDATION=1 npm run build -w notis` |
| Run command | `npm start -w notis` (Next.js honors DO's injected `PORT`) — a `prestart` runs `prisma migrate deploy` first when `NOTIS_DATABASE_URL` is set, so the buildpack deploy migrates its own database on boot; the Nix preview path runs migrations in its createHook instead |
| Health check | `GET /api/health` |
| Domain | `notis.opencouncil.gr` |
| Instance | smallest available (stateless, I/O-bound) |
| Env (secret, run+build) | `ANTHROPIC_API_KEY`, `NOTIS_DATABASE_URL`, `MAIN_DATABASE_URL`, `NOTIS_SERVICE_TOKEN` (see [Subscriptions API](#subscriptions-api-service-token)) |
| Env (build-time, plain) | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (public token; baked at build — without it the wizard's map/address search degrades to text chips) |
| Env (optional) | `NOTIS_MCP_URL` (defaults to `https://opencouncil.gr/mcp`), `OPENCOUNCIL_BASE_URL`, `MAIN_SESSION_COOKIE_NAME`, `BIRD_API_KEY`, `BIRD_WORKSPACE_ID`, `BIRD_WHATSAPP_CHANNEL_ID`, `BIRD_SMS_CHANNEL_ID`, `BIRD_WEBHOOK_SECRET`, the `BIRD_WHATSAPP_TEMPLATE_*` project ids (see [Bird](#bird-whatsapp)) |
| Env (operational, set it) | `NOTIS_ALERT_WEBHOOK_URL` — Discord webhook for janitor refusals, queue give-ups and poller failures; without it those alarms only reach the logs |

Same branch wiring as the main component: `production` branch → production,
`main` → staging. The staging component gets its own domain
(`notis.staging.opencouncil.gr`) and its own database URLs; nothing is shared
with production. Staging must also set three vars whose defaults point at
production: `MAIN_SESSION_COOKIE_NAME=__Secure-oc-session-staging` (the main
app derives that suffix per environment and Notis has no `DEPLOYMENT_ENV` of
its own — see below), `OPENCOUNCIL_BASE_URL=https://staging.opencouncil.gr`
(the login page links there; with the default, a staging admin is sent to the
PRODUCTION sign-in, which mirrors under the unsuffixed cookie name, and login
bounces forever) and `NOTIS_MCP_URL=https://staging.opencouncil.gr/mcp` (so
wakes research staging data, not production). DNS per
domain: a CNAME to the DO app's default hostname (DO then issues the
certificate). The main app's component is untouched by this — its build still
runs at the root and ignores `services/`.

## Admin auth (shared cookie)

`/admin/*` and `/api/*` (minus health, the Bird webhook and the
[subscriptions API](#subscriptions-api-service-token)) authenticate with the
main app's session. The main app mirrors a **SHA-256 of** the Auth.js session token into
a domain-scoped cookie (`__Secure-oc-session`, staging `-staging`-suffixed,
`Domain` set by `SESSION_COOKIE_DOMAIN` on the main app) — set and cleared on
the Auth.js responses that write the session cookie, refreshed on page
navigations. The browser sends the hash to `notis.opencouncil.gr`, and Notis
validates it against the hashed `notis_admin_sessions` view — superadmin
sessions only. The edge proxy checks only that the cookie exists;
`requireAdmin()`/`getAdminSession()` do the real lookup. There is no shared
secret, and nothing that reaches Notis can be replayed as the session cookie
against the main app.

Two caveats worth stating plainly. The mirror value is what authenticates the
Notis admin, so possession of it IS the credential here — it carries no
authority against the main app, but full authority against this one. And a
`Domain`-scoped cookie reaches every host under the apex, so every such host
is trusted by construction; keep deployments that run unmerged code (previews)
on a different domain, and keep third-party-hosted subdomains off this one.

No main-app env is needed: `SESSION_COOKIE_DOMAIN` and `SESSION_COOKIE_SUFFIX`
derive from `DEPLOYMENT_ENV` and `NEXTAUTH_URL` (`.opencouncil.gr` with no
suffix on production, `.staging.opencouncil.gr` with `-staging` on staging,
neither in development or previews). Set them only to override — and if you
override the suffix, set Notis's `MAIN_SESSION_COOKIE_NAME` to match. The
main-DB migration needs the `pgcrypto` extension (created by the migration
itself).

## Subscriptions API (service token)

The main app's profile switch («Ο Νότης στο WhatsApp») reads and flips a
reader's subscription through `GET|PATCH /api/subscriptions/{userId}`,
called server-side with `Authorization: Bearer $NOTIS_SERVICE_TOKEN` — the
same value on both components, at least 32 characters. `requireService()`
compares it in constant time and answers 503 while the variable is unset,
so a deployment that forgot the secret exposes nothing. The edge proxy lets
a bearer request through on this prefix only; the auth-guard test keeps
`requireService()` from spreading to any other route.

- `GET` → `{ subscription: null | { status, phone, origin, unsubscribedAt,
  createdAt } }`.
- `PATCH { status: "unsubscribed" }` on an active reader runs the same
  ceremony as ΣΤΟΠ (status flip, pending outbound suppressed, open
  commitments resolved) and records a system decision. Already unsubscribed,
  or no subscription: a no-op.
- `PATCH { status: "active" }` on an unsubscribed reader reactivates the row
  with the number the main database holds now (409 `phone_empty` /
  `phone_invalid` / `phone_not_mobile` / `phone_in_use` when it cannot) and
  records a system decision. **Nothing is sent** — the next relevant meeting
  reopens the thread with its own template. A reader with no subscription
  gets `{ subscription: null, next: "poller" }`: the main app has set
  `notifyByPhone`, and the poller enrolls them with the right intro on its
  next tick.

Notis owns the status (schema.prisma); the main app is a client that asks
for a state on the reader's explicit action.

## Known gaps (tracked for later PRs)

- **notifyByPhone and the subscription status are two facts, kept aligned
  by the profile switch.** ΣΤΟΠ writes only this database, so a reader who
  said it still carries `User.notifyByPhone: true` in the main one (one
  consent per reader, repeated on every row of the view); the profile shows
  the subscription's status, not the flag, so it tells the truth. The other
  direction is the seam: the flag gates enrollment and the proactive
  audience but never re-activates anyone — only the switch does, through the
  subscriptions API. `User.notisEnabledAt` and its two view columns are
  unread since PR 5 and go with a view-recreating migration in PR 6.

- **The wake trace shares a table with the wake's scalars.** `NotisWake.trace`
  is one Json value of a few hundred KB — the system prompt, the rendered user
  turn, every model request and reply. It sits beside the dozen small columns
  the admin surfaces read, and a query that does not name its columns takes
  the trace with them: a 100-row feed page moves ~20 MB instead of ~0.2 MB.
  Every reader today names its columns, so nothing is slow; what the layout
  cannot do is stop the next one from forgetting. A 1:1 `NotisWakeTrace` table
  would make that mistake impossible to write. Deferred deliberately: the
  migration has to move real rows once notis is writing them, and that is a
  cost we accepted to keep this PR shippable. A `promptHash` column beside
  `model` belongs to the same change — the prompt text is inside the trace
  today, so metrics cannot be grouped by prompt revision without hashing a
  blob.

- **Golden scenarios have two jobs; only one is implemented.** The offline
  replay lane guards the code: deterministic, free, full-content assertions.
  The second job — guarding prompt changes — needs a live-replay lane with
  behavioral assertions (decision, cadence caps, link presence), because a
  prompt change invalidates recorded turns. That lane lands on Langfuse in a
  final PR.
