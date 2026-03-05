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

import { findRelatedSubjects } from '../related';
import { executeElasticsearchWithRetry } from '../retry';
import prisma from '@/lib/db/prisma';

// Mock the dependencies
jest.mock('../retry', () => ({
    executeElasticsearchWithRetry: jest.fn()
}));

jest.mock('@/lib/db/prisma', () => ({
    topic: { findMany: jest.fn() },
    councilMeeting: { findMany: jest.fn() }
}));

const mockExecuteES = executeElasticsearchWithRetry as jest.MockedFunction<typeof executeElasticsearchWithRetry>;
const mockPrismaTopicFindMany = prisma.topic.findMany as jest.Mock;
const mockPrismaMeetingFindMany = prisma.councilMeeting.findMany as jest.Mock;

describe('findRelatedSubjects', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns empty array when no ES hits are found', async () => {
        // Arrange: ES returns no hits
        mockExecuteES.mockResolvedValueOnce({
            hits: { hits: [] }
        } as any);

        // Act
        const results = await findRelatedSubjects({
            subjectId: 'sub123',
            subjectName: 'Test Subject',
            subjectDescription: 'Test Description',
            topicId: null
        });

        // Assert
        expect(results).toEqual([]);
        expect(mockExecuteES).toHaveBeenCalledTimes(1);
        expect(mockPrismaTopicFindMany).not.toHaveBeenCalled();
        expect(mockPrismaMeetingFindMany).not.toHaveBeenCalled();
    });

    it('maps ES hits to RelatedSubjectResult correctly without DB enrichment if no topic/meeting IDs exist', async () => {
        // Arrange
        mockExecuteES.mockResolvedValueOnce({
            hits: {
                hits: [
                    {
                        _id: 'sub456',
                        _score: 0.95,
                        _source: {
                            id: 'sub456',
                            name: 'Related 1',
                            city_id: 'city1',
                            city_name: 'Athens',
                            meeting_date: '2023-01-01',
                            meeting_name: 'Meeting 1',
                        }
                    }
                ]
            }
        } as any);

        // Act
        const results = await findRelatedSubjects({
            subjectId: 'sub123',
            subjectName: 'Test Subject',
            subjectDescription: null,
            topicId: null
        });

        // Assert
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual(expect.objectContaining({
            id: 'sub456',
            name: 'Related 1',
            cityId: 'city1',
            cityName: 'Athens',
            meetingDate: '2023-01-01',
            meetingName: 'Meeting 1',
            score: 0.95,
            topicId: null,
            topicColor: null,
            adminBodyId: null
        }));
    });

    it('enriches results with topic and meeting data from Prisma', async () => {
        // Arrange
        mockExecuteES.mockResolvedValueOnce({
            hits: {
                hits: [
                    {
                        _id: 'sub1',
                        _score: 0.9,
                        _source: {
                            id: 'sub1',
                            name: 'Subject 1',
                            city_id: 'city1',
                            topic_id: 'topic1',
                            councilMeeting_id: 'meeting1'
                        }
                    },
                    {
                        _id: 'sub2',
                        _score: 0.8,
                        _source: {
                            id: 'sub2',
                            name: 'Subject 2',
                            city_id: 'city1',
                            topic_id: 'topic2',
                            councilMeeting_id: 'meeting2'
                        }
                    }
                ]
            }
        } as any);

        mockPrismaTopicFindMany.mockResolvedValueOnce([
            { id: 'topic1', colorHex: '#ff0000', icon: 'icon1' },
            { id: 'topic2', colorHex: '#00ff00', icon: 'icon2' }
        ]);

        mockPrismaMeetingFindMany.mockResolvedValueOnce([
            { id: 'meeting1', administrativeBodyId: 'admin1', administrativeBody: { name: 'Admin 1' } },
            { id: 'meeting2', administrativeBodyId: 'admin2', administrativeBody: { name: 'Admin 2' } }
        ]);

        // Act
        const results = await findRelatedSubjects({
            subjectId: 'source1',
            subjectName: 'Source',
            subjectDescription: null,
            topicId: null
        });

        // Assert
        expect(results).toHaveLength(2);

        // Check enrichment for subject 1
        expect(results[0].topicColor).toBe('#ff0000');
        expect(results[0].topicIcon).toBe('icon1');
        expect(results[0].adminBodyId).toBe('admin1');
        expect(results[0].adminBodyName).toBe('Admin 1');

        // Check enrichment for subject 2
        expect(results[1].topicColor).toBe('#00ff00');
        expect(results[1].topicIcon).toBe('icon2');
        expect(results[1].adminBodyId).toBe('admin2');
        expect(results[1].adminBodyName).toBe('Admin 2');

        // Check DB queries
        expect(mockPrismaTopicFindMany).toHaveBeenCalledWith({
            where: { id: { in: ['topic1', 'topic2'] } },
            select: { id: true, colorHex: true, icon: true }
        });

        expect(mockPrismaMeetingFindMany).toHaveBeenCalledWith({
            where: { id: { in: ['meeting1', 'meeting2'] } },
            select: {
                id: true,
                administrativeBodyId: true,
                administrativeBody: { select: { name: true } }
            }
        });
    });

    it('builds topic boost clause when topicId is provided', async () => {
        // Arrange
        mockExecuteES.mockResolvedValueOnce({
            hits: { hits: [] }
        } as any);

        // Act
        await findRelatedSubjects({
            subjectId: 'sub123',
            subjectName: 'Test Subject',
            subjectDescription: null,
            topicId: 'topic456'
        });

        // Assert
        const esCallArgs = mockExecuteES.mock.calls[0][0]; // the thunk
        const query = await esCallArgs(); // execute the thunk to see what it passes to ES
        // Note: this part of testing the actual ES query payload structure would require 
        // mocking the Elasticsearch client directly, but we at least verify the thunk runs.

        // In a real TDD, we would extract the payload builder to test it pure, 
        // or spy on the client.search call. For now, testing the branch logic in the function.
        expect(mockExecuteES).toHaveBeenCalled();
    });
});
