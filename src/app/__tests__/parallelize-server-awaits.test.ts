import type { ReactNode } from 'react';

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
    getCityPetitionBucketCached: jest.fn(),
    getPartiesForCityCached: jest.fn(),
    getPeopleForCityCached: jest.fn(),
    getAdministrativeBodiesForCityCached: jest.fn(),
    getAdministrativeBodiesWithPublicMeetingsCached: jest.fn(),
    getCityCached: jest.fn(),
    getCityMessageCached: jest.fn(),
    getCouncilMeetingsPreviewPublicCached: jest.fn(),
    getSubjectCountForCityCached: jest.fn(),
    getAdjacentMeetingsCached: jest.fn(async () => ({ previous: null, next: null })),
    getAllCityIdsCached: jest.fn(async () => ['athens']),
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

// A client component the layout mounts in the header; it pulls next-intl's
// ESM entry, which jest does not transform, and the suite never renders it.
jest.mock('@/components/meetings/stage/MeetingHeaderStage', () => ({
    MeetingHeaderStage: () => null,
}));

// Reads headers(), which needs a request scope jest has no way to open.
jest.mock('@/lib/realm.server', () => ({
    getRealm: jest.fn(async () => 'greece'),
}));

// Mock heavy React component trees — we only care about the data-fetch ordering.
jest.mock('@/components/cities/CityParties', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/cities/CityIdentityBand', () => ({ CityIdentityBand: () => null }));
jest.mock('@/components/cities/CityRail', () => ({ CityRail: () => null }));
jest.mock('@/components/cities/overview/HotTopicsCard', () => ({ HotTopicsCard: () => null }));
jest.mock('@/components/cities/overview/CouncilBand', () => ({ CouncilBand: () => null }));
jest.mock('@/components/meetings/MeetingCardV2', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/cities/overview/MeetingsTimeline', () => ({ MeetingsTimeline: () => null }));
jest.mock('@/lib/hotSubjectCards', () => ({ getHotSubjectCardsCached: jest.fn() }));
// next-intl ships ESM that jest's CJS sandbox can't parse; the overview page
// reaches it only for <Link>.
jest.mock('@/i18n/routing', () => ({ Link: () => null }));
jest.mock('@/components/cities/CityNavigation', () => ({ CityNavigation: () => null }));
jest.mock('@/components/cities/CityPeople', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/CouncilMeetingWrapper', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/meetings/sidebar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/bar/PlaybackBar', () => ({ __esModule: true, PlaybackBar: () => null, BarModeProvider: ({ children }: { children: ReactNode }) => children, useBarMode: () => ({ mode: 'speakers', setMode: () => {} }) }));
jest.mock('@/components/layout/Header', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/EditButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/PresentationViewButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/ShareDropdown', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/NavigationEvents', () => ({ NavigationEvents: () => null }));
jest.mock('@/components/meetings/HighlightModeBar', () => ({ HighlightModeBar: () => null }));
jest.mock('@/components/meetings/CreateHighlightButton', () => ({ CreateHighlightButton: () => null }));
jest.mock('@/components/meetings/HighlightContext', () => ({ HighlightProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/meetings/EditingModeBar', () => ({ EditingModeBar: () => null }));
jest.mock('@/contexts/ShareContext', () => ({ ShareProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/contexts/SubjectHeaderContext', () => ({ SubjectHeaderProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/contexts/NotificationPreferenceContext', () => ({ NotificationPreferenceProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/ui/sidebar', () => ({ SidebarProvider: ({ children }: { children: ReactNode }) => children }));
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

        const peopleD = deferred<unknown[]>();
        const partiesD = deferred<unknown[]>();
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

        const userD = deferred<unknown>();
        const authD = deferred<boolean>();
        const dataD = deferred<unknown>();

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

        const userD = deferred<unknown>();
        const authD = deferred<boolean>();
        const dataD = deferred<unknown>();
        const notifD = deferred<unknown>();

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

        const cityD = deferred<unknown>();
        const messageD = deferred<unknown>();
        const userD = deferred<unknown>();
        const canEditD = deferred<boolean>();
        const upcomingD = deferred<unknown[]>();
        const pastD = deferred<unknown[]>();
        const councilUpcomingD = deferred<unknown[]>();
        const councilPastD = deferred<unknown[]>();
        const subjectCountD = deferred<number>();
        const petitionD = deferred<null>();

        cache.getCityCached.mockReturnValue(cityD.promise);
        cache.getCityMessageCached.mockReturnValue(messageD.promise);
        auth.getCurrentUser.mockReturnValue(userD.promise);
        auth.isUserAuthorizedToEdit.mockReturnValue(canEditD.promise);
        cache.getCouncilMeetingsPreviewPublicCached
            .mockReturnValueOnce(upcomingD.promise)
            .mockReturnValueOnce(pastD.promise)
            .mockReturnValueOnce(councilUpcomingD.promise)
            .mockReturnValueOnce(councilPastD.promise);
        cache.getSubjectCountForCityCached.mockReturnValue(subjectCountD.promise);
        cache.getCityPetitionBucketCached.mockReturnValue(petitionD.promise);

        const { default: TabsLayout } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/layout');

        const pending = TabsLayout({ children: null, params: { locale: 'el', cityId: 'athens' } });

        await flushMicrotasks();

        expect(cache.getCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getCityMessageCached).toHaveBeenCalledTimes(1);
        // The roster answers nothing the city's own counts don't.
        expect(cache.getPartiesForCityCached).not.toHaveBeenCalled();
        expect(cache.getPeopleForCityCached).not.toHaveBeenCalled();
        expect(auth.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(auth.isUserAuthorizedToEdit).toHaveBeenCalledTimes(1);
        // Both scopes of both bookends: the band's scope switch must not refetch.
        expect(cache.getCouncilMeetingsPreviewPublicCached).toHaveBeenCalledTimes(4);
        expect(cache.getCouncilMeetingsPreviewPublicCached).toHaveBeenCalledWith('athens', {
            timeFilter: 'past', limit: 1, administrativeBodyTypes: ['council'],
        });
        expect(cache.getSubjectCountForCityCached).toHaveBeenCalledTimes(1);
        // The petition bucket needs the city's status (a supported city has no
        // petition card), so like the notification preference it waits.
        expect(cache.getCityPetitionBucketCached).not.toHaveBeenCalled();
        // The notification preference needs the user id, so it cannot fire yet.
        expect(notifications.getNotificationPreferenceForCity).not.toHaveBeenCalled();

        cityD.resolve({ id: 'athens', status: 'listed', timezone: 'Europe/Athens', _count: { councilMeetings: 1, persons: 1, parties: 1 } });
        await flushMicrotasks();
        expect(cache.getCityPetitionBucketCached).toHaveBeenCalledTimes(1);

        // Resolve the user on its own; the preference chains off currentUserPromise
        // rather than off the whole batch, so it must fire now even though
        // message/canEdit/the meeting lists/subjectCount/petition are all still pending.
        userD.resolve({ id: 'user-42' });
        await flushMicrotasks();

        expect(notifications.getNotificationPreferenceForCity).toHaveBeenCalledTimes(1);
        expect(notifications.getNotificationPreferenceForCity).toHaveBeenCalledWith('user-42', 'athens');

        messageD.resolve(null);
        canEditD.resolve(false);
        upcomingD.resolve([]);
        pastD.resolve([]);
        councilUpcomingD.resolve([]);
        councilPastD.resolve([]);
        subjectCountD.resolve(0);
        petitionD.resolve(null);

        await pending;
    });

    it('city overview page.tsx batches hot subjects with the city and its recent meetings', async () => {
        const cache = require('@/lib/cache');
        const hotCards = require('@/lib/hotSubjectCards');
        const intl = require('next-intl/server');

        const cityD = deferred<unknown>();
        const hotD = deferred<unknown[]>();
        const meetingsD = deferred<unknown[]>();
        const partiesD = deferred<unknown[]>();
        const peopleD = deferred<unknown[]>();
        const bodiesD = deferred<unknown[]>();

        cache.getCityCached.mockReturnValue(cityD.promise);
        hotCards.getHotSubjectCardsCached.mockReturnValue(hotD.promise);
        cache.getCouncilMeetingsPreviewPublicCached.mockReturnValue(meetingsD.promise);
        cache.getPartiesForCityCached.mockReturnValue(partiesD.promise);
        cache.getPeopleForCityCached.mockReturnValue(peopleD.promise);
        cache.getAdministrativeBodiesWithPublicMeetingsCached.mockReturnValue(bodiesD.promise);

        const { default: OverviewPage } = require('@/app/[locale]/(city)/[cityId]/(other)/(tabs)/page');

        const pending = OverviewPage({ params: { cityId: 'athens', locale: 'el' }, searchParams: {} });

        await flushMicrotasks();

        // The city deliberately comes first: its realm decides what the meetings
        // section fetches (the Greek timeline scopes to δήμος-wide bodies and is
        // the only realm with an upcoming module). Everything else still batches.
        expect(cache.getCityCached).toHaveBeenCalledTimes(1);
        expect(hotCards.getHotSubjectCardsCached).not.toHaveBeenCalled();

        cityD.resolve({ id: 'athens', timezone: 'Europe/Athens', realm: 'greece' });
        await flushMicrotasks();

        expect(hotCards.getHotSubjectCardsCached).toHaveBeenCalledTimes(1);
        // Once for the recent meetings, once for the scheduled ones the Greek
        // realm's timeline shows — both scoped to the bodies the timeline draws.
        expect(cache.getCouncilMeetingsPreviewPublicCached).toHaveBeenCalledTimes(2);
        for (const call of cache.getCouncilMeetingsPreviewPublicCached.mock.calls) {
            expect(call[1]?.administrativeBodyTypes).toEqual(['council', 'committee']);
        }
        const timeFilters = cache.getCouncilMeetingsPreviewPublicCached.mock.calls.map(
            (call: [string, { timeFilter?: string }]) => call[1]?.timeFilter,
        );
        expect(timeFilters.sort()).toEqual(['past', 'upcoming']);
        // The council band's roster and the ranking's scope options batch with the
        // rest, not after it.
        expect(cache.getPartiesForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getPeopleForCityCached).toHaveBeenCalledTimes(1);
        expect(cache.getAdministrativeBodiesWithPublicMeetingsCached).toHaveBeenCalledTimes(1);
        expect(intl.getTranslations).toHaveBeenCalled();

        hotD.resolve([]);
        meetingsD.resolve([]);
        partiesD.resolve([]);
        peopleD.resolve([]);
        bodiesD.resolve([]);

        await pending;
    });

    it('people/page.tsx folds isUserAuthorizedToEdit into the Promise.all batch', async () => {
        const cache = require('@/lib/cache');
        const auth = require('@/lib/auth');

        const partiesD = deferred<unknown[]>();
        const adminD = deferred<unknown[]>();
        const peopleD = deferred<unknown[]>();
        const cityD = deferred<unknown>();
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
