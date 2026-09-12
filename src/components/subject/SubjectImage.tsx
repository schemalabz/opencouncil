'use client';

import { useState } from 'react';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '@opencouncil/subject-images/constants';
import Icon from '@/components/icon';
import { topicStyle } from '@/lib/topicStyle';
import { cn } from '@/lib/utils';

/** The image route, with an optional cache-buster for a copy the viewer just changed. */
export function subjectImageUrl(subjectId: string, version?: number | string): string {
    return `/api/subject/${subjectId}/image${version ? `?v=${version}` : ''}`;
}

/**
 * A subject's illustration over its topic-coloured placeholder: the soft topic
 * wash with the topic glyph, the same fallback ImageOrInitials draws for people
 * and parties. The placeholder paints first, in the box the image will fill.
 * The <img> covers it when the bytes arrive, and hides itself when the route
 * answers 404 (no image yet), so the wash is what stays.
 *
 * A plain <img> on purpose: the route redirects to the CDN and the stored file
 * is already WebP, so next/image would only add a hop. The intrinsic size is
 * the canonical 1344×768, so nothing shifts as it loads.
 */
export function SubjectImage({
    subjectId,
    alt,
    topic,
    version,
    loading = 'lazy',
    className,
}: {
    subjectId: string;
    alt: string;
    /** Colours the placeholder. Without one: the neutral grey and the hash glyph. */
    topic?: { colorHex?: string | null; icon?: string | null } | null;
    /** Bump after a regenerate or upload so the browser refetches past its cached copy. */
    version?: number | string;
    loading?: 'lazy' | 'eager';
    className?: string;
}) {
    const src = subjectImageUrl(subjectId, version);
    // Remembered per URL, so a bumped version after a regenerate shows the <img> again.
    const [missingSrc, setMissingSrc] = useState<string | null>(null);
    const placeholder = topicStyle(topic?.colorHex);

    return (
        <span
            className={cn('relative block h-full w-full overflow-hidden', className)}
            style={{ backgroundColor: placeholder.background, color: placeholder.icon, containerType: 'size' }}
        >
            {/* A quarter of the box's short side, at whatever size the surface draws the box. */}
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="block h-[25cqmin] w-[25cqmin] [&>svg]:h-full [&>svg]:w-full">
                    <Icon name={topic?.icon || 'hash'} color="currentColor" size={24} />
                </span>
            </span>
            {missingSrc !== src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    width={IMAGE_WIDTH}
                    height={IMAGE_HEIGHT}
                    loading={loading}
                    decoding="async"
                    onError={() => setMissingSrc(src)}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
        </span>
    );
}
