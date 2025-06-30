# OpenCouncil

Welcome to OpenCouncil - an open-source platform making local government more transparent and accessible. This project aims to digitize, transcribe, and make municipal council meetings searchable, helping citizens engage with their local government.

<p align="center">
  <a href="https://www.opencouncil.gr" target="_blank">
    <img src="https://img.shields.io/badge/Website-5A6978?style=for-the-badge" alt="Website">
  </a>
  <a href="https://discord.gg/VdwtVG43WB" target="_blank">
    <img src="https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
  <a href="https://github.com/orgs/schemalabz/projects/1" target="_blank">
    <img src="https://img.shields.io/badge/Project%20Board-000000?style=for-the-badge&logo=github&logoColor=white" alt="Project Board">
  </a>
  <a href="https://twitter.com/opencouncil_gr" target="_blank">
    <img src="https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white" alt="X (formerly Twitter)">
  </a>
</p>

## About the Project

OpenCouncil is developed by [Schema Labs](https://schemalabs.gr), a non-profit organization building technology to strengthen democracy.

- 🎙️ **Automatic Transcription**: Word-for-word transcription of council meetings with speaker recognition
- 🎯 **Voice Recognition**: Speaker identification using voiceprints
- 📝 **Smart Summaries**: AI-generated summaries of council member statements
- 🔍 **Advanced Search**: Full-text search across all council meetings
- 📊 **Subject Analysis**: Automatic categorization of discussion subjects
- 📢 **Notification System**: Personalized updates for citizens
- 🎥 **Meeting Highlights**: Automatic generation of short videos highlighting key moments
- 🌐 **Open Data**: All data available through a public API
- 🔐 **Role-Based Access**: Granular permissions for different user types
- 🤖 **AI Chat Assistant**: Ask questions about council meetings
- 🌍 **Multilingual Support**: (Coming Soon) Support for multicultural cities

## Technical Architecture

This is a [Next.js](https://nextjs.org/) web application:

- **Frontend**: Next.js with TypeScript
- **Database**: PostgreSQL with pgvector for embeddings
- **Data Models**: Prisma ORM for type-safe database access
- **Tasks**: This Next.js app calls the [backend task server](https://github.com/schemalabz/opencouncil-tasks), for media processing and AI features.

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ with pgvector and postgis extensions
- Docker (optional, but recommended)

## Contributing

We welcome contributions from the community! Please read our [contributing guidelines](./CONTRIBUTING.md) to get started. Our contributor workflow is designed around a human-AI co-creation partnership, and the guidelines will walk you through the process.

To get started, you'll need to set up the project on your local machine.

### Development Setup

Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
Then edit the file to include your specific configuration values.

#### Docker Setup (Recommended)

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

#### Manual Setup

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

## Database & Development Tools

The database is automatically seeded with sample data and test users during setup. The seed data provides a realistic development environment while excluding sensitive information.

During seeding, if a local `prisma/seed_data.json` file doesn't exist, it will be automatically downloaded from the project's GitHub repository.

For detailed information about database seeding and test user management, see [Database Seeding Guide](./docs/database-seeding.md).
