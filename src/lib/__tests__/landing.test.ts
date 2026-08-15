import { getCities } from '../db/cities';
import prisma from '../db/prisma';
import * as auth from '../auth';

// Mock '../api/errors' to avoid loading 'next/server' (which references the Fetch API
// `Request` global) in the jest environment. Mirrors the workaround in users.test.ts.
jest.mock('../api/errors', () => {
    class ApiError extends Error {
        constructor(public readonly statusCode: number, message: string) {
            super(message);
            this.name = this.constructor.name;
        }
    }
    class UnauthorizedError extends ApiError {
        constructor(message: string = "Authentication required") {
            super(401, message);
        }
    }
    return { ApiError, UnauthorizedError };
});

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

describe('getCities', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementation for prisma
        (prisma.city.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'city1',
                name: 'Public City',
                status: 'supported',
                _count: { persons: 10, parties: 5, councilMeetings: 20 }
            }
        ]);
    });

    it('should return only public cities when no options provided', async () => {
        const result = await getCities();

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { in: ['demo', 'supported'] }
                }
            })
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Public City');
        expect(result[0].status).toBe('supported');
        expect(auth.getCurrentUser).not.toHaveBeenCalled();
    });

    it('should return only public cities when includeNonPublic is false', async () => {
        const result = await getCities({ includeNonPublic: false });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { in: ['demo', 'supported'] }
                }
            })
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Public City');
        expect(auth.getCurrentUser).not.toHaveBeenCalled();
    });

    it('should throw error when includeNonPublic is true but user is not authenticated', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue(null);

        await expect(getCities({ includeNonPublic: true }))
            .rejects.toThrow('Not authorized to view non-public cities');

        expect(prisma.city.findMany).not.toHaveBeenCalled();
    });

    it('should return all cities for superadmin users', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: true,
            administers: []
        });

        const result = await getCities({ includeNonPublic: true });

        // A superadmin asking for non-public cities gets every status.
        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: {} })
        );

        expect(result).toHaveLength(1);
    });

    it('should return public cities and administerable unlisted cities for regular users', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: false,
            administers: [
                { cityId: 'city2', partyId: null, personId: null },
                { cityId: 'city3', partyId: null, personId: null }
            ]
        });

        const result = await getCities({ includeNonPublic: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    OR: [
                        { status: { in: ['demo', 'supported'] } },
                        {
                            status: 'pending',
                            id: { in: ['city2', 'city3'] }
                        }
                    ]
                }
            })
        );

        expect(result).toHaveLength(1);
    });

    it('should handle users with no administerable cities', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: false,
            administers: [] // No cities to administer
        });

        const result = await getCities({ includeNonPublic: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    OR: [
                        { status: { in: ['demo', 'supported'] } },
                        {
                            status: 'pending',
                            id: { in: [] }
                        }
                    ]
                }
            })
        );

        expect(result).toHaveLength(1);
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

        const result = await getCities({ includeNonPublic: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    OR: [
                        { status: { in: ['demo', 'supported'] } },
                        {
                            status: 'pending',
                            id: { in: [] }
                        }
                    ]
                }
            })
        );

        expect(result).toHaveLength(1);
    });

    it('should include pending cities for a superadmin asking for non-public ones', async () => {
        (auth.getCurrentUser as jest.Mock).mockResolvedValue({
            id: 'user1',
            isSuperAdmin: true,
            administers: []
        });

        const result = await getCities({ includeNonPublic: true });

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {} // Should allow all cities (no status filter)
            })
        );

        expect(result).toHaveLength(1);
    });

    it('should exclude pending cities by default', async () => {
        const result = await getCities();

        expect(prisma.city.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { in: ['demo', 'supported'] }
                }
            })
        );

        expect(result).toHaveLength(1);
    });

    it('should return city data with proper structure', async () => {
        const mockCity = {
            id: 'city1',
            name: 'Test City',
            name_en: 'Test City EN',
            status: 'supported',
            _count: { persons: 10, parties: 5, councilMeetings: 20 }
        };

        (prisma.city.findMany as jest.Mock).mockResolvedValue([mockCity]);

        const result = await getCities();

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'city1',
            name: 'Test City',
            name_en: 'Test City EN',
            status: 'supported',
            _count: { persons: 10, parties: 5, councilMeetings: 20 }
        });
    });

    it('should handle database errors gracefully', async () => {
        (prisma.city.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

        await expect(getCities()).rejects.toThrow('Failed to fetch cities');
    });
}); 