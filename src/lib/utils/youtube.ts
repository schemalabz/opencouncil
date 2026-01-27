/**
 * YouTube URL validation regex
 * Matches: youtube.com/watch, youtube.com/live, youtube.com/shorts, youtu.be/
 */
export const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([^#&?]*).*/

/**
 * Validates if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url)
}

