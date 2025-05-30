'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"

export default function MeetingLoading() {
    // Add a fade-in effect for smoother transition
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // Immediately show the loading UI
        setIsVisible(true)

        // Listen for navigation events
        const handleNavStart = () => {
            setIsVisible(true)
        }

        document.addEventListener('navigationstart', handleNavStart)

        return () => {
            document.removeEventListener('navigationstart', handleNavStart)
        }
    }, [])

    return (
        <div className={`p-4 w-full max-w-3xl mx-auto space-y-6 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* Title skeleton */}
            <div className="space-y-2">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>

            {/* Content blocks */}
            <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-md" />

                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </div>

                <Skeleton className="h-32 w-full rounded-md" />

                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>

                <Skeleton className="h-20 w-full rounded-md" />
            </div>
        </div>
    )
} 