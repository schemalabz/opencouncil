"use client"

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface Props {
    /** Names the widget in the fallback message. */
    label: string
    children: React.ReactNode
}

function WidgetErrorFallback({ label, onRetry }: { label: string; onRetry: () => void }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    return (
        <div className="flex items-center gap-3 rounded-lg border p-6 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="flex-1">
                {label} is unavailable. The rest of the dashboard is unaffected — server-side failures are in the server logs.
            </span>
            <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                    startTransition(() => {
                        // Refresh first: re-rendering the children alone would
                        // replay the errored payload and re-trip the boundary.
                        router.refresh()
                        onRetry()
                    })
                }
            >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
            </Button>
        </div>
    )
}

/**
 * Catches errors from a single dashboard widget so a failing widget
 * degrades to one inert card instead of failing the whole admin route —
 * the blast radius that issue #560's crash demonstrated.
 */
export default function AdminWidgetErrorBoundary({ label, children }: Props) {
    return (
        <ErrorBoundary label={label} fallback={reset => <WidgetErrorFallback label={label} onRetry={reset} />}>
            {children}
        </ErrorBoundary>
    )
}
