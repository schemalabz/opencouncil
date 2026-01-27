#!/bin/sh
set -e

# Determine the environment (dev or prod)
APP_ENV=${APP_ENV:-"development"}
USE_LOCAL_DB=${USE_LOCAL_DB:-"true"}

echo "🚀 Starting application in $APP_ENV mode"

# When in development, we want to run `npm install` on startup to ensure
# that the node_modules directory in the container is in sync with the
# package.json from the host machine.
if [ "$APP_ENV" = "development" ]; then
  echo "📦 Ensuring dependencies are in sync..."
  npm install
fi

# Store original database URLs if they exist
ORIGINAL_DATABASE_URL=$DATABASE_URL
ORIGINAL_DIRECT_URL=$DIRECT_URL

# Check if we're using the local or remote database
if [ "$USE_LOCAL_DB" = "true" ]; then
  # Use DB_PORT if provided, otherwise default to 5432
  DB_PORT=${DB_PORT:-5432}
  
  echo "🔧 Using LOCAL dockerized database"
  
  # Construct local database URLs
  LOCAL_DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:${DB_PORT}/${DATABASE_NAME}?sslmode=disable"
  LOCAL_DIRECT_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:${DB_PORT}/${DATABASE_NAME}?sslmode=disable"
  
  # Override database URLs for local database
  export DATABASE_URL=$LOCAL_DATABASE_URL
  export DIRECT_URL=$LOCAL_DIRECT_URL
  
  echo "🔄 Running database migrations and seeding..."
  npm run db:deploy:seed
else
  echo "🌐 Using REMOTE database"
  echo "🔄 Running database migrations (but NOT seeding)..."
  npm run db:deploy
  echo "⏩ Skipping database seeding for remote database"
fi

# Use configured ports if provided, otherwise defaults
APP_PORT=${APP_PORT:-3000}
PRISMA_PORT=${PRISMA_STUDIO_PORT:-5555}
DB_PORT=${DB_PORT:-5432}

# Start the application based on environment
if [ "$APP_ENV" = "production" ]; then
  if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "🗄️  Database running on port $DB_PORT"
  fi
  echo "🏗️ Building and starting production server on port $APP_PORT..."
  npm run production:build
  npx next start -p $APP_PORT
else
  if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "🗄️  Database running on port $DB_PORT"
  fi
  echo "✨ Starting Prisma Studio on port $PRISMA_PORT..."
  npx prisma studio --port $PRISMA_PORT &
  echo "🔄 Starting development server on port $APP_PORT with hot reload..."
  npx next dev --turbo -p $APP_PORT
fi