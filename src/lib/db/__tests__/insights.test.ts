/**
 * @jest-environment node
 */
// Mock env.mjs before importing anything else
jest.mock('@/env.mjs', () => ({
    env: {
        DATABASE_URL: 'mock-url'
    }
}));

// Mock Prisma
jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        city: { count: jest.fn() },
        councilMeeting: { count: jest.fn() },
        speakerSegment: { aggregate: jest.fn() },
        word: { count: jest.fn() },
        speakerTag: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
    }
}));

import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import {
    getGlobalKPIs,
    getTopicDistribution,
    getPartyDistribution,
    getMonthlyGrowth,
    getCityLeaderboard
} from '../insights';

describe('Insights Queries', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getGlobalKPIs', () => {
        it('returns expected shape and calculates hours transcribed', async () => {
            (prisma.city.count as jest.Mock).mockResolvedValue(10);
            (prisma.councilMeeting.count as jest.Mock).mockResolvedValue(100);
            (prisma.speakerSegment.aggregate as jest.Mock).mockResolvedValue({
                _sum: { endTimestamp: 36000, startTimestamp: 0 }
            });
            (prisma.word.count as jest.Mock).mockResolvedValue(50000);
            (prisma.speakerTag.findMany as jest.Mock).mockResolvedValue([
                { personId: 'p1' }, { personId: 'p2' }
            ]);

            const result = await getGlobalKPIs();

            expect(result).toEqual({
                cityCount: 10,
                meetingCount: 100,
                hoursTranscribed: 10, // 36000 seconds / 3600
                wordCount: 50000,
                speakerCount: 2,
            });
        });
    });

    describe('getTopicDistribution', () => {
        it('returns aggregated topic distribution and percentages', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([
                { topicId: 't1', topicName: 'Topic 1', colorHex: '#ff0000', speakingSeconds: 600 },
                { topicId: 't2', topicName: 'Topic 2', colorHex: '#00ff00', speakingSeconds: 400 },
            ]);

            const result = await getTopicDistribution();

            expect(result).toEqual([
                { topicId: 't1', topicName: 'Topic 1', colorHex: '#ff0000', speakingSeconds: 600, percentage: 60 },
                { topicId: 't2', topicName: 'Topic 2', colorHex: '#00ff00', speakingSeconds: 400, percentage: 40 },
            ]);
            expect(prisma.$queryRaw).toHaveBeenCalled();
        });

        it('filters by cityId', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
            await getTopicDistribution('city123');

            // Verifying the tagged template was called correctly is tricky with jest mocks,
            // but we can ensure it runs over SQL containing the string logic.
            const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
            expect(callArgs.some((str: string) => str.includes('AND ss."cityId" ='))).toBeTruthy();
        });
    });

    describe('getPartyDistribution', () => {
        it('returns aggregated party distribution and percentages', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([
                { partyId: 'p1', partyName: 'Party A', colorHex: '#0000ff', speakingSeconds: 700 },
                { partyId: 'p2', partyName: 'Party B', colorHex: '#ffff00', speakingSeconds: 300 },
            ]);

            const result = await getPartyDistribution();

            expect(result).toEqual([
                { partyId: 'p1', partyName: 'Party A', colorHex: '#0000ff', speakingSeconds: 700, percentage: 70 },
                { partyId: 'p2', partyName: 'Party B', colorHex: '#ffff00', speakingSeconds: 300, percentage: 30 },
            ]);
        });

        it('filters by cityId', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
            await getPartyDistribution('city123');
            const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
            expect(callArgs.some((str: string) => str.includes('AND ss."cityId" ='))).toBeTruthy();
        });
    });

    describe('getMonthlyGrowth', () => {
        it('returns chronologically sorted monthly growth', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([
                { month: '2023-01', meetingCount: BigInt(2), totalSeconds: 3600.5 },
                { month: '2023-02', meetingCount: BigInt(5), totalSeconds: 7200 },
            ]);

            const result = await getMonthlyGrowth();

            expect(result).toEqual([
                { month: '2023-01', meetingCount: 2, totalSeconds: 3600.5 },
                { month: '2023-02', meetingCount: 5, totalSeconds: 7200 },
            ]);
        });
    });

    describe('getCityLeaderboard', () => {
        it('returns city leaderboard sorted by hours', async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([
                { cityId: 'c1', cityName: 'City A', meetingCount: BigInt(10), totalSeconds: 360000 },
                { cityId: 'c2', cityName: 'City B', meetingCount: BigInt(5), totalSeconds: 180000 },
            ]);

            const result = await getCityLeaderboard();

            expect(result).toEqual([
                { cityId: 'c1', cityName: 'City A', meetingCount: 10, totalSeconds: 360000 },
                { cityId: 'c2', cityName: 'City B', meetingCount: 5, totalSeconds: 180000 },
            ]);
        });
    });
});
