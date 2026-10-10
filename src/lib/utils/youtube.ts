/**
 * YouTube URL validation regex
 * Matches: youtube.com/watch, youtube.com/live, youtube.com/shorts, youtu.be/
 */
export const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([^#&?/]*).*/

/**
 * Validates if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url)
}

/**
 * The video id inside a YouTube watch/live/shorts/youtu.be URL, or null.
 *
 * Needed because a stored URL is whatever a human pasted — `https://youtu.be/ID`,
 * or a watch URL carrying `&t=`— while code generating one emits the canonical
 * `watchUrl()` form. Comparing ids rather than URL strings is what makes "is this
 * the same video we already tried" reliable.
 */
export function parseVideoId(url: string | null | undefined): string | null {
  if (!url) return null
  const id = url.trim().match(YOUTUBE_URL_REGEX)?.[1]
  return id ? id : null
}

/**
 * How a stored YouTube channel URL identifies its channel.
 * - `id`:     /channel/UC… — the canonical channel id, usable directly with the Data API
 * - `handle`: /@handle      — needs resolution via channels?forHandle
 * - `user`:   /user/name    — legacy username, needs resolution via channels?forUsername
 *
 * /c/ vanity URLs are not supported: the Data API can resolve them only through a
 * full-text search, which can return the wrong channel. Every such channel also
 * has a handle.
 */
export type ChannelRef =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'user'; value: string }

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

  return null
}

/** True when `id` has the shape of a YouTube video id: 11 base64url characters. */
export function isYouTubeVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id)
}

/** A YouTube video, and the second a shared link starts playing at. */
export interface YouTubeLink {
  videoId: string
  startSeconds: number | null
}

/**
 * Parses a YouTube link that a person typed or pasted after the domain, such
 * as `opencouncil.gr/<link>` (see videoLinkRewrites.mjs). It accepts the forms
 * that reach a route handler that way:
 * - `https:/…`, because the Next.js router collapses `//` in a request path
 *   with a 308 before any handler runs;
 * - no scheme (`youtu.be/…`, `www.youtube.com/watch?v=…`).
 */
export function parseYouTubeLink(raw: string): YouTubeLink | null {
  let link = raw.trim().replace(/^(https?):\/*/i, (_, scheme: string) => `${scheme.toLowerCase()}://`)
  if (!/^https?:\/\//.test(link)) link = `https://${link}`

  const videoId = parseVideoId(link)
  if (!videoId || !isYouTubeVideoId(videoId)) return null
  return { videoId, startSeconds: parseStartSeconds(link) }
}

// Upper bound for a sane seek offset (24 hours). Anything larger is treated as
// out of range so a crafted value can't push the player to a nonsensical point.
const MAX_TIMESTAMP_SECONDS = 24 * 3600

/**
 * Parses a YouTube `t=` / `start=` timestamp value into total seconds.
 * Accepts both plain seconds (`90`, `90s`) and the `1h2m3s` notation.
 * Returns null when the value is missing, cannot be parsed, or exceeds 24 hours.
 */
function parseTimestampValue(value: string | null): number | null {
  if (!value) return null

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i.exec(value)
  if (!match || !(match[1] || match[2] || match[3])) return null

  const [hours, minutes, seconds] = match.slice(1).map(part => parseInt(part ?? '0', 10))
  const total = hours * 3600 + minutes * 60 + seconds
  return total <= MAX_TIMESTAMP_SECONDS ? total : null
}

/** The start second in a YouTube URL's `t` or `start` parameter, or null. */
function parseStartSeconds(url: string): number | null {
  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return null
  }
  return parseTimestampValue(params.get('t') || params.get('start'))
}
