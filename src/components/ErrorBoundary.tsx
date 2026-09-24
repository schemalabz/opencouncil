"use client"

import React from 'react'

interface Props {
    /** Names the failed subtree in the server log. */
    label: string
    /** What stands in for the subtree. A function gets a reset that re-renders the children. */
    fallback: React.ReactNode | ((reset: () => void) => React.ReactNode)
    children: React.ReactNode
}

interface State {
    hasError: boolean
}

/**
 * Contains a render error to one subtree instead of failing the route.
 * Server-component errors streamed inside a Suspense boundary re-throw at
 * this position on the client, so this contains those too; purely
 * client-side errors are contained as well but reach no server-side
 * telemetry. A class, because React gives error boundaries no hook form.
 * The fallback decides what the reader sees: an inert card with a retry for
 * an admin widget, a static map for the live one, nothing for a section
 * the page can do without.
 */
export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[ErrorBoundary] ${this.props.label} failed:`, error, errorInfo)
    }

    render() {
        if (!this.state.hasError) return this.props.children
        const { fallback } = this.props
        return typeof fallback === 'function' ? fallback(() => this.setState({ hasError: false })) : fallback
    }
}
