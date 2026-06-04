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

/**
 * Extracts the 11-character video id from a YouTube URL.
 * Returns null if the URL is not a recognised YouTube URL or has no id.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const match = YOUTUBE_URL_REGEX.exec(url)
  const videoId = match?.[1]
  return videoId ? videoId : null
}

/**
 * Parses a YouTube `t=` / `start=` timestamp value into total seconds.
 * Accepts both plain seconds (`90`, `90s`) and the `1h2m3s` notation.
 * Returns null when the value is missing or cannot be parsed.
 */
// Upper bound for a sane seek offset (24 hours). Anything larger is treated as
// out of range so a crafted value can't push the player to a nonsensical point.
const MAX_TIMESTAMP_SECONDS = 24 * 3600

function clampTimestamp(seconds: number): number | null {
  return seconds <= MAX_TIMESTAMP_SECONDS ? seconds : null
}

function parseTimestampValue(value: string | null): number | null {
  if (!value) return null

  // Plain integer seconds, e.g. "90" or "90s"
  const plainMatch = /^(\d+)s?$/.exec(value)
  if (plainMatch) {
    return clampTimestamp(parseInt(plainMatch[1], 10))
  }

  // Composite notation, e.g. "1h2m3s", "2m3s", "45s"
  const compositeMatch = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (compositeMatch && (compositeMatch[1] || compositeMatch[2] || compositeMatch[3])) {
    const hours = parseInt(compositeMatch[1] ?? '0', 10)
    const minutes = parseInt(compositeMatch[2] ?? '0', 10)
    const seconds = parseInt(compositeMatch[3] ?? '0', 10)
    return clampTimestamp(hours * 3600 + minutes * 60 + seconds)
  }

  return null
}

/**
 * Extracts the timestamp (in seconds) from a YouTube URL's `t` or `start`
 * query parameter. Returns null when no timestamp is present or parseable.
 */
export function extractYouTubeTimestamp(url: string): number | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const raw = parsed.searchParams.get('t') ?? parsed.searchParams.get('start')
  return parseTimestampValue(raw)
}
