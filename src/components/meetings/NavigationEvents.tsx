'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export function NavigationEvents() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isNavigating, setIsNavigating] = useState(false)
    const [loadingPath, setLoadingPath] = useState<string | null>(null)

    // Trigger a loading state immediately on user interaction
    useEffect(() => {
        const handleNavigation = (e: MouseEvent) => {
            // Check if the click was on a navigation link
            const target = e.target as HTMLElement
            const closestLink = target.closest('a')

            if (closestLink && closestLink.getAttribute('href')) {
                const href = closestLink.getAttribute('href')
                // Only handle internal navigation
                if (href && href.startsWith('/')) {
                    setIsNavigating(true)
                    setLoadingPath(href)
                }
            }
        }

        // Listen for click events globally
        document.addEventListener('click', handleNavigation)

        return () => {
            document.removeEventListener('click', handleNavigation)
        }
    }, [])

    // Reset the loading state when navigation completes
    useEffect(() => {
        setIsNavigating(false)
        setLoadingPath(null)
    }, [pathname, searchParams])

    // Make loadingPath available to other components via a custom event
    useEffect(() => {
        if (loadingPath) {
            const event = new CustomEvent('navigationstart', {
                detail: { path: loadingPath }
            })
            document.dispatchEvent(event)
        } else if (!isNavigating) {
            const event = new CustomEvent('navigationend', { detail: { path: pathname } })
            document.dispatchEvent(event)
        }
    }, [loadingPath, isNavigating, pathname])

    return null
} 