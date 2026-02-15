import { NextRequest, NextResponse } from 'next/server'
import { IS_DEV } from '@/lib/utils'

interface ConnectedDevice {
  id: string
  userAgent: string
  deviceName: string
  browserName: string
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  currentPath: string
  connectedAt: number
  lastHeartbeat: number
}

const devices = new Map<string, ConnectedDevice>()

const STALE_THRESHOLD_MS = 30_000
const ONLINE_THRESHOLD_MS = 15_000

function parseUserAgent(ua: string): { deviceName: string; browserName: string } {
  let deviceName = 'Unknown Device'
  let browserName = 'Unknown Browser'

  // Device detection
  if (/iPhone/i.test(ua)) deviceName = 'iPhone'
  else if (/iPad/i.test(ua)) deviceName = 'iPad'
  else if (/Android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/i)
    deviceName = match ? match[1].trim() : 'Android'
  } else if (/Macintosh/i.test(ua)) deviceName = 'Mac'
  else if (/Windows/i.test(ua)) deviceName = 'Windows'
  else if (/Linux/i.test(ua)) deviceName = 'Linux'

  // Browser detection
  if (/CriOS/i.test(ua)) browserName = 'Chrome'
  else if (/FxiOS/i.test(ua)) browserName = 'Firefox'
  else if (/EdgiOS|Edg\//i.test(ua)) browserName = 'Edge'
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browserName = 'Safari'
  else if (/Chrome/i.test(ua)) browserName = 'Chrome'
  else if (/Firefox/i.test(ua)) browserName = 'Firefox'

  return { deviceName, browserName }
}

function cleanStaleDevices() {
  const now = Date.now()
  for (const [id, device] of devices) {
    if (now - device.lastHeartbeat > STALE_THRESHOLD_MS) {
      devices.delete(id)
    }
  }
}

export async function POST(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const body = await request.json()
  const { id, userAgent, screenWidth, screenHeight, viewportWidth, viewportHeight, currentPath } = body

  if (!id) {
    return NextResponse.json({ error: 'Device id is required' }, { status: 400 })
  }

  const { deviceName, browserName } = parseUserAgent(userAgent || '')

  const existing = devices.get(id)
  const now = Date.now()

  devices.set(id, {
    id,
    userAgent: userAgent || '',
    deviceName,
    browserName,
    screenWidth: screenWidth || 0,
    screenHeight: screenHeight || 0,
    viewportWidth: viewportWidth || 0,
    viewportHeight: viewportHeight || 0,
    currentPath: currentPath || '/',
    connectedAt: existing?.connectedAt ?? now,
    lastHeartbeat: now,
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  cleanStaleDevices()

  const now = Date.now()
  const list = Array.from(devices.values()).map((d) => ({
    ...d,
    isOnline: now - d.lastHeartbeat < ONLINE_THRESHOLD_MS,
  }))

  return NextResponse.json({ devices: list })
}

export async function DELETE(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    devices.delete(id)
  }

  return NextResponse.json({ ok: true })
}
