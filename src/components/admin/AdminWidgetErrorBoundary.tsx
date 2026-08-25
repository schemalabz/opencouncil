"use client"

import React, { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    /** Names the widget in the fallback message. */
    label: string
    children: React.ReactNode
}

interface State {
    hasError: boolean
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
 * the blast radius that issue #560's crash demonstrated. Server-component
 * errors streamed inside a Suspense boundary re-throw at this position
 * on the client, so this boundary contains those too; purely client-side
 * errors are contained as well but reach no server-side telemetry.
 */
export default class AdminWidgetErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[AdminWidgetErrorBoundary] ${this.props.label} failed:`, error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <WidgetErrorFallback
                    label={this.props.label}
                    onRetry={() => this.setState({ hasError: false })}
                />
            )
        }

        return this.props.children
    }
}
