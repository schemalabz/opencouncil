'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

/**
 * Renders its children only on one page of the meeting shell.
 *
 * The action bar is composed in the meeting layout — a Server Component that
 * renders once for every child page — so a button that belongs to one tab
 * (Επεξεργασία edits the transcript; Παρουσίαση presents the overview) gates
 * itself here instead of the layout guessing.
 *
 * `segment` is the child segment name, or null for the meeting overview, which
 * is the layout's index page and reports no segment of its own.
 */
export function SegmentOnly({ segment, children }: { segment: string | null; children: React.ReactNode }) {
    const current = useSelectedLayoutSegment();
    return current === segment ? <>{children}</> : null;
}
