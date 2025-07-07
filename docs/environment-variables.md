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
| `NEXT_PUBLIC_URL` | Full URL for authentication and callbacks. | Yes | - |
| `NEXT_PUBLIC_MAIN_DOMAIN` | Main domain for the application. | Yes | - |

### Authentication
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `RESEND_API_KEY` | API key for Resend email service. | Yes | - |
| `BASIC_AUTH_USERNAME` | Username for basic auth protection. | No | - |
| `BASIC_AUTH_PASSWORD` | Password for basic auth protection. | No | - |
| `NEXTAUTH_SECRET` | Secret used by NextAuth.js to hash tokens, sign/encrypt cookies, and generate cryptographic keys. | Yes | - |

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
| `VOYAGE_API_KEY` | API key for Voyage AI. | Yes | - |
| `VOYAGE_API_BASE_URL` | Base URL for Voyage AI API. | No | `https://api.voyageai.com/v1` |

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
| `SEED_DATA_URL` | URL to fetch seed data from if local file doesn't exist. | No | [link](https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/seed_data.json) |
| `SEED_DATA_PATH` | Path to local seed data file. | No | `./prisma/seed_data.json` |

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
