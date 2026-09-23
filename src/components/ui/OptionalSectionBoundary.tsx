"use client"

import { ErrorBoundary } from '@/components/ErrorBoundary'

interface Props {
    /** Names the section in the server log. */
    label: string
    children: React.ReactNode
}

/**
 * Hides a section that fails instead of failing the page around it, for
 * content the page decorates itself with and can do without: a
 * recommendation list, a related-items rail.
 */
export function OptionalSectionBoundary({ label, children }: Props) {
    return <ErrorBoundary label={label} fallback={null}>{children}</ErrorBoundary>
}
