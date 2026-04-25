"use client"

import React from 'react'
import MapFallback from './MapFallback'

interface Props {
    children: React.ReactNode
    center?: [number, number]
    className?: string
}

interface State {
    hasError: boolean
}

/**
 * Error boundary that catches runtime errors from the Map component
 * (e.g. WebGL context lost, Mapbox GL initialization failures)
 * and renders a graceful static fallback.
 */
export default class MapErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[MapErrorBoundary] Map rendering failed:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <MapFallback
                    center={this.props.center}
                    className={this.props.className}
                />
            )
        }

        return this.props.children
    }
}
