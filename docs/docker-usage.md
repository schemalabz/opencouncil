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

**Running Multiple Instances**: If you need to run multiple instances simultaneously (e.g., with git worktrees), the script automatically detects available ports. See the [CONTRIBUTING guide](../CONTRIBUTING.md#working-with-multiple-features-simultaneously) for details on this workflow.

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

### Running Multiple Instances

You can run multiple instances of OpenCouncil simultaneously, which is useful for git worktrees or parallel development. **The script automatically detects if ports are in use** and finds the next available port:

```bash
# First instance (uses default ports: 3000, 5555, 5432)
./run.sh

# Second instance (automatically uses 3001, 5556, 5433)
./run.sh

# Third instance (automatically uses 3002, 5557, 5434)
./run.sh
```

The script will inform you which ports it's using. If you prefer to specify ports manually:

```bash
./run.sh --app-port 3001 --prisma-port 5556 --db-port 5433
```

The script will automatically detect if ports are in use and find the next available ones, making it easy to run multiple instances without manual configuration.

### Running Just the Database

If you want to run only the database container (useful for development without Docker):

```bash
# Run just the database
docker compose up db

# Run database in detached mode
docker compose up -d db
```

## Running Commands in Docker

To run any command inside the Docker container with the proper environment, use the universal `exec.sh` script:

```bash
# Prisma commands
./exec.sh npx prisma generate
./exec.sh npx prisma migrate dev
./exec.sh npx prisma studio

# TypeScript scripts
./exec.sh npx tsx scripts/find_duplicate_subjects.ts --city chania
./exec.sh tsx scripts/email_municipality.ts

# NPM scripts
./exec.sh npm run test
./exec.sh npm run build

# Interactive shell
./exec.sh /bin/sh
```

The `exec.sh` script will:
- Load your environment variables from `.env`
- Start the container if it's not running
- Execute your command with the proper environment

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

## Prisma Operations

For Prisma-specific operations, you can use `exec.sh`:

```bash
# Generate Prisma client
./exec.sh npx prisma generate

# Run migrations
./exec.sh npx prisma migrate dev

# Deploy migrations
./exec.sh npx prisma migrate deploy

# Open Prisma Studio
./exec.sh npx prisma studio

# Push schema to database
./exec.sh npx prisma db push

# Seed database
./exec.sh npm run db:deploy:seed

# Reset database (WARNING: destructive!)
./exec.sh npx prisma migrate reset
```

## Managing Docker Resources

### Cleaning Up Docker Resources

The system provides a cleanup command to help manage Docker resources:

```bash
./run.sh --clean
```

This command:
- Stops and removes all containers for the current worktree
- Removes volumes (including database data)
- Removes the configuration tracking file
- Removes networks created by the containers
- Use this when you want to start completely fresh

**When to use `--clean`:**
- When you want to start completely fresh with a clean database
- Before removing a git worktree (see [worktree teardown guide](../CONTRIBUTING.md#cleaning-up-after-feature-completion))
- When troubleshooting Docker-related issues

**For git worktrees:** Each worktree creates its own isolated set of Docker containers. Always run `./run.sh --clean` from within the worktree directory before removing it to avoid orphaned Docker resources.

Note: This command only affects Docker resources in the current directory and won't interfere with other instances or Docker projects on your system.

## Docker Network Configuration

OpenCouncil uses configurable Docker networks for inter-service communication and isolation between instances.

### Default Behavior (Shared Network)

By default, all OpenCouncil instances use the `opencouncil-net` network:

```bash
# Default shared network
./run.sh
```

This allows:
- Multiple OpenCouncil instances to communicate with a single `opencouncil-tasks` instance
- Services to discover each other across instances
- Simple setup for most development scenarios

### Custom Networks (Isolated Development)

For isolated feature development or testing multiple configurations in parallel, specify a custom network:

```bash
# Using a flag
./run.sh --network feature-auth
# Creates/uses network: opencouncil-net-feature-auth

# Using an environment variable
NETWORK_NAME=feature-auth ./run.sh

# Or add to your .env file (useful for per-worktree configuration)
echo "NETWORK_NAME=feature-auth" >> .env
./run.sh
```

Custom network names are automatically prefixed with `opencouncil-net-` for consistency.

The network being used is displayed when starting:

```
📡 Network configuration:
   - Using network: opencouncil-net-feature-auth
```

## Connecting to the Task Server

To connect `opencouncil-tasks` to your OpenCouncil instance, configure it to use the same network. In `opencouncil-tasks`, set the network name in your `docker-compose.yml` or `docker-compose.dev.yml`:

```yaml
networks:
  opencouncil-net:
    name: opencouncil-net  # or opencouncil-net-feature-auth for custom networks
    external: true
```

### Shared Network (Default)

```bash
# In opencouncil
./run.sh

# In opencouncil-tasks
# Ensure docker-compose.yml uses: name: opencouncil-net
docker compose up
```
Both use `opencouncil-net` and can communicate.

### Custom Network (Isolated Pair)

```bash
# In opencouncil
./run.sh --network feature-auth

# In opencouncil-tasks
# Update docker-compose.yml to use: name: opencouncil-net-feature-auth
docker compose up
```
Both now use `opencouncil-net-feature-auth` and are isolated from other instances.

### Common Scenarios

**Multiple OpenCouncil → Single Tasks Server:**
```bash
# Instance 1 (default network)
cd ~/projects/opencouncil-main
./run.sh

# Instance 2 (default network)  
cd ~/projects/opencouncil-feature-x
./run.sh

# Tasks server (default network)
cd ~/projects/opencouncil-tasks
# Ensure docker-compose.yml uses: name: opencouncil-net
docker compose up
```
All three share `opencouncil-net` and can communicate.

**Isolated Feature Testing (Paired Instances):**
```bash
# OpenCouncil instance
cd ~/projects/opencouncil-feature-auth
./run.sh --network feature-auth

# Matching tasks instance
cd ~/projects/opencouncil-tasks-feature-auth
# Update docker-compose.yml to use: name: opencouncil-net-feature-auth
docker compose up
```
This pair uses `opencouncil-net-feature-auth`, isolated from other instances.

**Per-Worktree Configuration:**

Create a `.env` file in your worktree:
```bash
cd ~/projects/opencouncil-feature-auth
echo "NETWORK_NAME=feature-auth" >> .env
./run.sh  # Automatically uses feature-auth network
```

### Environment Variables for Inter-Service Communication

For proper bidirectional communication between OpenCouncil and the task server, configure these in your `.env` file:

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