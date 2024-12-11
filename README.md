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

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app). The application uses:

- **Frontend**: Next.js with TypeScript
- **Database**: PostgreSQL with pgvector for embeddings
- **Data Models**: Prisma ORM for type-safe database access
- **Media Processing**: Support for video (YouTube, Mux) and audio processing
- **AI Features**: Text embeddings and natural language processing for search and summaries

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your environment variables by copying `.env.example` to `.env` and filling in the values:
   ```bash
   cp .env.example .env
   ```

3. Set up the database:
   ```bash
   # Generate Prisma client
   npm run prisma:generate

   # Run migrations
   npm run prisma:migrate

   # Seed the database with sample data
   npm run prisma:seed
   ```

   The seeding script will create:
   - A sample city (Athens) with its council
   - Three political parties with realistic colors and names
   - Council members including a mayor and council members
   - A sample council meeting with transcribed segments
   - Topics and highlights for the meeting

4. Start the development server:
   ```bash
   npm run dev
   ```
