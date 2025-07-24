# Docker Setup Usage Guide

This guide explains how to use the flexible Docker setup to run OpenCouncil with either a local dockerized database or a remote database.

## Quick Start

First, make sure the script is executable:
```bash
chmod +x run.sh
```

For a complete list of options:
```bash
./run.sh --help
```

### Development Mode

```bash
# Run with local database (default)
./run.sh

# Run with remote database
./run.sh --remote-db

# Force rebuild of containers
./run.sh -- --build
```

### Production Mode

```bash
# Run with local database
./run.sh --prod

# Run with remote database
./run.sh --prod --remote-db
```

### Running Just the Database

If you want to run only the database container (useful for development without Docker):

```bash
# Run just the database
docker compose up db

# Run database in detached mode
docker compose up -d db
```

## Database Operations

The system handles database operations differently depending on which mode you're using:

| Database Type | Auto-Migrate | Auto-Seed | Notes |
|---------------|--------------|-----------|-------|
| Local         | ✅ Yes      | ✅ Yes    | Safe for development |
| Remote        | ✅ Yes      | ❌ No     | Protects production data |

This approach prevents accidental seeding of production or shared databases.

## Using Docker Compose Options

You can pass additional options to Docker Compose by using the `--` separator:

```bash
# Force rebuild of containers
./run.sh -- --build

# Build with no cache
./run.sh -- --build --no-cache

# Remove orphaned containers
./run.sh -- --remove-orphans
```

## Environment Variables

By default, the script uses the `.env` file for configuration. You can specify a different environment file using the `--env` option.

For initial setup, copy the example environment file:
```bash
cp .env.example .env
```

Then edit the file to include your specific configuration values.

### Database Connection Configuration

The system automatically manages database connection strings based on whether you're using a local or remote database:

1. **Database Initialization Variables** (used by the Docker container):
   ```
   DATABASE_USER=your_user
   DATABASE_PASSWORD=your_password
   DATABASE_NAME=your_db_name
   ```
   These variables are used by the Docker container to initialize the PostgreSQL database.

2. **Database Connection Strings** (used by the application):
   ```
   DATABASE_URL="postgresql://user:password@remote-host:5432/dbname?sslmode=require"
   DIRECT_URL="postgresql://user:password@remote-host:5432/dbname?sslmode=require"
   ```
   These connection strings are used by the application to connect to the database. They must match each other as they are both used by Prisma (as defined in `schema.prisma`).

When using a local database (`--local-db`), the system automatically overrides these URLs with:
```
DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
DIRECT_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
```

This means you can keep your `.env` file configured for the remote database, and the system will automatically use the correct connection strings based on the `--local-db` or `--remote-db` flag.

#### DATABASE_URL vs DIRECT_URL

In our Prisma setup:
- `DATABASE_URL`: Primary connection string used for most database operations. In production with connection pooling, this points to the pooler.
- `DIRECT_URL`: Direct database connection that bypasses connection poolers. Required for migrations and managing extensions like postgis.

For local development, both URLs typically point to the same database. In production, they may differ if using connection pooling.

## Managing Docker Resources

The system provides a cleanup command to help manage Docker resources:

```bash
./run.sh --clean
```
This command:
- Stops and removes OpenCouncil containers
- Removes OpenCouncil networks
- Removes OpenCouncil volumes (including database data)
- Removes the configuration tracking file
- Use this when you want to start completely fresh

Note: This command only affects Docker resources related to OpenCouncil and won't interfere with other Docker projects on your system.

## Connecting to the Task Server

For local development that requires communication with the `opencouncil-tasks` project, our Docker setup is pre-configured to facilitate this.

- The `docker-compose.dev.yml` file defines a shared Docker network named `opencouncil-net`.
- The `./run.sh` script automatically applies this file when you run in the default development mode.

This allows the main OpenCouncil application to communicate with the services in the `opencouncil-tasks` project, as long as the `opencouncil-tasks` services are also configured to join the `opencouncil-net` network.

For proper bidirectional communication between the applications, you need to configure two environment variables in your `.env` file:

```bash
# Used by OpenCouncil to send requests to the task server
TASK_API_URL=http://opencouncil-tasks-app-1:3005

# Used to construct callback URLs that the task server uses to report task completion status back to OpenCouncil
NEXT_PUBLIC_BASE_URL=http://opencouncil-app-dev-1:3000
```

The service names (`opencouncil-tasks-app-1` and `opencouncil-app-dev-1`) are derived from the respective project's `docker-compose.yml` files, and the ports correspond to the internal container ports.



## Development Mode Caching

When running in development mode (`./run.sh`), the application uses Docker volumes to mount your local code into the container. This setup, combined with Next.js's data caching, means that if you switch between local and remote databases during development, you may need to clear the Next.js cache to see the updated data.

To clear the Next.js cache, you can:

1. Stop the development server
2. Remove the `.next` directory:
   ```bash
   rm -rf .next
   ```
3. Restart the development server:
   ```bash
   ./run.sh
   ```

This ensures you're seeing fresh data from the newly selected database.