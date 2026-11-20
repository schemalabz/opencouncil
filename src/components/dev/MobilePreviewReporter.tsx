'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { IS_DEV } from '@/lib/utils'
import { randomUuid } from '@/lib/utils/randomUuid'

const DEVICE_ID_KEY = 'mobile-preview-device-id'

function getOrCreateDeviceId(): string {
  let id = sessionStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = randomUuid()
    sessionStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function isLanAccess(): boolean {
  const hostname = window.location.hostname
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1'
}

function getDeviceInfo(pathname: string) {
  return {
    id: getOrCreateDeviceId(),
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    currentPath: pathname,
  }
}

export default function MobilePreviewReporter() {
  const pathname = usePathname()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!IS_DEV || !isLanAccess()) return

    const sendHeartbeat = () => {
      fetch('/api/dev/mobile-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getDeviceInfo(pathname)),
      }).catch(() => {
        // Silently ignore errors
      })
    }

    // Send immediately on mount / pathname change
    sendHeartbeat()

    // Clear any existing interval before setting a new one
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(sendHeartbeat, 10_000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [pathname])

  return null
}
