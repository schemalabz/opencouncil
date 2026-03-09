import { isValidYouTubeUrl, YOUTUBE_URL_REGEX } from '../youtube';

describe('YOUTUBE_URL_REGEX', () => {
  it('is a RegExp', () => {
    expect(YOUTUBE_URL_REGEX).toBeInstanceOf(RegExp);
  });
});

describe('isValidYouTubeUrl', () => {
  describe('valid youtube.com/watch URLs', () => {
    it.each([
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['http://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120'],
      ['https://www.youtube.com/watch?v=abc123&list=PLtest'],
    ])('accepts %s', (url) => {
      expect(isValidYouTubeUrl(url)).toBe(true);
    });
  });

  describe('valid youtube.com/live URLs', () => {
    it.each([
      ['https://www.youtube.com/live/dQw4w9WgXcQ'],
      ['https://youtube.com/live/abc123'],
      ['https://m.youtube.com/live/xyz789'],
    ])('accepts %s', (url) => {
      expect(isValidYouTubeUrl(url)).toBe(true);
    });
  });

  describe('valid youtube.com/shorts URLs', () => {
    it.each([
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
      ['https://youtube.com/shorts/abc123'],
      ['https://m.youtube.com/shorts/xyz789'],
    ])('accepts %s', (url) => {
      expect(isValidYouTubeUrl(url)).toBe(true);
    });
  });

  describe('valid youtu.be short URLs', () => {
    it.each([
      ['https://youtu.be/dQw4w9WgXcQ'],
      ['http://youtu.be/dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?t=30'],
    ])('accepts %s', (url) => {
      expect(isValidYouTubeUrl(url)).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it.each([
      ['https://vimeo.com/123456789'],
      ['https://dailymotion.com/video/x7tgad0'],
      ['https://www.google.com'],
      ['https://youtube.com/channel/UCtest'],
      ['https://youtube.com/playlist?list=PLtest'],
      ['not a url at all'],
      [''],
      ['https://notyoutube.com/watch?v=abc'],
      ['ftp://youtube.com/watch?v=abc'],
    ])('rejects %s', (url) => {
      expect(isValidYouTubeUrl(url)).toBe(false);
    });
  });

  describe('captures video ID', () => {
    it('captures ID from watch URL', () => {
      const match = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'.match(YOUTUBE_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('dQw4w9WgXcQ');
    });

    it('captures ID from short URL', () => {
      const match = 'https://youtu.be/dQw4w9WgXcQ'.match(YOUTUBE_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('dQw4w9WgXcQ');
    });

    it('captures ID from live URL', () => {
      const match = 'https://www.youtube.com/live/abc123xyz'.match(YOUTUBE_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('abc123xyz');
    });

    it('captures ID from shorts URL', () => {
      const match = 'https://www.youtube.com/shorts/ShortId99'.match(YOUTUBE_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('ShortId99');
    });
  });
});
