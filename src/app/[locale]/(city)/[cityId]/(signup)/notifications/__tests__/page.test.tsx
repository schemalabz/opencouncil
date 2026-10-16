/** @jest-environment node */
const mockRedirect = jest.fn((path: string) => { throw new Error(`redirect:${path}`); });
const mockNotFound = jest.fn(() => { throw new Error('notFound'); });
const mockGetCity = jest.fn();
const mockGetBodies = jest.fn();
const mockGetSignupPreference = jest.fn();

jest.mock('next/navigation', () => ({ redirect: (path: string) => mockRedirect(path), notFound: () => mockNotFound() }));
jest.mock('next/headers', () => ({ headers: jest.fn().mockResolvedValue(new Headers()) }));
jest.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
jest.mock('@/components/notifications/signup/NotificationSignup', () => ({ NotificationSignup: () => null }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn().mockResolvedValue({ id: 'u1' }) }));
jest.mock('@/lib/auth/googleSignIn', () => ({ googleSignInAvailable: () => false }));
jest.mock('@/lib/cache', () => ({ getCityCached: (...a: unknown[]) => mockGetCity(...a), getAdministrativeBodiesWithPublicMeetingsCached: (...a: unknown[]) => mockGetBodies(...a) }));
jest.mock('@/lib/db/cities', () => ({ getCity: (...a: unknown[]) => mockGetCity(...a) }));
jest.mock('@/lib/db/signup', () => ({ getSignupPreference: (...a: unknown[]) => mockGetSignupPreference(...a) }));
jest.mock('@/lib/db/topics', () => ({ getTopics: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/utils/hreflang', () => ({ buildCanonicalAlternates: async () => ({}) }));
jest.mock('@/lib/og/locale', () => ({ buildOgImageUrl: () => '' }));
jest.mock('@/lib/og/signupMetadata', () => ({ signupOpenGraph: () => ({}) }));

import NotificationSignupPage from '../page';

const body = (id: string, type: 'youthCouncil' | 'council', notificationBehavior: 'NOTIFICATIONS_AUTO' | 'NOTIFICATIONS_DISABLED') =>
    ({ id, name: id, name_en: id, type, cityId: 'chania', notificationBehavior });
type SignupProps = { scope: string; secondaryBodies: { id: string }[] };
/** The page returns the signup element; its props are what the page decided. */
const render = async () => (await NotificationSignupPage({ params: Promise.resolve({ cityId: 'chania' }), searchParams: Promise.resolve({}) })).props as SignupProps;

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignupPreference.mockResolvedValue(null);
});

/**
 * The signup of a municipality (#829). A municipality that supports
 * notifications offers every public secondary body behind a tick. One that
 * does not still offers the secondary bodies whose updates are on, alone;
 * with none, the reader is sent to the petition, as before.
 */
describe('the signup page and the bodies it offers', () => {
    it('offers every public secondary body of a municipality that supports notifications', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', supportsNotifications: true });
        mockGetBodies.mockResolvedValue([body('council', 'council', 'NOTIFICATIONS_AUTO'), body('youth', 'youthCouncil', 'NOTIFICATIONS_DISABLED'), body('youth2', 'youthCouncil', 'NOTIFICATIONS_AUTO')]);

        const props = await render();

        expect(props.scope).toBe('city');
        expect(props.secondaryBodies.map(b => b.id)).toEqual(['youth', 'youth2']);
    });

    it('offers the secondary bodies whose updates are on, alone, in a municipality with no notifications', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', supportsNotifications: false });
        mockGetBodies.mockResolvedValue([body('council', 'council', 'NOTIFICATIONS_AUTO'), body('youth', 'youthCouncil', 'NOTIFICATIONS_DISABLED'), body('youth2', 'youthCouncil', 'NOTIFICATIONS_AUTO')]);

        const props = await render();

        expect(mockRedirect).not.toHaveBeenCalled();
        expect(props.scope).toBe('bodies');
        expect(props.secondaryBodies.map(b => b.id)).toEqual(['youth2']);
    });

    it('keeps a followed body on offer, so the reader can untick it', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', supportsNotifications: false });
        mockGetBodies.mockResolvedValue([body('youth2', 'youthCouncil', 'NOTIFICATIONS_AUTO')]);
        mockGetSignupPreference.mockResolvedValue({ locations: [], topics: [], bodies: [body('youth', 'youthCouncil', 'NOTIFICATIONS_DISABLED')], notifyByEmail: false });

        const props = await render();

        expect(props.secondaryBodies.map(b => b.id)).toEqual(['youth2', 'youth']);
    });

    it('sends the reader to the petition when the municipality sends nothing a reader can follow', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', supportsNotifications: false });
        mockGetBodies.mockResolvedValue([body('council', 'council', 'NOTIFICATIONS_AUTO'), body('youth', 'youthCouncil', 'NOTIFICATIONS_DISABLED')]);

        await expect(render()).rejects.toThrow('redirect:/chania/petition');
    });
});
