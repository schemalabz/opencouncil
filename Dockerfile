# Stage 1: Base image
FROM node:20-alpine AS base

# Set the working directory in the container
WORKDIR /app

# Install necessary system dependencies
RUN apk add --no-cache openssl openssl-dev

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Expose the port the app runs on
EXPOSE 3000

# Stage 2: Production image
FROM base

# Accept build argument to toggle database commands
ARG USE_LOCAL_DB=true

# Set environment variables
ENV USE_LOCAL_DB=${USE_LOCAL_DB}
ENV APP_ENV=production

# Copy the rest of the application code
COPY . .

# Prepare start script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Start the application
ENTRYPOINT ["docker-entrypoint.sh"]