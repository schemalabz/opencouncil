"use client"

import React from 'react'

interface Props {
    /** Names the section in the server log. */
    label: string
    children: React.ReactNode
}

interface State {
    hasError: boolean
}

/**
 * Hides a section that fails instead of failing the page around it, for
 * content the page decorates itself with and can do without: a
 * recommendation list, a related-items rail. Server-component errors
 * streamed inside a Suspense boundary re-throw at this position on the
 * client, so this contains those too — Suspense alone catches thrown
 * promises, not errors, and the next boundary up is the root error page.
 * AdminWidgetErrorBoundary is the same mechanism with a visible fallback,
 * for widgets an operator needs to know are down.
 */
export class OptionalSectionBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[OptionalSectionBoundary] ${this.props.label} failed:`, error, errorInfo)
    }

    render() {
        return this.state.hasError ? null : this.props.children
    }
}
