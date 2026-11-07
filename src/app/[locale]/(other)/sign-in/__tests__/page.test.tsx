/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: () => mockAuth() }));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

const mockGetLocale = jest.fn();
jest.mock('next-intl/server', () => ({
    getLocale: () => mockGetLocale(),
}));

const mockRedirectWithLocale = jest.fn();
jest.mock('@/i18n/routing', () => ({
    redirect: (args: unknown) => {
        mockRedirectWithLocale(args);
        throw new Error('NEXT_REDIRECT');
    },
    getPathname: ({ href, locale }: { href: string; locale: string }) =>
        locale === 'en' ? (href === '/' ? '/en' : `/en${href}`) : href,
}));

jest.mock('@/components/user/sign-in', () => ({
    SignIn: () => null,
}));

jest.mock('next/headers', () => ({
    cookies: jest.fn().mockResolvedValue({ get: () => undefined }),
    headers: jest.fn().mockResolvedValue(new Headers()),
}));

import SignInPage from '../page';

describe('SignInPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetLocale.mockResolvedValue('el');
    });

    it('redirects an onboarded user with no destination to /', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: true },
        });

        await SignInPage({
            searchParams: Promise.resolve({}),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('redirects a non-onboarded user with no destination to /profile', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: false },
        });

        await SignInPage({
            searchParams: Promise.resolve({}),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/profile');
    });

    it('preserves the locale prefix for fallback redirects', async () => {
        mockGetLocale.mockResolvedValue('en');
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: true },
        });

        await SignInPage({
            searchParams: Promise.resolve({}),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/en');
    });

    it('redirects a non-onboarded user to /en/profile on English locale', async () => {
        mockGetLocale.mockResolvedValue('en');
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: false },
        });

        await SignInPage({
            searchParams: Promise.resolve({}),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/en/profile');
    });

    it('redirects to an explicit safe destination when callbackUrl is provided', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: true },
        });

        await SignInPage({
            searchParams: Promise.resolve({ callbackUrl: '/mcp' }),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/mcp');
    });

    it('rejects an unsafe protocol-relative callbackUrl and uses fallback', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: true },
        });

        await SignInPage({
            searchParams: Promise.resolve({ callbackUrl: '//evil.com' }),
        });

        expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('redirects to profile account tab on auth errorCode', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'u1', onboarded: true },
        });

        await expect(
            SignInPage({
                searchParams: Promise.resolve({ error: 'OAuthAccountNotLinked' }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT');

        expect(mockRedirectWithLocale).toHaveBeenCalledWith({
            href: '/profile?tab=account&error=OAuthAccountNotLinked',
            locale: 'el',
        });
        expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('renders the sign-in form when visitor is signed out', async () => {
        mockAuth.mockResolvedValue(null);

        const result = await SignInPage({
            searchParams: Promise.resolve({}),
        });

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });
});
