/**
 * The host-repointing half of the invite link, which needs a production-apex
 * NEXTAUTH_URL to be observable at all — `invite.test.ts` deliberately mocks a
 * non-apex host, where the repointing has nothing to change.
 */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { verificationToken: { create: jest.fn(), deleteMany: jest.fn() } },
}));
jest.mock('@/lib/email/resend', () => ({ sendEmail: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@react-email/render', () => ({ render: jest.fn().mockResolvedValue('<html/>') }));
jest.mock('@/lib/email/templates/user-invite', () => ({ UserInviteEmail: jest.fn(() => null) }));

import { generateSignInLink } from '../auth/invite';

const reqFrom = (host: string) =>
    new Request('https://opencouncil.gr/api/admin/users', { headers: { 'x-forwarded-host': host } });

describe('generateSignInLink', () => {
    it("repoints the link at the realm domain the admin is inviting from", async () => {
        const { signInUrl } = await generateSignInLink('a@b.c', reqFrom('opencouncil.cy'));
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.cy');
    });

    it('refuses a host that is not one of ours', async () => {
        const { signInUrl } = await generateSignInLink('a@b.c', reqFrom('evil.example.com'));
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.gr');
    });

    it('keeps the configured host without a request', async () => {
        const { signInUrl } = await generateSignInLink('a@b.c');
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.gr');
    });

    it('carries the token and email through the repointing', async () => {
        const { signInUrl, verificationTokenKey } = await generateSignInLink('a@b.c', reqFrom('opencouncil.fr'));
        const url = new URL(signInUrl);
        expect(url.searchParams.get('token')).toBe(verificationTokenKey.token);
        expect(url.searchParams.get('email')).toBe('a@b.c');
    });
});
