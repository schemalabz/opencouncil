/** @jest-environment node */
// The cleanup script lists `voiceprints/` in the production bucket: 448+
// clips, and a page holds at most 1000 keys. A listing that stops after the
// first page leaves the rest of the clips in place and reports success.
jest.mock('@/env.mjs', () => ({
    env: { DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com', DO_SPACES_KEY: 'key', DO_SPACES_SECRET: 'secret', DO_SPACES_BUCKET: 'bucket' },
}));

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { listObjectKeys, s3Client } from '../s3';

describe('listObjectKeys', () => {
    it('follows the continuation token across every page, with the same bucket and prefix', async () => {
        const pages = [
            { Contents: [{ Key: 'voiceprints/a/p1/1.mp3' }, { Key: 'voiceprints/a/p1/2.mp3' }], IsTruncated: true, NextContinuationToken: 'tok-1' },
            { Contents: [{ Key: 'voiceprints/a/p2/3.mp3' }, {}], IsTruncated: true, NextContinuationToken: 'tok-2' },
            { Contents: undefined, IsTruncated: false },
        ];
        const send = jest.spyOn(s3Client, 'send').mockImplementation((async () => pages.shift()) as never);

        await expect(listObjectKeys('townhalls-gr', 'voiceprints/')).resolves.toEqual([
            'voiceprints/a/p1/1.mp3', 'voiceprints/a/p1/2.mp3', 'voiceprints/a/p2/3.mp3',
        ]);

        const inputs = send.mock.calls.map(([command]) => (command as ListObjectsV2Command).input);
        expect(inputs).toEqual([
            { Bucket: 'townhalls-gr', Prefix: 'voiceprints/', ContinuationToken: undefined },
            { Bucket: 'townhalls-gr', Prefix: 'voiceprints/', ContinuationToken: 'tok-1' },
            { Bucket: 'townhalls-gr', Prefix: 'voiceprints/', ContinuationToken: 'tok-2' },
        ]);
    });

    it('propagates a failed page instead of returning a partial list', async () => {
        jest.spyOn(s3Client, 'send')
            .mockImplementationOnce((async () => ({ Contents: [{ Key: 'k1' }], IsTruncated: true, NextContinuationToken: 't' })) as never)
            .mockImplementationOnce((async () => { throw new Error('AccessDenied'); }) as never);
        await expect(listObjectKeys('b', 'voiceprints/')).rejects.toThrow('AccessDenied');
    });
});
