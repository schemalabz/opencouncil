/** @jest-environment node */

const mockResolve = jest.fn();
const mockReportLookupFailure = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/subjectImages', () => ({
    resolveSubjectImage: (...args: unknown[]) => mockResolve(...args),
    reportLookupFailure: (...args: unknown[]) => mockReportLookupFailure(...args),
}));
jest.mock('@/env.mjs', () => ({ env: { CDN_URL: 'https://cdn.example' } }));
const mockGetImageData = jest.fn();
jest.mock('@/lib/og/remoteImage', () => ({ getImageData: (...args: unknown[]) => mockGetImageData(...args) }));

import { getSubjectIllustrationData, ILLUSTRATION_BOX } from '@/lib/og/illustration';

describe('getSubjectIllustrationData', () => {
    // An outage of the bucket or the fallback must not break the share card.
    it('renders without the illustration, and reports the failure, when the lookup throws', async () => {
        const failure = new Error('HEAD https://cdn.example/x answered 500');
        mockResolve.mockRejectedValue(failure);
        mockGetImageData.mockResolvedValue(null);
        await expect(getSubjectIllustrationData('s1', ILLUSTRATION_BOX.hero)).resolves.toBeNull();
        expect(mockGetImageData).toHaveBeenCalledWith(undefined, ILLUSTRATION_BOX.hero, ['cdn.example']);
        expect(mockReportLookupFailure).toHaveBeenCalledWith('s1', failure);
    });
});
