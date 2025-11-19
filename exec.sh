#!/bin/bash

# ============================================
# Docker Exec Helper Script
# ============================================
# Universal script to run ANY command inside the Docker container
# with proper environment configuration.
#
# Usage:
#   ./exec.sh <command> [args...]
#
# Examples:
#   ./exec.sh npx prisma generate
#   ./exec.sh npx prisma migrate dev
#   ./exec.sh npx tsx scripts/find_duplicate_subjects.ts --city chania
#   ./exec.sh npm run test
#   ./exec.sh /bin/sh              # Interactive shell
# ============================================

set -e

# Configuration
ENV_FILE=".env"
COMPOSE_FILE="docker-compose.yml"
CONTAINER="app-dev"
PROFILE="dev"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables from .env file
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${YELLOW}Warning: .env file not found. Using default environment.${NC}"
fi

# Determine which profiles to use based on USE_LOCAL_DB
PROFILES="--profile $PROFILE"
USE_LOCAL_DB=${USE_LOCAL_DB:-"true"}
if [ "$USE_LOCAL_DB" = "true" ]; then
    PROFILES="$PROFILES --profile with-db"
fi

# Check if docker compose is available
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "Error: docker compose is not installed"
    exit 1
fi

# Function to check if container is running
check_container() {
    if ! $DOCKER_COMPOSE -f $COMPOSE_FILE ps | grep -q "$CONTAINER.*Up"; then
        echo -e "${YELLOW}Container $CONTAINER is not running.${NC}"
        if [ "$USE_LOCAL_DB" = "true" ]; then
            echo -e "${BLUE}Starting container with local database...${NC}"
        else
            echo -e "${BLUE}Starting container with remote database...${NC}"
        fi
        $DOCKER_COMPOSE --env-file $ENV_FILE -f $COMPOSE_FILE $PROFILES up -d $CONTAINER
        echo -e "${GREEN}✓ Container started!${NC}"
        echo ""
        # Give container a moment to fully start
        sleep 2
    fi
}

# Show help if no arguments
if [ $# -eq 0 ]; then
    echo "Docker Exec Helper - Run commands inside Docker container"
    echo ""
    echo "Usage: $0 <command> [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 npx prisma generate"
    echo "  $0 npx prisma migrate dev"
    echo "  $0 npx tsx scripts/find_duplicate_subjects.ts --city chania"
    echo "  $0 npm run test"
    echo "  $0 /bin/sh                    # Interactive shell"
    echo ""
    exit 0
fi

# Check if container is running, start if needed
check_container

# Execute the command in the container
$DOCKER_COMPOSE --env-file $ENV_FILE -f $COMPOSE_FILE $PROFILES exec $CONTAINER "$@"

