import type { Metadata } from 'next';

export function buildHreflangAlternates(canonicalPath: string): NonNullable<Metadata['alternates']> {
    const enPath = canonicalPath === '/' ? '/en' : `/en${canonicalPath}`;
    return {
        canonical: canonicalPath,
        languages: {
            'el': canonicalPath,
            'en': enPath,
            'x-default': canonicalPath,
        },
    };
}
