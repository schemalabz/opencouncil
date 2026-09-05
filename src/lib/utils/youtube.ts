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
 * How a stored YouTube channel URL identifies its channel.
 * - `id`:     /channel/UC… — the canonical channel id, usable directly with the Data API
 * - `handle`: /@handle      — needs resolution via channels?forHandle
 * - `user`:   /user/name    — legacy username, needs resolution via channels?forUsername
 * - `custom`: /c/name       — vanity URL, only resolvable via search
 */
export type ChannelRef =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'user'; value: string }
  | { kind: 'custom'; value: string }

/**
 * Parses a YouTube channel URL into a typed reference the Data API can resolve.
 * Accepts bare handles ("@city" or "city") too. Returns null when nothing usable
 * can be extracted.
 */
export function parseChannelRef(channelUrl: string): ChannelRef | null {
  if (!channelUrl) return null
  const trimmed = channelUrl.trim()

  // Bare handle, with or without the leading @ (no scheme/host).
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) {
    const handle = trimmed.replace(/^@/, '')
    return handle ? { kind: 'handle', value: handle } : null
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  // Only trust channel references from real YouTube hosts. The admin field accepts any
  // valid URL, so without this a value like https://example.com/@otherchannel would be
  // resolved through the YouTube API and could point the cron at an unintended channel.
  const host = url.hostname.toLowerCase()
  const isYouTubeHost =
    host === 'youtube.com' || host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')
  if (!isYouTubeHost) return null

  const pathname = url.pathname

  // /@handle
  const handleMatch = pathname.match(/^\/@([^/]+)/)
  if (handleMatch) return { kind: 'handle', value: decodeURIComponent(handleMatch[1]) }

  // /channel/UC…
  const idMatch = pathname.match(/^\/channel\/([^/]+)/)
  if (idMatch) return { kind: 'id', value: idMatch[1] }

  // /user/name (legacy)
  const userMatch = pathname.match(/^\/user\/([^/]+)/)
  if (userMatch) return { kind: 'user', value: decodeURIComponent(userMatch[1]) }

  // /c/name (vanity)
  const customMatch = pathname.match(/^\/c\/([^/]+)/)
  if (customMatch) return { kind: 'custom', value: decodeURIComponent(customMatch[1]) }

  return null
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
 * True when `url` is a YouTube URL whose video id is exactly `videoId`.
 * Used to confirm a database candidate: a SQL substring match can also hit an
 * id that sits inside a playlist parameter or at the start of a longer path
 * segment, so the stored URL has to be parsed before it counts as the match.
 */
export function urlHasYouTubeVideoId(url: string | null | undefined, videoId: string): boolean {
  if (!url) return false
  return extractYouTubeVideoId(url) === videoId
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
