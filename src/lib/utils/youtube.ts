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

