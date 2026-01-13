#!/usr/bin/env bash

# Script to run docker compose with different configurations

# Default configuration
MODE="dev"
USE_LOCAL_DB="true"
ENV_FILE=".env"
DETACHED=""
EXTRA_OPTIONS=""
AUTO_PORT="false"
APP_PORT=""
PRISMA_STUDIO_PORT=""
DB_PORT=""

# Track the last used configuration
LAST_CONFIG_FILE=".last_docker_config"

# Function to check if a port is in use
function is_port_in_use() {
    local port=$1
    # Check if port is in use using multiple methods for reliability
    if command -v lsof &> /dev/null; then
        lsof -i :$port -sTCP:LISTEN -t &> /dev/null
        return $?
    elif command -v ss &> /dev/null; then
        ss -ltn | grep -q ":$port " &> /dev/null
        return $?
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep -q ":$port " &> /dev/null
        return $?
    else
        # Fallback: try to bind to the port using bash
        (echo >/dev/tcp/localhost/$port) &>/dev/null
        return $?
    fi
}

# Function to find the next available port starting from a base port
function find_available_port() {
    local base_port=$1
    local max_attempts=${2:-20}  # Try up to 20 ports
    local current_port=$base_port
    
    for ((i=0; i<max_attempts; i++)); do
        if ! is_port_in_use $current_port; then
            echo $current_port
            return 0
        fi
        ((current_port++))
    done
    
    # If we couldn't find an available port, return the base port and let Docker fail with a clear error
    echo $base_port
    return 1
}

# Function to safely clean Docker resources specific to our app
function clean_resources() {
    local project_name=$(docker compose ps --format json 2>/dev/null | jq -r '.[0].Project' 2>/dev/null)
    
    if [ -z "$project_name" ]; then
        # If no project is running, use the directory name as fallback
        project_name=$(basename $(pwd) | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    fi
    
    echo "🧹 Cleaning up OpenCouncil Docker resources..."
    docker compose -p "$project_name" down -v

    # Remove the configuration tracking file
    rm -f "$LAST_CONFIG_FILE"

    echo "✨ Cleanup complete!"
}

# Function to check if configuration has changed
check_config_changed() {
    local current_config="MODE=$MODE:USE_LOCAL_DB=$USE_LOCAL_DB"
    
    if [ -f "$LAST_CONFIG_FILE" ]; then
        local last_config=$(cat "$LAST_CONFIG_FILE")
        if [ "$current_config" != "$last_config" ]; then
            echo "🔄 Configuration changed, forcing rebuild..."
            EXTRA_OPTIONS="$EXTRA_OPTIONS --build"
            echo "$current_config" > "$LAST_CONFIG_FILE"
            
            return 0
        fi
    else
        echo "$current_config" > "$LAST_CONFIG_FILE"
        return 1
    fi
    return 1
}

# Help function
function show_help {
  echo "Usage: ./run.sh [options] -- [docker compose options]"
  echo "Options:"
  echo "  --prod               Run in production mode"
  echo "  --dev                Run in development mode (default)"
  echo "  --local-db           Use the local dockerized database (with auto-migration and seeding)"
  echo "  --remote-db          Use a remote/external database (with auto-migration but NO seeding)"
  echo "  --env FILE           Specify the environment file (default: .env)"
  echo "  --detached, -d       Run in detached mode (background)"
  echo "  --help               Show this help message"
  echo "Port configuration (for running multiple instances):"
  echo "  --auto-port          Automatically find available ports (default)"
  echo "  --app-port PORT      Set the app port explicitly (disables auto-port)"
  echo "  --prisma-port PORT   Set the Prisma Studio port explicitly (disables auto-port)"
  echo "  --db-port PORT       Set the database port explicitly (disables auto-port)"
  echo "Helper commands:"
  echo "  --clean              Remove all OpenCouncil Docker resources (containers, volumes, networks)"
  echo ""
  echo "Any options after -- will be passed directly to docker compose."
  echo "Examples:"
  echo "  ./run.sh -- --build               # Force rebuild of all containers"
  echo "  ./run.sh -- -V                    # Show docker compose version"
  echo "  ./run.sh --prod --remote-db -- --build --no-cache  # Build with no cache in prod mode"
  echo "  ./run.sh                          # Automatically finds available ports"
  echo "  ./run.sh --app-port 3001 --db-port 5433           # Use specific ports"
  echo "  APP_PORT=3001 DB_PORT=5433 ./run.sh               # Alternative using env vars"
  exit 0
}

# Process arguments for extra options
EXTRA_OPTIONS_MODE=false
for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    EXTRA_OPTIONS_MODE=true
    continue
  fi
  
  if [ "$EXTRA_OPTIONS_MODE" = true ]; then
    EXTRA_OPTIONS="$EXTRA_OPTIONS $arg"
  fi
done

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --prod) MODE="prod" ;;
        --dev) MODE="dev" ;;
        --local-db) USE_LOCAL_DB="true" ;;
        --remote-db) USE_LOCAL_DB="false" ;;
        --env) ENV_FILE="$2"; shift ;;
        --detached|-d) DETACHED="-d" ;;
        --auto-port) AUTO_PORT="true" ;;
        --app-port) APP_PORT="$2"; AUTO_PORT="false"; shift ;;
        --prisma-port) PRISMA_STUDIO_PORT="$2"; AUTO_PORT="false"; shift ;;
        --db-port) DB_PORT="$2"; AUTO_PORT="false"; shift ;;
        --help) show_help ;;
        --clean)
            clean_resources
            exit 0
            ;;
        --) break ;; # Stop processing once we hit the -- separator
        *) echo "Unknown parameter: $1"; show_help ;;
    esac
    shift
