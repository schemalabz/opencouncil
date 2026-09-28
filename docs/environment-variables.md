# Environment Variables

This document provides a comprehensive overview of all environment variables used in the OpenCouncil project. For a quick start, copy `.env.example` to `.env` and adjust the values as needed.

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the values in `.env` according to your setup.

## Environment Variable Validation

To ensure the application is always running with a valid configuration, this project uses the [`@t3-oss/env-nextjs`](https://env.t3.gg) library. The entire configuration lives in the `src/env.mjs` file.

This setup provides several key benefits:

1.  **Build-Time Validation**: By importing `src/env.mjs` into `next.config.mjs`, the application validates all environment variables at build time. If any required variable is missing, the build will fail with a clear error message, preventing broken deployments.
2.  **Full Type-Safety**: It exports a fully typed `env` object. This eliminates an entire class of runtime bugs by guaranteeing that variables are of the correct type (e.g., `string`, `url`) and preventing you from accessing a variable that might be `undefined`.

### How to Use

For all new code, instead of accessing environment variables via `process.env`, you **must** import the validated and typed `env` object from `src/env.mjs`:

```javascript
import { env } from '@/env.mjs';

const dbUrl = env.DATABASE_URL; // This is guaranteed to be a string.
```

## Variable Categories

### Database Initialization (for local Docker setup)
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_USER` | Username for the local PostgreSQL container. | No | - |
| `DATABASE_PASSWORD` | Password for the local PostgreSQL container. | No | - |
| `DATABASE_NAME` | Database name for the local PostgreSQL container. | No | - |

### Local DB configuration (for flake dev runner)
These variables are used by the flake runner (`nix run .#dev`) to configure **local DB modes** (`--db=nix`, `--db=docker`).

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OC_DB_USER` | Username for local DB modes. | No | `opencouncil` |
| `OC_DB_PASSWORD` | Password for local DB modes. | No | `opencouncil` |
| `OC_DB_NAME` | Database name for local DB modes. | No | `opencouncil` |
| `OC_DB_PORT` | Port for local DB modes (if unset, the runner auto-selects a free port starting at 5432). | No | auto |
| `OC_DB_DATA_DIR` | Data directory for the Nix-managed Postgres cluster. | No | `./.data/postgres` |
| `OC_APP_PORT` | App port (if unset, the runner auto-selects a free port starting at 3000). | No | auto |
| `OC_PRISMA_STUDIO_PORT` | Prisma Studio port (if unset, the runner auto-selects a free port starting at 5555). | No | auto |
| `OC_DEV_DB_MODE` | Default DB mode for `nix run .#dev` (`nix`, `docker`, `remote`, `external`). | No | `nix` |
| `OC_DEV_MIGRATE` | If `1`, run `npm run db:deploy` before starting the app in remote/external modes. | No | `0` |
| `OC_DEV_STUDIO` | If `0`, disable Prisma Studio in the runner. | No | auto (enabled for local DB modes) |

### Database Connection
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string for Prisma. | Yes | - |
| `DIRECT_URL` | Direct PostgreSQL connection string. Often the same as `DATABASE_URL`. | Yes | - |

### Application Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment (development/production/test). | No | `development` |
| `NEXTAUTH_URL` | Base URL of the application (used for callbacks, emails, etc.). | Yes | - |

### Authentication
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `RESEND_API_KEY` | API key for Resend email service. | Yes | - |
| `EMAIL_FROM_OVERRIDE` | Sender ("from") address for every email. When it is not set, each email uses its own `opencouncil.gr` mailbox, as `src/lib/email/senders.ts` defines. For local development, use a Resend test sender (see below). | No | - |
| `BASIC_AUTH_USERNAME` | Username for basic auth protection. | No | - |
| `BASIC_AUTH_PASSWORD` | Password for basic auth protection. | No | - |
| `NEXTAUTH_SECRET` | Secret used by NextAuth.js to hash tokens, sign/encrypt cookies, and generate cryptographic keys. | Yes | - |
| `AUTH_GOOGLE_ID` | OAuth client id for "Sign in with Google". Unset hides the Google button. The magic link keeps working. | No | - |
| `AUTH_GOOGLE_SECRET` | OAuth client secret for "Sign in with Google". Set it together with `AUTH_GOOGLE_ID`. | No | - |
| `SESSION_COOKIE_DOMAIN` | Domain for the session-mirror cookie that authenticates the Notis admin. Derived from `DEPLOYMENT_ENV` + `NEXTAUTH_URL` (`.opencouncil.gr` on production, `.staging.opencouncil.gr` on staging; none in development or previews). Set only to override. | No | derived |
| `SESSION_COOKIE_SUFFIX` | Per-environment suffix for the mirror cookie name, so the production mirror never authenticates a staging service. Derived from `DEPLOYMENT_ENV` (`-staging` on staging, empty on production). Set only to override — and if you do, set Notis's `MAIN_SESSION_COOKIE_NAME` to match. | No | derived |

### Notifications
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NOTIS_API_URL` | Base URL of the Notis service (`https://notis.opencouncil.gr`; staging `https://notis.staging.opencouncil.gr`; `http://localhost:3001` in development). The profile's Νότης switch reads and flips the reader's subscription through it, server-side. Without it the switch shows as unavailable. | No | - |
| `NOTIS_SERVICE_TOKEN` | Bearer token presented on `NOTIS_API_URL/api/subscriptions/*`. The same value as the Notis component's `NOTIS_SERVICE_TOKEN`, at least 32 characters (`openssl rand -hex 32`), different per environment. | No | - |

Every WhatsApp and SMS message to a reader belongs to the Notis service, which holds the Bird credentials and its own webhook subscription. Its variables are in [services/notis/README.md](../services/notis/README.md), and the Bird workspace setup in [bird-setup.md](./bird-setup.md).

#### Resend setup for local development

Every email goes through [Resend](https://resend.com). The default senders use the `opencouncil.gr` domain, and Resend sends only from a domain that you verified on your own account. On a fork, every send therefore fails with **HTTP 403** until you follow these steps.

To run a fork with your own Resend account and no verified domain:

1. Create a Resend account and an API key. Set `RESEND_API_KEY`.
2. Set `EMAIL_FROM_OVERRIDE="OpenCouncil <onboarding@resend.dev>"`. Every email then uses the Resend test sender.
3. Set `DEV_EMAIL_OVERRIDE` to the email that owns your Resend account. In test mode, Resend delivers only to that email. The override sends every email there while you develop, as [Email Testing in Development](#email-testing-in-development) describes.
4. Sign in with that same email. Resend refuses a sign-in email to any other address.

With a domain that you verified on Resend, set `EMAIL_FROM_OVERRIDE` to an address on that domain instead. Resend then delivers to any recipient.

In development, the QuickLogin tool signs you in as a seeded [test user](#test-users) without an email.

When a send fails, the dev server console shows `[auth][error] Error: Resend error (<status>): <Resend's response>`. Resend's message names the cause.

#### Sign in with Google
Create an OAuth 2.0 client of type "Web application" in the Google Cloud Console. Add one authorized redirect URI per deployment host: `<NEXTAUTH_URL>/api/auth/callback/google`, for example `http://localhost:3000/api/auth/callback/google` and `https://opencouncil.gr/api/auth/callback/google`.

The button appears only on the host that `NEXTAUTH_URL` names. Auth.js builds the OAuth `redirect_uri` from `NEXTAUTH_URL`, so a sign-in that starts on another realm domain (`opencouncil.rs`, `opencouncil.fr`) cannot finish there. Those domains keep the magic link only. A preview names its own host in `NEXTAUTH_URL`, so it works once `https://pr-<N>.opencouncil.dev/api/auth/callback/google` is in the client's redirect URIs.

#### NEXTAUTH_SECRET
You can quickly create a good value on the command line via this openssl command:
```bash
openssl rand -base64 32
```
Copy the output and set it as your `NEXTAUTH_SECRET` in your `.env` file.

### AI and LLM Features
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ANTHROPIC_API_KEY` | API key for Claude. | Yes | - |
| `GEMINI_API_KEY` | Gemini key for the subject illustrations. When unset, no image is generated and subjects show the topic-coloured fallback. | No | - |
| `SUBJECT_IMAGES_PREFIX` | Folder inside `DO_SPACES_BUCKET` that holds the subject illustrations. The folder names the style. | No | `subject-images/8bit` |

### Search Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ELASTICSEARCH_URL` | Elasticsearch server URL. | Yes | - |
| `ELASTICSEARCH_API_KEY` | Elasticsearch API key. | Yes | - |
| `ELASTICSEARCH_INDEX` | Search index name. Override for the local E2E harness (`subjects_test`). | No | `subjects` |

### Deployment
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DEPLOYMENT_ENV` | Deployment target: `development`, `preview`, `staging`, or `production`. Set by the preview service (`preview`) and the staging app (`staging`); everywhere else it defaults from `NODE_ENV`. Gates dev tooling and orphaned-search-hit alerting. | No | from `NODE_ENV` |

### Storage (e.g., Digital Ocean Spaces)
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DO_SPACES_ENDPOINT` | Storage endpoint. | Yes | - |
| `DO_SPACES_KEY` | Storage access key. | Yes | - |
| `DO_SPACES_SECRET` | Storage secret key. | Yes | - |
| `DO_SPACES_BUCKET` | Storage bucket name. | Yes | - |
| `CDN_URL` | CDN URL for serving static assets from storage. | Yes | - |

### Maps and Location
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_API_KEY` | Google Maps API key. | Yes | - |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox access token. | Yes | pre-filled dev token |

`.env.example` ships with a public, localhost-restricted, rate-capped dev token, so the map works after `cp .env.example .env` with no extra setup. It's not valid outside `localhost` — get your own token at [mapbox.com](https://www.mapbox.com) for deployments.

### Task Processing
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TASK_API_URL` | URL for the background task processing API. | Yes | - |
| `TASK_API_KEY` | API key for task processing API. | Yes | - |
| `CRON_SECRET` | Bearer token for authenticating cron job endpoints (e.g., `/api/cron/poll-decisions`). Generate with `openssl rand -base64 32`. | No | - |

### Google Calendar Integration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console. | No | - |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth 2.0 client secret from Google Cloud Console. | No | - |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | OAuth 2.0 refresh token for accessing the calendar. | No | - |
| `GOOGLE_CALENDAR_ID` | Calendar ID where events will be created (typically your email address or a unique calendar ID). | No | - |
| `GOOGLE_CALENDAR_ENABLED` | Enable or disable calendar integration. Set to `true` to enable. | No | - |

The Google Calendar integration uses OAuth 2.0 authentication with a Google account to create calendar events when meetings are added. For detailed setup instructions, see [Google Calendar Setup Guide](./google-calendar-setup.md).

### Contact Information
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact email. | No | - |
| `NEXT_PUBLIC_CONTACT_ADDRESS` | Public contact address. | No | - |

### Development Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DEV_TEST_CITY_ID` | The city ID used for creating development test users. | No | `chania` |
| `DEV_EMAIL_OVERRIDE` | Email address that receives outgoing email instead of the real recipients. See [Email Testing in Development](#email-testing-in-development) for which emails it redirects. | No | - |
| `SEED_DATA_URL` | URL to fetch seed data from if local file doesn't exist. | No | [link](https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/seed_data.json) |
| `SEED_DATA_PATH` | Path to local seed data file. | No | `./prisma/seed_data.json` |

### Docker Port Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `APP_PORT` | Host port for the Next.js application. | No | `3000` (auto-detected) |
| `PRISMA_STUDIO_PORT` | Host port for Prisma Studio (dev mode only). | No | `5555` (auto-detected) |
| `DB_PORT` | Host port for the local PostgreSQL database. | No | `5432` (auto-detected) |

**Note**: By default, the run script automatically detects if these ports are in use and finds the next available port. This makes it easy to run multiple instances simultaneously (e.g., with git worktrees) without manual configuration. You can override this by explicitly setting these variables or using command-line flags. See [Running Multiple Instances](./docker-usage.md#running-multiple-instances) for detailed usage examples.

### Notes: Docker vs Nix local DB credentials
- The `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` variables are primarily for the **Docker `run.sh`** flow.
- The flake runner (`nix run .#dev`) uses **`OC_DB_*`** for local DB modes so your `.env` can remain remote-oriented without breaking local DB bootstraps.

## Development Features

### Mock Data
The project includes a comprehensive mock data system that is automatically enabled when `NODE_ENV=development`. This is particularly useful for:
- Testing the chat interface without API costs
- Development without a full database setup
- CI/CD pipeline testing

The mock data system provides:
- Simulated AI responses
- Mock speaker segments
- Test subject references
- Realistic streaming behavior

### Test Users
When `NODE_ENV=development`, the application includes a QuickLogin development tool that allows switching between different user accounts for testing authorization scenarios. The test users are automatically created during database seeding and are focused on the city specified by `DEV_TEST_CITY_ID`.

### Development Mode
When `NODE_ENV=development`:
- Mock data is automatically enabled
- Additional development features are enabled
- Debug information is shown in the UI
- Mock data can be toggled in the chat interface
- QuickLogin tool is available for testing different user permission levels
- Mobile Preview QR code available next to the DEV panel for phone testing (see [Nix Usage Guide](nix-usage.md#mobile-preview-qr-code-for-phone-testing))
- Email override is available via `DEV_EMAIL_OVERRIDE` (see [Email Testing in Development](#email-testing-in-development))

### Email Testing in Development
To keep test emails away from real users, set `DEV_EMAIL_OVERRIDE`. With the Resend test sender, use the email that owns your Resend API key:

```bash
DEV_EMAIL_OVERRIDE=you@your-domain.org
```

The variable redirects two groups of email differently:
- **Every email except sign-in**, in development and on a preview: the email goes to `DEV_EMAIL_OVERRIDE`. The subject starts with `[DEV → original@email.com]`, and a banner shows the intended recipients. This group includes notifications, user invitations and highlight emails.
- **Sign-in emails**: only the sign-in email of a seeded [test user](#test-users) goes to `DEV_EMAIL_OVERRIDE`. This applies in every environment where the variable is set. A sign-in email for any other address goes to that address.

## Production Setup

For production deployment:
1. Set `NODE_ENV=production`
2. Configure all required API keys
3. Set up proper storage configuration
4. Configure contact information

## Security Notes

- Never commit `.env` files to version control
- Keep API keys secure and rotate them regularly
- Use environment-specific values for development and production
- Consider using a secrets management service in production
