/** @jest-environment node */
jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }) }));
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/auth.config', () => ({ __esModule: true, default: {}, authProviders: () => [] }));
jest.mock('@/lib/db/consultationComments', () => ({ pendingCommentQuote: jest.fn() }));
jest.mock('@/lib/auth/sessionMirror', () => ({ usesSecureCookies: () => false }));
const mockClaim = jest.fn();
jest.mock('@/lib/auth/magicLinkLimit', () => ({ claimMagicLinkSend: (...args: unknown[]) => mockClaim(...args) }));
jest.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }));
import { authOptions } from '@/auth';
type SignIn = (p: { user: unknown; account: unknown; profile: unknown; email?: { verificationRequest?: boolean } }) => Promise<boolean | string>;
const signIn = authOptions.callbacks.signIn as unknown as SignIn;
beforeEach(() => {
    mockClaim.mockReset();
    mockClaim.mockResolvedValue({ ok: true });
});
it('refuses the row of a machine account, and the address alone', async () => {
    const resend = { provider: 'resend' };
    expect(await signIn({ user: { id: 'bot-1', email: 'paola@example.com', isMachine: true }, account: resend, profile: undefined })).toBe(false);
    expect(await signIn({ user: { id: 'x', email: 'paola@machines.opencouncil.invalid' }, account: resend, profile: undefined })).toBe(false);
    expect(await signIn({ user: { id: 'u1', email: 'anna@example.com' }, account: resend, profile: undefined })).toBe(true);
});
it('counts a magic-link request and sends the reader to the sign-in page when the limit refuses', async () => {
    const resend = { provider: 'resend' };
    const request = { user: { id: 'u1', email: 'anna@example.com' }, account: resend, profile: undefined, email: { verificationRequest: true } };
    expect(await signIn(request)).toBe(true);
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockClaim.mock.calls[0][0]).toBe('anna@example.com');
    expect((mockClaim.mock.calls[0][1] as Headers).get('x-forwarded-for')).toBe('203.0.113.9');

    mockClaim.mockResolvedValue({ ok: false, cap: { name: 'address' }, retryAfterMs: 90_000 });
    expect(await signIn(request)).toBe('/sign-in?error=RateLimited&retryAfterMs=90000');
});
it('does not count the callback of a link, nor a Google sign-in', async () => {
    await signIn({ user: { id: 'u1', email: 'anna@example.com' }, account: { provider: 'resend' }, profile: undefined });
    await signIn({ user: { id: 'u1', email: 'anna@example.com' }, account: { provider: 'google' }, profile: { email_verified: true } });
    expect(mockClaim).not.toHaveBeenCalled();
});
