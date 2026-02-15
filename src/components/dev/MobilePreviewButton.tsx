'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Copy, Check, QrCode, Wifi, WifiOff } from 'lucide-react'
import { formatDurationMs } from '@/lib/formatters/time'

interface LanInfo {
  available: boolean
  ip: string | null
  port: string
  url: string | null
  boundToLan: boolean
}

interface ConnectedDevice {
  id: string
  deviceName: string
  browserName: string
  viewportWidth: number
  viewportHeight: number
  currentPath: string
  connectedAt: number
  lastHeartbeat: number
  isOnline: boolean
}

export default function MobilePreviewButton({ barRef }: { barRef: React.RefObject<HTMLDivElement> }) {
  const [isOpen, setIsOpen] = useState(false)
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(null)
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [copied, setCopied] = useState(false)
  const [, setTick] = useState(0)
  const pathname = usePathname()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/dev/lan-info')
      .then((r) => r.json())
      .then(setLanInfo)
      .catch(() => setLanInfo(null))
  }, [isOpen])

  const fetchDevices = useCallback(() => {
    fetch('/api/dev/mobile-preview')
      .then((r) => r.json())
      .then((data) => setDevices(data.devices ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isOpen) {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }

    fetchDevices()
    pollRef.current = setInterval(fetchDevices, 3000)
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [isOpen, fetchDevices])

  const lanUrl = lanInfo?.url ? `${lanInfo.url}${pathname}` : null

  const handleCopy = () => {
    if (!lanUrl) return
    navigator.clipboard.writeText(lanUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center px-2.5 hover:bg-red-700/50 transition-colors rounded-l-md self-stretch"
          title="Mobile Preview"
        >
          <QrCode className="h-4 w-4" />
          {devices.length > 0 && (
            <span className="absolute -top-1.5 -left-1 bg-green-500 text-white text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-red-600">
              {devices.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-72 p-3"
        container={barRef.current ?? undefined}
      >
        {lanInfo === null && (
          <div className="text-xs text-muted-foreground text-center py-2">Loading...</div>
        )}

        {lanInfo && !lanInfo.available && (
          <div className="text-xs space-y-2">
            {lanInfo.ip && !lanInfo.boundToLan ? (
              <p className="text-muted-foreground">
                Not bound to LAN. Make sure you didn&apos;t start with <code className="font-mono">--no-lan</code>.
              </p>
            ) : (
              <p className="text-muted-foreground">
                No LAN interface found. Connect to Wi-Fi first.
              </p>
            )}
          </div>
        )}

        {lanInfo?.available && lanUrl && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="bg-white p-2 rounded-lg">
                <QRCodeSVG
                  value={lanUrl}
                  size={devices.length > 0 ? 100 : 160}
                  level="M"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <code className="flex-1 text-[10px] font-mono bg-muted p-1.5 rounded truncate">
                {lanUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>

            {devices.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Scan with your phone (same Wi-Fi)
              </p>
            )}

            {devices.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">Connected</div>
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="bg-muted p-1.5 rounded text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium flex items-center gap-1">
                        {device.isOnline ? (
                          <Wifi className="h-2.5 w-2.5 text-green-600" />
                        ) : (
                          <WifiOff className="h-2.5 w-2.5 text-muted-foreground" />
                        )}
                        {device.deviceName} · {device.browserName}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {device.viewportWidth}×{device.viewportHeight}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="truncate mr-2 font-mono text-[10px]">{device.currentPath}</span>
                      <span className="shrink-0 text-[10px]">
                        {formatDurationMs(Date.now() - device.connectedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
