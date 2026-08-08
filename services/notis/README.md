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
`opencouncil.gr/mcp` — a decide-only wake costs ~$0.05, a research/send wake
~$0.20-0.40, an editorial brief ~$0.15 per meeting (cached on the queue item).

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

Same branch wiring as the main component: `production` branch → production,
`main` → staging. The main app's component is untouched by this — its build
still runs at the root and ignores `services/`.

## Interim admin auth

Until PR 2 replaces it with shared-cookie validation against the main app's
sessions, `/admin/*` and `/api/*` (minus health + login) are gated by
`NOTIS_ADMIN_SECRET`: `/admin/login` exchanges it for an HttpOnly cookie
holding an HMAC of the secret. Rotate by changing the env var.
