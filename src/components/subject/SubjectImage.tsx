import { IMAGE_HEIGHT, IMAGE_WIDTH } from '@opencouncil/subject-images/constants';
import { cn } from '@/lib/utils';

/** The image route, with an optional cache-buster for a copy the viewer just changed. */
export function subjectImageUrl(subjectId: string, version?: number | string): string {
    return `/api/subject/${subjectId}/image${version ? `?v=${version}` : ''}`;
}

/**
 * A subject's illustration, or its topic-coloured placeholder — the route
 * decides which. A plain <img> on purpose: the route redirects to the CDN and
 * the stored file is already WebP, so next/image would only add a hop. The
 * intrinsic size is the canonical 1344×768, so the box is reserved before the
 * bytes arrive and nothing shifts.
 */
export function SubjectImage({
    subjectId,
    alt,
    version,
    loading = 'lazy',
    className,
}: {
    subjectId: string;
    alt: string;
    /** Bump after a regenerate or upload so the browser refetches past its cached copy. */
    version?: number | string;
    loading?: 'lazy' | 'eager';
    className?: string;
}) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={subjectImageUrl(subjectId, version)}
            alt={alt}
            width={IMAGE_WIDTH}
            height={IMAGE_HEIGHT}
            loading={loading}
            decoding="async"
            className={cn('block h-full w-full object-cover', className)}
        />
    );
}
