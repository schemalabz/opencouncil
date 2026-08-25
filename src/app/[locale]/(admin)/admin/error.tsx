"use client"

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorPageProps {
    error: Error & { digest?: string }
    reset: () => void
}

/**
 * Admin-scoped error boundary. Before it existed, any page failure under
 * /admin fell through to the public root error page (issue #560 review).
 * Failures in the admin layout itself (e.g. its auth guard) still do:
 * an error.tsx renders inside its sibling layout, not around it.
 */
export default function AdminError({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        // Log to console for client-side diagnostics; onRequestError handles server-side alerting.
        console.error(error)
    }, [error])

    return (
        <div className="container mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">This admin page failed to load</h2>
            <p className="text-muted-foreground max-w-md">
                The error is logged with digest <code>{error.digest ?? 'n/a'}</code>. Try again, or check the server logs.
            </p>
            <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try again
            </Button>
        </div>
    )
}
