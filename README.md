# OpenCouncil

Welcome to OpenCouncil - an open-source platform making local government more transparent and accessible. This project aims to digitize, transcribe, and make searchable municipal council meetings, helping citizens engage with their local government.

## About the Project

OpenCouncil is developed by [Schema Labs](https://schemalabs.gr), a non-profit organization building technology to strengthen democracy. The platform offers:

- 🎙️ **Automatic Transcription**: Word-for-word transcription of council meetings with speaker recognition
- 📝 **Smart Summaries**: AI-generated summaries of council member statements
- 🔍 **Advanced Search**: Full-text search across all council meetings
- 🎥 **Meeting Highlights**: Automatic generation of short videos highlighting key moments
- 🌐 **Open Data**: All data available through a public API
- 🤖 **AI Chat Assistant**: (Coming Soon) Ask questions about council meetings
- 🌍 **Multilingual Support**: (Coming Soon) Support for multicultural cities

## Technical Architecture

This is a [Next.js](https://nextjs.org/) web application:

- **Frontend**: Next.js with TypeScript
- **Database**: PostgreSQL with pgvector for embeddings
- **Data Models**: Prisma ORM for type-safe database access
- **Tasks**: This Next.js app calls the backend task server, for media processing and AI features. 

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start a dockerized PostgreSQL database with the pgvector and postgis extensions installed by using the docker file (alternatively, you can use your own DB):
   ```bash
   docker compose up db -d
   ```

3. Set up your environment variables by copying `.env.example` to `.env` and filling in the values:
   ```bash
   cp .env.example .env
   ```

4. Set up the database:
   ```bash
   # Run migrations
   npm run prisma:migrate

   # Optionally, seed the database with sample data
   npm run prisma:seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```
