#!/bin/bash

# Script to run docker compose with different configurations

# Default configuration
MODE="dev"
USE_LOCAL_DB="true"
ENV_FILE=".env"
DETACHED=""
EXTRA_OPTIONS=""

# Track the last used configuration
LAST_CONFIG_FILE=".last_docker_config"

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
  echo "Helper commands:"
  echo "  --clean              Remove all OpenCouncil Docker resources (containers, volumes, networks)"
  echo ""
  echo "Any options after -- will be passed directly to docker compose."
  echo "Examples:"
  echo "  ./run.sh -- --build               # Force rebuild of all containers"
  echo "  ./run.sh -- -V                    # Show docker compose version"
  echo "  ./run.sh --prod --remote-db -- --build --no-cache  # Build with no cache in prod mode"
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

# Export variables for docker compose
export USE_LOCAL_DB=$USE_LOCAL_DB
export ENV_FILE=$ENV_FILE

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
docker compose --env-file $ENV_FILE $PROFILES up $DETACHED $EXTRA_OPTIONS