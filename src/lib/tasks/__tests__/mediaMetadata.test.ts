import { parseMediaFailure, parseMediaSource, encodeMediaFailureResponse, readMediaFailureResponse, hasReplayableTaskResponse, MEDIA_FAILURE_RESPONSE_PREFIX } from '../mediaMetadata';
import fixture from '../../../../tests/fixtures/media-contract.json';

it('accepts the shared wire values and strips unknown fields', () => {
    expect(parseMediaSource({ ...fixture.source, secret: 'hidden' })).toEqual(fixture.source);
    expect(parseMediaFailure(fixture.permanentUpdate.mediaFailure)).toEqual(fixture.permanentUpdate.mediaFailure);
});
it.each([null, [], {}, { reason: 'other', retryable: true }, { reason: 'error', retryable: 'yes' }])('omits malformed failures: %j', value => {
    expect(parseMediaFailure(value)).toBeUndefined();
});
it.each([
    { kind: 'other' }, { kind: 'file', durationSeconds: -1 },
    { kind: 'yt-dlp', webpageUrl: 'javascript:alert(1)' },
    { kind: 'yt-dlp', startedAt: 'yesterday' },
    { kind: 'file', chapters: [{ title: 'Bad', startSeconds: 5, endSeconds: 1 }] },
])('rejects unknown source kinds but omits malformed optional metadata: %j', value => {
    expect(parseMediaSource(value)).toEqual(value.kind === 'other' ? undefined : { kind: value.kind });
});
it('keeps bounded chapter metadata', () => {
    const source = { kind: 'file', chapters: [{ title: 'Opening', startSeconds: 0, endSeconds: 10 }] };
    expect(parseMediaSource(source)).toEqual(source);
});

it('removes credentials and signed URL parameters but keeps public video identifiers', () => {
    const signed = 'https://user:pass@www.youtube.com/watch?v=public-id&token=secret&access_token=secret&AUTH=secret&signature=secret&sig=secret&key=secret&password=secret&credential=secret&X-Amz-Signature=secret&x-goog-credential=secret&h=secret#private';
    expect(parseMediaSource({ kind: 'yt-dlp', webpageUrl: signed, thumbnailUrl: signed })).toEqual({
        kind: 'yt-dlp', webpageUrl: 'https://www.youtube.com/watch?v=public-id', thumbnailUrl: 'https://www.youtube.com/watch?v=public-id',
    });
});

it('encodes a versioned failure envelope that is never a replayable result', () => {
    const failure = parseMediaFailure(fixture.permanentUpdate.mediaFailure)!;
    const body = encodeMediaFailureResponse(failure);
    expect(body.startsWith(MEDIA_FAILURE_RESPONSE_PREFIX)).toBe(true);
    expect(readMediaFailureResponse(body)).toEqual(failure);
    expect(hasReplayableTaskResponse(body)).toBe(false);
    expect(hasReplayableTaskResponse(null)).toBe(false);
    expect(hasReplayableTaskResponse('legacy error prose')).toBe(false);
    expect(hasReplayableTaskResponse(JSON.stringify({ source: fixture.source, transcript: {} }))).toBe(true);
    expect(readMediaFailureResponse('{bad json')).toBeUndefined();
    expect(readMediaFailureResponse(JSON.stringify({ error: 'legacy prose' }))).toBeUndefined();
});
