import { getLandingPageData } from '../db/landing';
import prisma from '../db/prisma';
import * as auth from '../auth';

// Mock the prisma client
jest.mock('../db/prisma', () => ({
    city: {
        findMany: jest.fn()
    }
}));

// Mock the auth module
jest.mock('../auth', () => ({
    getCurrentUser: jest.fn()
}));

// Mock the statistics module
jest.mock('../statistics', () => ({
    getStatisticsFor: jest.fn().mockResolvedValue({})
}));

// Mock the utils module for sortSubjectsByImportance
jest.mock('../utils', () => ({
    sortSubjectsByImportance: jest.fn(subjects => subjects)
}));

// Mock fetch for Substack posts
global.fetch = jest.fn(() =>
    Promise.resolve({
        text: () => Promise.resolve('<item><title><![CDATA[Test Post]]></title><link>https://test.com</link><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>')
    })
) as jest.Mock;

describe('getLandingPageData', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementation for prisma
        (prisma.city.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'city1',
                name: 'Public City',
                isListed: true,
                isPending: false,
                _count: { persons: 10, parties: 5, councilMeetings: 20 },
                councilMeetings: [{
                    id: 'meeting1',
                    name: 'Meeting 1',
                    dateTime: new Date(),
                    subjects: []
                }],
                parties: [],
                persons: []
            }
        ]);
    });

    it('should return only public cities when includeUnlisted is false', async () => {
        const result = await getLandingPageData({ includeUnlisted: false });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    isListed: true,
                    isPending: false
                })
            })
        );

        expect(result.cities).toHaveLength(1);
        expect(result.cities[0].name).toBe('Public City');
        expect(auth.getCurrentUser).not.toHaveBeenCalled();
    });

    it('should throw error when includeUnlisted is true but user is not authenticated', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue(null);

        await expect(getLandingPageData({ includeUnlisted: true }))
            .rejects.toThrow('Not authorized to view unlisted cities');

        expect(prisma.city.findMany).not.toHaveBeenCalled();
    });

    it('should return all cities for superadmin users', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: true,
            administers: []
        });

        await getLandingPageData({ includeUnlisted: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    isPending: false
                    // No isListed filter for superadmins
                })
            })
        );
    });

    it('should return public cities and administerable non-public cities for regular users', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: false,
            administers: [
                { cityId: 'city2', partyId: null, personId: null },
                { cityId: 'city3', partyId: null, personId: null }
            ]
        });

        await getLandingPageData({ includeUnlisted: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    isPending: false,
                    OR: [
                        { isListed: true },
                        {
                            isListed: false,
                            id: { in: ['city2', 'city3'] }
                        }
                    ]
                })
            })
        );
    });

    it('should handle users with no administerable cities', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: false,
            administers: [] // No cities to administer
        });

        await getLandingPageData({ includeUnlisted: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    isPending: false,
                    OR: [
                        { isListed: true },
                        {
                            isListed: false,
                            id: { in: [] } // Empty array of administerable cities
                        }
                    ]
                })
            })
        );
    });

    it('should handle users with party and person administration but no city administration', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: false,
            administers: [
                { cityId: null, partyId: 'party1', personId: null },
                { cityId: null, partyId: null, personId: 'person1' }
            ]
        });

        await getLandingPageData({ includeUnlisted: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    isPending: false,
                    OR: [
                        { isListed: true },
                        {
                            isListed: false,
                            id: { in: [] } // No cities to administer directly
                        }
                    ]
                })
            })
        );
    });

    it('should process city data correctly', async () => {
        const mockCity = {
            id: 'city1',
            name: 'Test City',
            isListed: true,
            isPending: false,
            _count: { persons: 10, parties: 5, councilMeetings: 20 },
            councilMeetings: [{
                id: 'meeting1',
                name: 'Meeting 1',
                dateTime: new Date(),
                subjects: [
                    { id: 'subject1', name: 'Subject 1', hot: true, speakerSegments: [] }
                ]
            }],
            parties: [{ id: 'party1', name: 'Party 1' }],
            persons: [{ id: 'person1', name: 'Person 1', roles: [] }]
        };

        (prisma.city.findMany as jest.Mock).mockResolvedValue([mockCity]);

        const result = await getLandingPageData();

        expect(result.cities).toHaveLength(1);
        expect(result.cities[0].personCount).toBe(10);
        expect(result.cities[0].partyCount).toBe(5);
        expect(result.cities[0].meetingCount).toBe(20);
        expect(result.cities[0].mostRecentMeeting).toBeDefined();
        expect(result.cities[0].recentSubjects).toBeDefined();
    });

    it('should handle cities with no council meetings', async () => {
        const mockCity = {
            id: 'city1',
            name: 'Test City',
            isListed: true,
            isPending: false,
            _count: { persons: 10, parties: 5, councilMeetings: 0 },
            councilMeetings: [], // No meetings
            parties: [],
            persons: []
        };

        (prisma.city.findMany as jest.Mock).mockResolvedValue([mockCity]);

        const result = await getLandingPageData();

        expect(result.cities).toHaveLength(1);
        expect(result.cities[0].personCount).toBe(10);
        expect(result.cities[0].partyCount).toBe(5);
        expect(result.cities[0].meetingCount).toBe(0);
        expect(result.cities[0].mostRecentMeeting).toBeUndefined();
        expect(result.cities[0].recentSubjects).toEqual([]);
    });

    it('should fetch and parse Substack post correctly', async () => {
        const result = await getLandingPageData();

        expect(result.latestPost).toBeDefined();
        expect(result.latestPost?.title).toBe('Test Post');
        expect(result.latestPost?.url).toBe('https://test.com');
        expect(result.latestPost?.publishDate).toBeInstanceOf(Date);
    });

    it('should handle errors when fetching Substack post', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        const result = await getLandingPageData();

        expect(result.latestPost).toBeUndefined();
    });

    it('should handle malformed Substack feed response', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            text: () => Promise.resolve('<invalid>xml</invalid>')
        });

        const result = await getLandingPageData();

        expect(result.latestPost).toBeUndefined();
    });

    it('should handle performance measurement', async () => {
        // Mock performance.now
        const originalPerformanceNow = performance.now;
        const mockPerformanceNow = jest.fn()
            .mockReturnValueOnce(0)      // First call at start
            .mockReturnValueOnce(1000);  // Second call at end

        performance.now = mockPerformanceNow;

        try {
            // Spy on console.log
            const consoleSpy = jest.spyOn(console, 'log');

            await getLandingPageData();

            expect(mockPerformanceNow).toHaveBeenCalledTimes(2);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Landing page data fetched in 1000ms'));
        } finally {
            // Restore original performance.now
            performance.now = originalPerformanceNow;
        }
    });
}); 