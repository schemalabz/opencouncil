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

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