done

# Detect architecture and set the appropriate PostGIS image
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  echo "🍏 Detected ARM64 architecture, using imresamu/postgis:16-3.5"
  export POSTGIS_IMAGE="imresamu/postgis:16-3.5"
else
  echo "☁️  Detected x86_64 architecture, using postgis/postgis:16-3.5"
  export POSTGIS_IMAGE="postgis/postgis:16-3.5"
fi
echo ""

# Auto-detect available ports if not explicitly set
if [ -z "$APP_PORT" ]; then
    AUTO_PORT="true"
fi

if [ "$AUTO_PORT" = "true" ]; then
    echo "🔍 Auto-detecting available ports..."
    
    # Find available ports
    if [ -z "$APP_PORT" ]; then
        APP_PORT=$(find_available_port 3000)
        if [ $? -eq 0 ]; then
            if [ "$APP_PORT" != "3000" ]; then
                echo "   ℹ️  Port 3000 is in use, using $APP_PORT for app instead"
            fi
        else
            echo "   ⚠️  Could not find available port for app, trying 3000 anyway"
        fi
    fi
    
    if [ -z "$PRISMA_STUDIO_PORT" ]; then
        PRISMA_STUDIO_PORT=$(find_available_port 5555)
        if [ $? -eq 0 ]; then
            if [ "$PRISMA_STUDIO_PORT" != "5555" ]; then
                echo "   ℹ️  Port 5555 is in use, using $PRISMA_STUDIO_PORT for Prisma Studio instead"
            fi
        else
            echo "   ⚠️  Could not find available port for Prisma Studio, trying 5555 anyway"
        fi
    fi
    
    if [ -z "$DB_PORT" ] && [ "$USE_LOCAL_DB" = "true" ]; then
        DB_PORT=$(find_available_port 5432)
        if [ $? -eq 0 ]; then
            if [ "$DB_PORT" != "5432" ]; then
                echo "   ℹ️  Port 5432 is in use, using $DB_PORT for database instead"
            fi
        else
            echo "   ⚠️  Could not find available port for database, trying 5432 anyway"
        fi
    fi
    echo ""
fi

# Set defaults if still empty
APP_PORT="${APP_PORT:-3000}"
PRISMA_STUDIO_PORT="${PRISMA_STUDIO_PORT:-5555}"
DB_PORT="${DB_PORT:-5432}"

# Export variables for docker compose
export USE_LOCAL_DB=$USE_LOCAL_DB
export ENV_FILE=$ENV_FILE
export APP_PORT=$APP_PORT
export PRISMA_STUDIO_PORT=$PRISMA_STUDIO_PORT
export DB_PORT=$DB_PORT

# Load environment variables from the specified env file
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
    
    # Print database connection information
    echo "🔍 Database connection information:"
    
    if [ "$USE_LOCAL_DB" = "true" ]; then
        echo "   Using LOCAL dockerized database with:"
        echo "   - Database User: $DATABASE_USER"
        echo "   - Database Name: $DATABASE_NAME"
        echo "   - Database Password: ${DATABASE_PASSWORD:0:1}**** (first character only for security)"
        echo "   - Database operations: WILL auto-migrate and seed"
    else
        # Check for required environment variables
        if [ -z "$DATABASE_URL" ] || [ -z "$DIRECT_URL" ]; then
            echo "❌ Error: DATABASE_URL and DIRECT_URL must be defined when using remote database"
            exit 1
        else
            # Mask the password in the URL for security
            MASKED_URL=$(echo $DATABASE_URL | sed -E 's/\/\/([^:]+):([^@]+)@/\/\/\1:****@/')
            echo "   Using REMOTE database with:"
            echo "   - Database URL: $MASKED_URL"
            echo "   - Database operations: WILL auto-migrate but will NOT seed"
        fi
    fi
    echo ""
else
    echo "Warning: Environment file $ENV_FILE not found. Using default environment variables."
fi

# Print port configuration
echo "🔌 Port configuration:"
echo "   - App: http://localhost:$APP_PORT"
if [ "$MODE" = "dev" ]; then
    echo "   - Prisma Studio: http://localhost:$PRISMA_STUDIO_PORT"
fi
if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "   - Database: localhost:$DB_PORT"
fi
echo ""

# If there are extra options, show them
if [ ! -z "$EXTRA_OPTIONS" ]; then
    echo "🛠️ Using additional docker compose options: $EXTRA_OPTIONS"
fi

# Determine which profiles to use
PROFILES=""
if [ "$MODE" = "prod" ]; then
  PROFILES="--profile prod"
  if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "🚀 Running PRODUCTION mode with LOCAL database..."
    PROFILES="$PROFILES --profile with-db"
  else
    echo "🚀 Running PRODUCTION mode with REMOTE database..."
  fi
else # dev mode
  PROFILES="--profile dev"
  if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "🔧 Running DEVELOPMENT mode with LOCAL database..."
    PROFILES="$PROFILES --profile with-db"
  else
    echo "🔧 Running DEVELOPMENT mode with REMOTE database..."
  fi
fi

# Check if configuration changed and force rebuild if necessary
check_config_changed

# Run docker compose with profiles
COMPOSE_FILES="-f docker-compose.yml"
if [ "$MODE" = "dev" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
fi

docker compose --env-file $ENV_FILE $COMPOSE_FILES $PROFILES up $DETACHED $EXTRA_OPTIONS