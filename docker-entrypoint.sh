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
  echo "🔧 Using LOCAL dockerized database"
  
  # Construct local database URLs
  LOCAL_DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
  LOCAL_DIRECT_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
  
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

# Start the application based on environment
if [ "$APP_ENV" = "production" ]; then
  echo "🏗️ Building and starting production server..."
  npm run production:build
  npm run production:start
else
  echo "✨ Starting Prisma Studio in background..."
  npm run prisma:studio &
  echo "🔄 Starting development server with hot reload..."
  npm run dev
fi