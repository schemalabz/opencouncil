/**
 * @jest-environment node
 */
jest.mock('@/env.mjs', () => ({
    env: {
        ELASTICSEARCH_URL: 'http://localhost:9200',
        ELASTICSEARCH_API_KEY: 'test-key',
        ELASTICSEARCH_INDEX: 'subjects'
    }
}));

import { GET } from './route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { findRelatedSubjects } from '@/lib/search/related';

// Mock dependencies
jest.mock('@/lib/db/prisma', () => ({
    subject: {
        findUnique: jest.fn(),
    },
}));

jest.mock('@/lib/search/related', () => ({
    findRelatedSubjects: jest.fn(),
}));

const mockPrismaFindUnique = prisma.subject.findUnique as jest.Mock;
const mockFindRelatedSubjects = findRelatedSubjects as jest.Mock;

describe('GET /api/subjects/[subjectId]/related', () => {
    const mockRequest = {} as NextRequest;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 404 if source subject is not found', async () => {
        mockPrismaFindUnique.mockResolvedValueOnce(null);

        const response = await GET(mockRequest, { params: Promise.resolve({ subjectId: 'missing' }) });

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data).toEqual({ error: 'Subject not found' });
    });

    it('groups results into sameBody and elsewhere correctly and sorts sameBody by date DESC', async () => {
        // Arrange
        mockPrismaFindUnique.mockResolvedValueOnce({
            id: 'source1',
            name: 'Source Subject',
            description: 'Desc',
            cityId: 'cityA',
            topicId: 'topic1',
            councilMeeting: { administrativeBodyId: 'bodyX' }
        });

        const mockResults = [
            {
                id: 'res1', // elsewhere: different city
                cityId: 'cityB',
                adminBodyId: 'bodyX',
                meetingDate: '2023-01-01',
                score: 0.9
            },
            {
                id: 'res2', // sameBody
                cityId: 'cityA',
                adminBodyId: 'bodyX',
                meetingDate: '2023-05-01', // Newer
                score: 0.8
            },
            {
                id: 'res3', // elsewhere: different body
                cityId: 'cityA',
                adminBodyId: 'bodyY',
                meetingDate: '2023-06-01',
                score: 0.7
            },
            {
                id: 'res4', // sameBody
                cityId: 'cityA',
                adminBodyId: 'bodyX',
                meetingDate: '2023-02-01', // Older
                score: 0.6
            }
        ];

        mockFindRelatedSubjects.mockResolvedValueOnce(mockResults);

        // Act
        const response = await GET(mockRequest, { params: Promise.resolve({ subjectId: 'source1' }) });
        const data = await response.json();

        // Assert
        expect(response.status).toBe(200);

        // Verify grouping
        expect(data.sameBody).toHaveLength(2);
        expect(data.elsewhere).toHaveLength(2);

        // Verify sorting of sameBody (DESC by default)
        expect(data.sameBody[0].id).toBe('res2'); // May 1
        expect(data.sameBody[1].id).toBe('res4'); // Feb 1

        // Verify elsewhere maintains original score sorting (RRF)
        expect(data.elsewhere[0].id).toBe('res1'); // Score 0.9
        expect(data.elsewhere[1].id).toBe('res3'); // Score 0.7
    });

    it('handles subjects without a meeting or admin body by putting all results in elsewhere', async () => {
        // Arrange
        mockPrismaFindUnique.mockResolvedValueOnce({
            id: 'source1',
            name: 'Source Subject',
            description: null,
            cityId: 'cityA',
            topicId: null,
            councilMeeting: null // No meeting!
        });

        const mockResults = [
            { id: 'res1', cityId: 'cityA', adminBodyId: 'bodyX', score: 0.9 },
            { id: 'res2', cityId: 'cityA', adminBodyId: null, score: 0.8 }
        ];

        mockFindRelatedSubjects.mockResolvedValueOnce(mockResults);

        // Act
        const response = await GET(mockRequest, { params: Promise.resolve({ subjectId: 'source1' }) });
        const data = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(data.sameBody).toHaveLength(0);
        expect(data.elsewhere).toHaveLength(2);
        expect(data.elsewhere[0].id).toBe('res1');
        expect(data.elsewhere[1].id).toBe('res2');
    });
});
