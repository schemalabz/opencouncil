# OpenCouncil Development Guide

## Build Commands
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Test: `npm test`
- Test single file: `npm test -- path/to/file.test.ts`
- Test watch mode: `npm run test:watch`
- Prisma commands: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:studio`

## Code Style Guidelines
- **TypeScript**: Strict mode enabled, use interfaces/types for data structures
- **Components**: Use functional components with hooks, not class components
- **Imports**: Path aliases with `@/` for src directory
- **Naming**: PascalCase for components, camelCase for functions/variables
- **State Management**: React context for shared state, local state hooks for component state
- **Error Handling**: Use try/catch blocks with proper error typing
- **Styling**: Tailwind CSS with utility-first approach, use class-variance-authority
- **Forms**: React Hook Form with Zod validation
- **Data Access**: Prisma Client for type-safe database queries
- **Testing**: Jest with React Testing Library
- **Animation**: Framer Motion for animations, follow brand motion guidelines
- **API**: Next.js API routes with proper error handling and type validation
- **Authentication**: Auth.js (NextAuth) with proper session management

Follow existing patterns in the codebase for consistency.