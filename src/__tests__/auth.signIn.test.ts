/** @jest-environment node */
jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }) }));
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/auth.config', () => ({ __esModule: true, default: {}, authProviders: () => [] }));
jest.mock('@/lib/db/consultationComments', () => ({ pendingCommentQuote: jest.fn() }));
jest.mock('@/lib/auth/sessionMirror', () => ({ usesSecureCookies: () => false }));
import { authOptions } from '@/auth';
type SignIn = (p: { user: unknown; account: unknown; profile: unknown }) => boolean;
const signIn = authOptions.callbacks.signIn as unknown as SignIn;
it('refuses the row of a machine account, and the address alone', () => {
    const resend = { provider: 'resend' };
    expect(signIn({ user: { id: 'bot-1', email: 'paola@example.com', isMachine: true }, account: resend, profile: undefined })).toBe(false);
    expect(signIn({ user: { id: 'x', email: 'paola@machines.opencouncil.invalid' }, account: resend, profile: undefined })).toBe(false);
    expect(signIn({ user: { id: 'u1', email: 'anna@example.com' }, account: resend, profile: undefined })).toBe(true);
});
