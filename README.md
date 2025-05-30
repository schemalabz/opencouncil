# OpenCouncil

Welcome to OpenCouncil - an open-source platform making local government more transparent and accessible. This project aims to digitize, transcribe, and make searchable municipal council meetings, helping citizens engage with their local government.

## About the Project

OpenCouncil is developed by [Schema Labs](https://schemalabs.gr), a non-profit organization building technology to strengthen democracy. The platform offers:

- 🎙️ **Automatic Transcription**: Word-for-word transcription of council meetings with speaker recognition
- 📝 **Smart Summaries**: AI-generated summaries of council member statements
- 🔍 **Advanced Search**: Full-text search across all council meetings
- 🎥 **Meeting Highlights**: Automatic generation of short videos highlighting key moments
- 🌐 **Open Data**: All data available through a public API
- 🤖 **AI Chat Assistant**: Ask questions about council meetings
- 🌍 **Multilingual Support**: (Coming Soon) Support for multicultural cities

## Technical Architecture

This is a [Next.js](https://nextjs.org/) web application:

- **Frontend**: Next.js with TypeScript
- **Database**: PostgreSQL with pgvector for embeddings
- **Data Models**: Prisma ORM for type-safe database access
- **Tasks**: This Next.js app calls the backend task server, for media processing and AI features. 

## Development Setup

Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
Then edit the file to include your specific configuration values.

### Docker Setup (Recommended)

The easiest way to get started is using our Docker setup:

Start the application with the local database:
   ```bash
   ./run.sh
   ```

This will automatically:
- Start the dockerized PostgreSQL database
- Apply database migrations
- Seed the database with sample data
- Run the application in development mode

For more advanced Docker configuration options, see [Docker Usage Guide](./docs/docker-usage.md).

### Manual Setup

If you prefer to run without Docker:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your database connection:
   - For local development, you can use the dockerized PostgreSQL database:
     ```bash
     docker compose up db -d
     ```
   - Alternatively, you can connect to any PostgreSQL database (local or remote) by setting the `DATABASE_URL` environment variable in your `.env` file:
     ```
     DATABASE_URL="postgresql://user:password@host:port/database"
     ```
     The database must have the `pgvector` and `postgis` extensions installed.

3. Set up the database:
   ```bash
   # Run migrations
   npx prisma migrate deploy
   
   # Generate Prisma client
   npx prisma generate
   
   # Optionally, seed the database with sample data
   npx prisma db seed
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Database Management

The database is automatically seeded with sample data during setup. The seed data provides a realistic development environment while excluding sensitive information.

During seeding, if a local `prisma/seed_data.json` file doesn't exist, it will be automatically downloaded from the project's GitHub repository.

For detailed information about database seeding, including how to generate custom seed data, see [Database Seeding Guide](./docs/database-seeding.md).
