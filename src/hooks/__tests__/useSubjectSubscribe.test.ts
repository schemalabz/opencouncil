import { renderHook, act } from '@testing-library/react';
import { useSubjectSubscribe } from '../useSubjectSubscribe';

// Mock next-auth/react
const mockSession = { user: { email: 'test@example.com' } };
jest.mock('next-auth/react', () => ({
    useSession: jest.fn(() => ({ data: mockSession, status: 'authenticated' })),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

// Mock server actions
jest.mock('@/lib/db/notifications', () => ({
    getUserPreferences: jest.fn(),
    saveNotificationPreferences: jest.fn(),
}));

jest.mock('@/lib/db/location', () => ({
    createLocation: jest.fn(),
}));

import { useSession } from 'next-auth/react';
import { getUserPreferences, saveNotificationPreferences } from '@/lib/db/notifications';

const mockGetUserPreferences = getUserPreferences as jest.MockedFunction<typeof getUserPreferences>;
const mockSaveNotificationPreferences = saveNotificationPreferences as jest.MockedFunction<typeof saveNotificationPreferences>;
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

const mockTopic = {
    id: 'topic-1',
    name: 'Environment',
    name_en: 'Environment',
    colorHex: '#00ff00',
    icon: 'Leaf',
    cityId: 'city-1',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockLocation = {
    id: 'loc-1',
    text: 'Central Square',
    type: 'point' as const,
    coordinates: { x: 22.9, y: 40.6 },
};

const cityId = 'city-1';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useSubjectSubscribe - unauthenticated state', () => {
    it('returns isAuthenticated=false and a notificationsPageUrl when not logged in', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() });

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: mockLocation, cityId })
        );

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.notificationsPageUrl).toBe(`/${cityId}/notifications`);
    });
});

describe('useSubjectSubscribe - authenticated, no existing prefs', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: mockSession as any, status: 'authenticated', update: jest.fn() });
        mockGetUserPreferences.mockResolvedValue([]);
    });

    it('is not alreadySubscribed when there are no prefs for this city', async () => {
        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: mockLocation, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.alreadySubscribed).toBe(false);
        expect(result.current.isLoading).toBe(false);
    });

    it('calls saveNotificationPreferences with topic and location ids when saving', async () => {
        mockSaveNotificationPreferences.mockResolvedValue({ success: true, data: {} as any });

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: mockLocation, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        await act(async () => {
            await result.current.save(true, true);
        });

        expect(mockSaveNotificationPreferences).toHaveBeenCalledWith({
            cityId,
            topicIds: ['topic-1'],
            locationIds: ['loc-1'],
        });
    });
});

describe('useSubjectSubscribe - merge with existing prefs', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: mockSession as any, status: 'authenticated', update: jest.fn() });
    });

    it('merges new topicIds with existing ones without replacing', async () => {
        const existingTopic = {
            id: 'topic-existing',
            name: 'Roads',
            name_en: 'Roads',
            colorHex: '#aaaaaa',
            icon: 'Road',
            cityId,
            order: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockGetUserPreferences.mockResolvedValue([
            {
                cityId,
                city: {} as any,
                isPetition: false,
                topics: [existingTopic],
                locations: [],
            }
        ]);
        mockSaveNotificationPreferences.mockResolvedValue({ success: true, data: {} as any });

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: null, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        await act(async () => {
            await result.current.save(true, false);
        });

        // Should include both the existing and the new topic
        expect(mockSaveNotificationPreferences).toHaveBeenCalledWith({
            cityId,
            topicIds: expect.arrayContaining(['topic-existing', 'topic-1']),
            locationIds: [],
        });
    });

    it('does not duplicate topics that are already in preferences', async () => {
        mockGetUserPreferences.mockResolvedValue([
            {
                cityId,
                city: {} as any,
                isPetition: false,
                topics: [mockTopic],
                locations: [],
            }
        ]);
        mockSaveNotificationPreferences.mockResolvedValue({ success: true, data: {} as any });

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: null, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        await act(async () => {
            await result.current.save(true, false);
        });

        const call = mockSaveNotificationPreferences.mock.calls[0][0];
        const topicIds = call.topicIds;
        // No duplicate
        expect(topicIds.filter((id: string) => id === 'topic-1')).toHaveLength(1);
    });

    it('removes topic when unchecked without removing other topics', async () => {
        mockGetUserPreferences.mockResolvedValue([
            {
                cityId,
                city: {} as any,
                isPetition: false,
                topics: [mockTopic, { id: 'other-topic' } as any],
                locations: [],
            }
        ]);
        mockSaveNotificationPreferences.mockResolvedValue({ success: true, data: {} as any });

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: null, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        await act(async () => {
            await result.current.save(false, false);
        });

        expect(mockSaveNotificationPreferences).toHaveBeenCalledWith({
            cityId,
            topicIds: ['other-topic'],
            locationIds: [],
        });
    });
});

describe('useSubjectSubscribe - already subscribed detection', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: mockSession as any, status: 'authenticated', update: jest.fn() });
    });

    it('detects alreadySubscribed when topic is already in preferences', async () => {
        mockGetUserPreferences.mockResolvedValue([
            {
                cityId,
                city: {} as any,
                isPetition: false,
                topics: [mockTopic],
                locations: [{ id: 'loc-1', text: 'Central Square', coordinates: [22.9, 40.6] }],
            }
        ]);

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: mockLocation, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        expect(result.current.alreadySubscribed).toBe(true);
    });

    it('not alreadySubscribed when topic matches but location does not', async () => {
        const differentLocation = { ...mockLocation, id: 'loc-other' };

        mockGetUserPreferences.mockResolvedValue([
            {
                cityId,
                city: {} as any,
                isPetition: false,
                topics: [mockTopic],
                locations: [{ id: 'loc-existing', text: 'Other Place', coordinates: [0, 0] as [number, number] }],
            }
        ]);

        const { result } = renderHook(() =>
            useSubjectSubscribe({ topic: mockTopic, location: differentLocation, cityId })
        );

        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        // Has the topic but not the location - not fully subscribed
        expect(result.current.alreadySubscribed).toBe(false);
    });
});
