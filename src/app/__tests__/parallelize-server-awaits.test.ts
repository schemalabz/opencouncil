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
