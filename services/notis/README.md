# Notis (ο Νότης)

The per-resident WhatsApp agent for OpenCouncil. This app owns the agent core
(`src/agent/` — pure over injected deps), the dry-run endpoint, the playground,
and the public landing at `notis.opencouncil.gr`. See the "New notifications
(Notis)" PRD in Notion for the full design; this PR-1 slice has **no database,
no queue, no Bird** — those arrive in later PRs.

## Local development

From the repo root (npm workspaces — one install covers everything):

```bash
npm install
cp services/notis/.env.example services/notis/.env   # add a real ANTHROPIC_API_KEY
npm run dev -w notis                                  # http://localhost:3001
```

Log into `/admin` with `NOTIS_ADMIN_SECRET` from your `.env` and open the
playground. Simulation state lives in your browser's localStorage; the server
is stateless. Every step calls real Opus against the public
`opencouncil.gr/mcp` (on claude-sonnet-5) — a decide-only wake costs a couple
of cents, a research/send wake ~$0.10-0.25, an editorial brief ~$0.05-0.10 per
meeting (cached on the queue item).

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
| Env (secret, run+build) | `ANTHROPIC_API_KEY`, `NOTIS_ADMIN_SECRET` |
| Env (build-time, plain) | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (public token; baked at build — without it the wizard's map/address search degrades to text chips) |
| Env (optional) | `NOTIS_MCP_URL` (defaults to `https://opencouncil.gr/mcp`), `OPENCOUNCIL_BASE_URL` |

Same branch wiring as the main component: `production` branch → production,
`main` → staging. The staging component gets its own domain (e.g.
`notis-staging.opencouncil.gr`) and its own `NOTIS_ADMIN_SECRET`; nothing is
shared with production. DNS per domain: a CNAME to the DO app's default
hostname (DO then issues the certificate). The main app's component is untouched by this — its build
still runs at the root and ignores `services/`.

## Interim admin auth

Until PR 2 replaces it with shared-cookie validation against the main app's
sessions, `/admin/*` and `/api/*` (minus health + login) are gated by
`NOTIS_ADMIN_SECRET`: `/admin/login` exchanges it for an HttpOnly cookie
holding an HMAC of the secret. Rotate by changing the env var.

## Known gaps (tracked for later PRs)

- **Golden scenarios have two jobs; only one is implemented.** The offline
  replay lane guards the code: deterministic, free, full-content assertions.
  The second job — guarding prompt changes — needs a live-replay lane with
  behavioral assertions (decision, cadence caps, link presence), because a
  prompt change invalidates recorded turns. That lane does not exist yet.
- **The wizard's profile is not the migration-seeded profile.** The PRD (§7)
  seeds a simulated profile from notification preferences exactly as
  migration will; the wizard takes hand-typed free text. Tuning happens on a
  different population than launch until the seeding rule (needed for PR 6
  anyway) is implemented here.
- **Fixtures need re-recording on the shipped pipeline.** Both current
  fixtures predate the model change and the agenda embargo; the recording
  script now writes full-content assertions, so the next recording closes
  the gap.
