/**
 * Verifies independent server-side data fetches in three page/layout files
 * are kicked off concurrently rather than sequentially. Each mock returns a
 * deferred promise so we can assert all dependencies were *invoked* before any
 * of them resolve — the signature of a Promise.all / parallel pattern.
 */

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

jest.mock('next/navigation', () => ({
    notFound: jest.fn(() => {
        throw new Error('notFound called');
    }),
}));

jest.mock('next-intl/server', () => ({
    getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('@/lib/cache', () => ({
    getPartiesForCityCached: jest.fn(),
    getPeopleForCityCached: jest.fn(),
    getAdministrativeBodiesForCityCached: jest.fn(),
    getCityCached: jest.fn(),
    getCityMessageCached: jest.fn(),
    getCouncilMeetingsForCityPublicCached: jest.fn(),
    getSubjectCountForCityCached: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/getMeetingData', () => ({
    getMeetingDataCached: jest.fn(),
}));

jest.mock('@/lib/db/notifications', () => ({
    getNotificationPreferenceForCity: jest.fn(),
}));

// Mock heavy React component trees — we only care about the data-fetch ordering.
jest.mock('@/components/cities/CityParties', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/cities/CityIdentityBand', () => ({ CityIdentityBand: () => null }));
jest.mock('@/components/cities/overview/HotTopicsCard', () => ({ HotTopicsCard: () => null }));
jest.mock('@/components/meetings/MeetingCardV2', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/hotSubjectCards', () => ({ getHotSubjectCards: jest.fn() }));
// next-intl ships ESM that jest's CJS sandbox can't parse; the overview page
// reaches it only for <Link>.
jest.mock('@/i18n/routing', () => ({ Link: () => null }));
jest.mock('@/components/cities/CityNavigation', () => ({ CityNavigation: () => null }));
jest.mock('@/components/cities/CityPeople', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/CouncilMeetingWrapper', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('@/components/meetings/sidebar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/TranscriptControls', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/layout/Header', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/EditButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/PresentationViewButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/ShareDropdown', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/NavigationEvents', () => ({ NavigationEvents: () => null }));
jest.mock('@/components/meetings/HighlightModeBar', () => ({ HighlightModeBar: () => null }));
jest.mock('@/components/meetings/CreateHighlightButton', () => ({ CreateHighlightButton: () => null }));
jest.mock('@/components/meetings/HighlightContext', () => ({ HighlightProvider: ({ children }: any) => children }));
jest.mock('@/components/meetings/EditingModeBar', () => ({ EditingModeBar: () => null }));
jest.mock('@/contexts/ShareContext', () => ({ ShareProvider: ({ children }: any) => children }));
jest.mock('@/contexts/SubjectHeaderContext', () => ({ SubjectHeaderProvider: ({ children }: any) => children }));
jest.mock('@/contexts/NotificationPreferenceContext', () => ({ NotificationPreferenceProvider: ({ children }: any) => children }));
jest.mock('@/components/ui/sidebar', () => ({ SidebarProvider: ({ children }: any) => children }));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://localhost' } }));

// Tick the microtask queue a few times so any chained .then(...) handlers run
// before we assert on which mocks have been invoked.
async function flushMicrotasks(times = 5) {
    for (let i = 0; i < times; i++) {
        await Promise.resolve();
    }
}

describe('PR1: server-side awaits run concurrently', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('parties/page.tsx kicks off people + parties + auth concurrently', async () => {
        const cache = require('@/lib/cache');
        const auth = require('@/lib/auth');

        const peopleD = deferred<any[]>();
        const partiesD = deferred<any[]>();
        const authD = deferred<boolean>();

        cache.getPeopleForCityCached.mockReturnValue(peopleD.promise);
        cache.getPartiesForCityCached.mockReturnValue(partiesD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(authD.promise);

        const { default: PartiesPage } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/parties/page');

        const pending = PartiesPage({ params: { cityId: 'athens' } });

        await flushMicrotasks();

        expect(cache.getPeopleForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getPartiesForCityCached).toHaveBeenCalledTimes(1);
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);

        peopleD.resolve([]);
        partiesD.resolve([{ id: 'p1', people: [] }]);
        authD.resolve(false);

        await pending;
    });

    it('meeting layout.tsx kicks off currentUser + auth + meetingData concurrently', async () => {
        const auth = require('@/lib/auth');
        const meetingData = require('@/lib/getMeetingData');
        const notifications = require('@/lib/db/notifications');

        const userD = deferred<any>();
        const authD = deferred<boolean>();
        const dataD = deferred<any>();

        auth.getCurrentUser.mockReturnValue(userD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(authD.promise);
        meetingData.getMeetingDataCached.mockReturnValue(dataD.promise);
        notifications.getNotificationPreferenceForCity.mockResolvedValue(null);

        const mod = require('@/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/layout');
        const Layout = mod.default;

        const pending = Layout({
            params: { meetingId: 'm1', cityId: 'athens', locale: 'el' },
            children: null,
        });

        await flushMicrotasks();

        expect(auth.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        expect(meetingData.getMeetingDataCached).toHaveBeenCalledTimes(1);

        userD.resolve(null);
        authD.resolve(false);
        dataD.resolve({
            city: { id: 'athens', name: 'Athens', highlightCreationPermission: 'ADMIN' },
            meeting: { name: 'm', updatedAt: new Date(), administrativeBody: null, muxPlaybackId: null },
            transcriptHiddenForReview: false,
            transcript: [],
            speakerTags: [],
        });

        await pending;
    });

    it('meeting layout.tsx: notification preference starts in parallel with auth/data once user resolves', async () => {
        const auth = require('@/lib/auth');
        const meetingData = require('@/lib/getMeetingData');
        const notifications = require('@/lib/db/notifications');

        const userD = deferred<any>();
        const authD = deferred<boolean>();
        const dataD = deferred<any>();
        const notifD = deferred<any>();

        auth.getCurrentUser.mockReturnValue(userD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(authD.promise);
        meetingData.getMeetingDataCached.mockReturnValue(dataD.promise);
        notifications.getNotificationPreferenceForCity.mockReturnValue(notifD.promise);

        const mod = require('@/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/layout');
        const Layout = mod.default;

        const pending = Layout({
            params: { meetingId: 'm1', cityId: 'athens', locale: 'el' },
            children: null,
        });

        await flushMicrotasks();

        // Top-level awaits started, but notification cannot fire until the user resolves.
        expect(auth.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        expect(meetingData.getMeetingDataCached).toHaveBeenCalledTimes(1);
        expect(notifications.getNotificationPreferenceForCity).not.toHaveBeenCalled();

        // Resolve the user; the .then() handler should fire and kick off the notification fetch
        // while authD and dataD are still pending.
        userD.resolve({ id: 'user-42' });
        await flushMicrotasks();

        expect(notifications.getNotificationPreferenceForCity).toHaveBeenCalledTimes(1);
        expect(notifications.getNotificationPreferenceForCity).toHaveBeenCalledWith('user-42', 'athens');

        // Now resolve the remaining promises so the layout can finish.
        authD.resolve(false);
        dataD.resolve({
            city: { id: 'athens', name: 'Athens', highlightCreationPermission: 'ADMIN' },
            meeting: { name: 'm', updatedAt: new Date(), administrativeBody: null, muxPlaybackId: null },
            transcriptHiddenForReview: false,
            transcript: [],
            speakerTags: [],
        });
        notifD.resolve(null);

        await pending;
    });

    it('city (tabs)/layout.tsx batches the identity band\'s data, including both bookend meetings', async () => {
        const cache = require('@/lib/cache');
        const auth = require('@/lib/auth');
        const notifications = require('@/lib/db/notifications');

        const cityD = deferred<any>();
        const messageD = deferred<any>();
        const partiesD = deferred<any[]>();
        const peopleD = deferred<any[]>();
        const userD = deferred<any>();
        const canEditD = deferred<boolean>();
        const upcomingD = deferred<any[]>();
        const pastD = deferred<any[]>();
        const councilUpcomingD = deferred<any[]>();
        const councilPastD = deferred<any[]>();
        const subjectCountD = deferred<number>();

        cache.getCityCached.mockReturnValue(cityD.promise);
        cache.getCityMessageCached.mockReturnValue(messageD.promise);
        cache.getPartiesForCityCached.mockReturnValue(partiesD.promise);
        cache.getPeopleForCityCached.mockReturnValue(peopleD.promise);
        auth.getCurrentUser.mockReturnValue(userD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(canEditD.promise);
        cache.getCouncilMeetingsForCityPublicCached
            .mockReturnValueOnce(upcomingD.promise)
            .mockReturnValueOnce(pastD.promise)
            .mockReturnValueOnce(councilUpcomingD.promise)
            .mockReturnValueOnce(councilPastD.promise);
        cache.getSubjectCountForCityCached.mockReturnValue(subjectCountD.promise);

        const { default: TabsLayout } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/layout');

        const pending = TabsLayout({ children: null, params: { locale: 'el', cityId: 'athens' } });

        await flushMicrotasks();

        expect(cache.getCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getCityMessageCached).toHaveBeenCalledTimes(1);
        expect(cache.getPartiesForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getPeopleForCityCached).toHaveBeenCalledTimes(1);
        expect(auth.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        // Both scopes of both bookends: the band's scope switch must not refetch.
        expect(cache.getCouncilMeetingsForCityPublicCached).toHaveBeenCalledTimes(4);
        expect(cache.getCouncilMeetingsForCityPublicCached).toHaveBeenCalledWith('athens', {
            timeFilter: 'past', limit: 1, administrativeBodyTypes: ['council'],
        });
        expect(cache.getSubjectCountForCityCached).toHaveBeenCalledTimes(1);
        // The notification preference needs the user, so it must NOT be in the batch.
        expect(notifications.getNotificationPreferenceForCity).not.toHaveBeenCalled();

        cityD.resolve({ id: 'athens', timezone: 'Europe/Athens', _count: { councilMeetings: 1, persons: 1, parties: 1 } });
        messageD.resolve(null);
        partiesD.resolve([]);
        peopleD.resolve([]);
        userD.resolve(null);
        canEditD.resolve(false);
        upcomingD.resolve([]);
        pastD.resolve([]);
        councilUpcomingD.resolve([]);
        councilPastD.resolve([]);
        subjectCountD.resolve(0);

        await pending;
    });

    it('city overview page.tsx batches hot subjects with the city and its recent meetings', async () => {
        const cache = require('@/lib/cache');
        const hotCards = require('@/lib/hotSubjectCards');
        const intl = require('next-intl/server');

        const cityD = deferred<any>();
        const hotD = deferred<any[]>();
        const meetingsD = deferred<any[]>();

        cache.getCityCached.mockReturnValue(cityD.promise);
        hotCards.getHotSubjectCards.mockReturnValue(hotD.promise);
        cache.getCouncilMeetingsForCityPublicCached.mockReturnValue(meetingsD.promise);

        const { default: OverviewPage } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/page');

        const pending = OverviewPage({ params: { cityId: 'athens', locale: 'el' } });

        await flushMicrotasks();

        expect(cache.getCityCached).toHaveBeenCalledTimes(1);
        expect(hotCards.getHotSubjectCards).toHaveBeenCalledTimes(1);
        expect(cache.getCouncilMeetingsForCityPublicCached).toHaveBeenCalledTimes(1);
        expect(intl.getTranslations).toHaveBeenCalled();

        cityD.resolve({ id: 'athens', timezone: 'Europe/Athens' });
        hotD.resolve([]);
        meetingsD.resolve([]);

        await pending;
    });

    it('people/page.tsx folds isUserAuthorizedToEdit into the Promise.all batch', async () => {
        const cache = require('@/lib/cache');
        const auth = require('@/lib/auth');

        const partiesD = deferred<any[]>();
        const adminD = deferred<any[]>();
        const peopleD = deferred<any[]>();
        const cityD = deferred<any>();
        const authD = deferred<boolean>();

        cache.getPartiesForCityCached.mockReturnValue(partiesD.promise);
        cache.getAdministrativeBodiesForCityCached.mockReturnValue(adminD.promise);
        cache.getPeopleForCityCached.mockReturnValue(peopleD.promise);
        cache.getCityCached.mockReturnValue(cityD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(authD.promise);

        const { default: PeoplePage } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/people/page');

        const pending = PeoplePage({ params: { cityId: 'athens' } });

        await flushMicrotasks();

        // The crucial assertion: auth must be invoked BEFORE the Promise.all batch resolves.
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        expect(cache.getPartiesForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getAdministrativeBodiesForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getPeopleForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getCityCached).toHaveBeenCalledTimes(1);

        partiesD.resolve([{ id: 'p', people: [] }]);
        adminD.resolve([]);
        peopleD.resolve([]);
        cityD.resolve({ id: 'athens', name: 'Athens' });
        authD.resolve(false);

        await pending;
    });
});
