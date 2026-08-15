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
editorial brief ~$0.05-0.10 per meeting (cached on the queue item).

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

  The role can `SELECT` the five views and nothing else.

Tests: `npm test -w notis`. Re-record a golden fixture (live API, costs money):
`cd services/notis && npx tsx scripts/record-scenario.ts fixtures/scenarios/<name>.json`.

## DigitalOcean App Platform component (dashboard-managed)

The app spec lives in the DO dashboard, not the repo. The Notis component:

| Setting | Value |
|---|---|
| Type | Web service, Node buildpack |
| Source dir | `/` (repo root — the workspace install needs the root lockfile) |
| Build command | `npm ci && SKIP_ENV_VALIDATION=1 npm run build -w notis` |
| Run command | `npm start -w notis` (Next.js honors DO's injected `PORT`) |
| Health check | `GET /api/health` |
| Domain | `notis.opencouncil.gr` |
| Instance | smallest available (stateless, I/O-bound) |
| Env (secret, run+build) | `ANTHROPIC_API_KEY`, `NOTIS_DATABASE_URL`, `MAIN_DATABASE_URL` |
| Env (build-time, plain) | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (public token; baked at build — without it the wizard's map/address search degrades to text chips) |
| Env (optional) | `NOTIS_MCP_URL` (defaults to `https://opencouncil.gr/mcp`), `OPENCOUNCIL_BASE_URL`, `MAIN_SESSION_COOKIE_NAME` |

Same branch wiring as the main component: `production` branch → production,
`main` → staging. The staging component gets its own domain
(`notis.staging.opencouncil.gr`) and its own database URLs; nothing is shared
with production. Staging must also set
`MAIN_SESSION_COOKIE_NAME=__Secure-oc-session-staging` (see below). DNS per
domain: a CNAME to the DO app's default hostname (DO then issues the
certificate). The main app's component is untouched by this — its build still
runs at the root and ignores `services/`.

## Admin auth (shared cookie)

`/admin/*` and `/api/*` (minus health) authenticate with the main app's
session. The main app mirrors a **SHA-256 of** the Auth.js session token into
a domain-scoped cookie (`__Secure-oc-session`, staging `-staging`-suffixed,
`Domain` set by `SESSION_COOKIE_DOMAIN` on the main app) — set and cleared on
the Auth.js responses that write the session cookie, refreshed on page
navigations. The browser sends the hash to `notis.opencouncil.gr`, and Notis
validates it against the hashed `notis_admin_sessions` view — superadmin
sessions only. The edge proxy checks only that the cookie exists;
`requireAdmin()`/`getAdminSession()` do the real lookup. There is no shared
secret, and nothing that reaches Notis (or any other subdomain host) can be
replayed as the session cookie against the main app. Main-app env for this:
prod `SESSION_COOKIE_DOMAIN=.opencouncil.gr`; staging
`SESSION_COOKIE_DOMAIN=.staging.opencouncil.gr` and
`SESSION_COOKIE_SUFFIX=-staging`. The main-DB migration needs the `pgcrypto`
extension (created by the migration itself).

## Known gaps (tracked for later PRs)

- **Golden scenarios have two jobs; only one is implemented.** The offline
  replay lane guards the code: deterministic, free, full-content assertions.
  The second job — guarding prompt changes — needs a live-replay lane with
  behavioral assertions (decision, cadence caps, link presence), because a
  prompt change invalidates recorded turns. That lane lands on Langfuse in a
  final PR.
