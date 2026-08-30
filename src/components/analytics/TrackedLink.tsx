'use client';

import { Link } from '@/i18n/routing';
import { captureEvent } from '@/lib/analytics/capture';
import type { ComponentProps } from 'react';

/**
 * A Link that captures one typed event on click. For Server Components (the
 * overview timeline, the hot-topics ranking, meeting cards) whose links need
 * analytics without turning the whole tree into a Client Component.
 */
export function TrackedLink({ event, eventProps, onClick, ...props }: ComponentProps<typeof Link> & {
    event: string;
    eventProps?: Record<string, unknown>;
}) {
    return (
        <Link
            {...props}
            onClick={e => {
                captureEvent(event, eventProps);
                onClick?.(e);
            }}
        />
    );
}
