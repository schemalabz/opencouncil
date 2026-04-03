'use client'

import { useRef, useEffect } from 'react'

interface ShineTitleProps {
    children: React.ReactNode
    className?: string
}

/**
 * Text with a sweeping orange light wave that animates continuously.
 * Technique: `background-clip: text` with a radial gradient whose
 * position is controlled by a CSS custom property updated via rAF.
 */
export default function ShineTitle({ children, className = '' }: ShineTitleProps) {
    const ref = useRef<HTMLHeadingElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        let rafId: number

        const tick = () => {
            const t = (Date.now() % 6000) / 6000 // 0..1 over 6 seconds
            // Ease in-out with a pause at the ends
            const eased = t < 0.15 || t > 0.85
                ? (t < 0.15 ? 0 : 1)
                : (t - 0.15) / 0.7
            const x = -50 + eased * 200 // -50% to 150%
            el.style.setProperty('--shine-x', `${x}%`)
            rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
    }, [])

    return (
        <h1
            ref={ref}
            className={className}
            style={{
                '--shine-x': '-50%',
                backgroundImage: `radial-gradient(circle at var(--shine-x) 50%, hsl(24, 70%, 72%) 0%, #1a1a1a 22%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
            } as React.CSSProperties}
        >
            {children}
        </h1>
    )
}
