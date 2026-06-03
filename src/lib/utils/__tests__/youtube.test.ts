import {
  isValidYouTubeUrl,
  extractYouTubeVideoId,
  extractYouTubeTimestamp,
} from '../youtube';

describe('isValidYouTubeUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=90',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'http://youtu.be/dQw4w9WgXcQ?t=120',
  ])('accepts %s', (url) => {
    expect(isValidYouTubeUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/12345',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isValidYouTubeUrl(url)).toBe(false);
  });
});

describe('extractYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=120', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts id from %s', (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it('returns null for a non-YouTube URL', () => {
    expect(extractYouTubeVideoId('https://example.com/x')).toBeNull();
  });
});

describe('extractYouTubeTimestamp', () => {
  it('parses plain seconds', () => {
    expect(extractYouTubeTimestamp('https://youtu.be/abc?t=90')).toBe(90);
  });

  it('parses seconds with trailing s', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc&t=90s')).toBe(90);
  });

  it('parses 1h2m3s notation', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc&t=1h2m3s')).toBe(3723);
  });

  it('parses 2m3s notation', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc&t=2m3s')).toBe(123);
  });

  it('supports the start parameter', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc&start=45')).toBe(45);
  });

  it('returns null when no timestamp is present', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(extractYouTubeTimestamp('not a url')).toBeNull();
  });

  it('returns null for an unparseable timestamp value', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=abc&t=garbage')).toBeNull();
  });
});
