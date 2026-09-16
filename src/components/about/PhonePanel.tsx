import Image from 'next/image'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Shot } from './config'

interface PhonePanelProps {
    /** The phone screenshot; omit it to draw something else on the screen (`children`). */
    shot?: Shot
    alt?: string
    /** Panel height in px; the screen is clipped by the panel's bottom edge. */
    height?: number
    /** Space around the screen, in px. */
    inset?: number
    /** How far down the screenshot starts, as a share of the screen's width (a percentage margin). */
    offsetPct?: number
    sizes?: string
    priority?: boolean
    className?: string
    children?: ReactNode
}

/**
 * A phone screen rising out of a quiet panel and clipped by its bottom edge: the
 * one treatment every phone screenshot on the page gets, so the cards, the mobile
 * hero and the mobile services visual read as one family.
 */
export function PhonePanel({
    shot,
    alt = '',
    height = 300,
    inset = 22,
    offsetPct = 0,
    sizes = '(min-width: 1280px) 260px, (min-width: 768px) 45vw, 100vw',
    priority,
    className,
    children,
}: PhonePanelProps) {
    return (
        <div className={cn('relative overflow-hidden rounded-2xl bg-muted', className)} style={{ height }}>
            <div
                className="absolute bottom-0 overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-card shadow-[0_18px_40px_-22px_rgba(12,10,9,0.45)] transition-transform duration-500 ease-out group-hover:-translate-y-1"
                style={{ left: inset, right: inset, top: inset + 2 }}
            >
                {shot ? (
                    <Image
                        src={shot.src}
                        alt={alt}
                        width={shot.width}
                        height={shot.height}
                        sizes={sizes}
                        priority={priority}
                        className="block h-auto w-full"
                        style={offsetPct ? { marginTop: `-${offsetPct}%` } : undefined}
                    />
                ) : (
                    children
                )}
            </div>
        </div>
    )
}
