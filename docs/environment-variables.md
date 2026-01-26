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
| `NEXT_PUBLIC_BASE_URL` | Base URL of the application. | Yes | - |

### Authentication
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `RESEND_API_KEY` | API key for Resend email service. | Yes | - |
| `BASIC_AUTH_USERNAME` | Username for basic auth protection. | No | - |
| `BASIC_AUTH_PASSWORD` | Password for basic auth protection. | No | - |
| `NEXTAUTH_SECRET` | Secret used by NextAuth.js to hash tokens, sign/encrypt cookies, and generate cryptographic keys. | Yes | - |

### Notifications
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BIRD_API_KEY` | API key for Bird messaging service (WhatsApp/SMS). | No | - |
| `BIRD_WORKSPACE_ID` | Bird workspace identifier for API calls. | No | - |
| `BIRD_WHATSAPP_CHANNEL_ID` | Bird channel ID for WhatsApp messages. | No | - |
| `BIRD_SMS_CHANNEL_ID` | Bird channel ID for SMS messages (fallback). | No | - |
| `BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING` | Template project ID (UUID) from Bird Studio for before meeting notifications. | No | - |
| `BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING` | Template project ID (UUID) from Bird Studio for after meeting notifications. | No | - |
| `BIRD_WHATSAPP_TEMPLATE_WELCOME` | Template project ID (UUID) from Bird Studio for welcome messages when users sign up. | No | - |

**Note**: Bird API variables are optional. If not configured, message notifications (WhatsApp/SMS) will be skipped, but email notifications will still work. You need separate channel IDs because WhatsApp and SMS typically use different phone numbers/senders in Bird.

**Getting Template Project IDs**: In Bird Studio, go to your approved WhatsApp templates and copy the project ID (UUID format like `ce6a2fd6-b2fa-4f5a-a2cd-f3bd15883318`). We use the latest version of each template project.

**Required template parameters:**
- Before/After Meeting templates: `date`, `cityName`, `subjectsSummary`, `adminBody`, `notificationId`
- Welcome template: `userName`, `cityName`

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

### Search Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ELASTICSEARCH_URL` | Elasticsearch server URL. | Yes | - |
| `ELASTICSEARCH_API_KEY` | Elasticsearch API key. | Yes | - |

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
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox access token. | Yes | - |

### Task Processing
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TASK_API_URL` | URL for the background task processing API. | Yes | - |
| `TASK_API_KEY` | API key for task processing API. | Yes | - |

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
| `NEXT_PUBLIC_CONTACT_PHONE` | Public contact phone number. | No | - |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact email. | No | - |
| `NEXT_PUBLIC_CONTACT_ADDRESS` | Public contact address. | No | - |

### Development Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DEV_TEST_CITY_ID` | The city ID used for creating development test users. | No | `chania` |
| `DEV_EMAIL_OVERRIDE` | Email address to receive ALL emails in development mode. When set, redirects all outgoing emails to this address instead of the actual recipients. The subject line will be prefixed with `[DEV → original@email.com]` to show the intended recipient. | No | - |
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
- Email override is available via `DEV_EMAIL_OVERRIDE` to intercept all outgoing emails

### Email Testing in Development
To test email functionality without sending emails to real users, set the `DEV_EMAIL_OVERRIDE` environment variable:

```bash
DEV_EMAIL_OVERRIDE=your-test-email@example.com
```

When set, all emails will be redirected to this address in development mode. The subject line will be prefixed with `[DEV → original@email.com]` to indicate the intended recipient. This applies to all emails:
- Highlight completion notifications
- Authentication emails
- User invitations
- Notification system emails

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
