jest.mock('server-only', () => ({}));
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('../../s3', () => ({ presignedGetUrl: jest.fn() }));
jest.mock('../tasks', () => ({ startTask: jest.fn() }));
jest.mock('../../db/meetings', () => ({ getCouncilMeetingDirect: jest.fn() }));
jest.mock('../../db/people', () => ({ getPeopleForCity: jest.fn(), getPeopleForMeeting: jest.fn() }));
jest.mock('../../db/cities', () => ({ getCity: jest.fn() }));
jest.mock('../../db/utils', () => ({ getFixTranscriptRequestBody: jest.fn() }));
jest.mock('../../db/meetingFactSources', () => ({}));
jest.mock('../../derivation/rederive', () => ({ rederiveMeetingQuietly: jest.fn() }));

import { sheetKeyOfRequest } from '../meetingFacts';

describe('sheetKeyOfRequest', () => {
    it('reads the object key from the signed URL, decoded, without the bucket host', () => {
        const body = JSON.stringify({ fileUrl: 'https://bucket.fra1.digitaloceanspaces.com/attendance-sheets/c1/m1/%CF%86%CF%8D%CE%BB%CE%BB%CE%BF.webp?X-Amz-Signature=abc', mediaType: 'image/webp' });
        expect(sheetKeyOfRequest(body, 'bucket')).toBe('attendance-sheets/c1/m1/φύλλο.webp');
    });
    it('drops the bucket from a path-style URL', () => {
        const body = JSON.stringify({ fileUrl: 'http://localhost:9000/opencouncil-dev/attendance-sheets/c1/m1/x.webp?X-Amz-Signature=abc' });
        expect(sheetKeyOfRequest(body, 'opencouncil-dev')).toBe('attendance-sheets/c1/m1/x.webp');
    });
    it('is null for a body with no URL, or one that is not JSON', () => {
        expect(sheetKeyOfRequest(JSON.stringify({ mediaType: 'image/webp' }), 'bucket')).toBeNull();
        expect(sheetKeyOfRequest('not json', 'bucket')).toBeNull();
    });
});
