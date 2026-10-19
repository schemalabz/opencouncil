import { useTranslations } from 'next-intl';

/**
 * A description preview whose rest may be on the way. While `loading`, the "…" that ends the
 * preview becomes three dots that pulse in turn, so the paragraph itself says it continues, and
 * screen readers hear that the rest is loading. With reduced motion the dots stay still.
 */
export function PreviewText({ text, loading }: { text: string; loading: boolean }) {
    const t = useTranslations('landingV2');
    if (!loading) return <>{text}</>;
    return (
        <>
            {text.replace(/…$/u, '')}
            <span aria-hidden>
                {[0, 200, 400].map((delay) => (
                    <span key={delay} className="motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }}>
                        .
                    </span>
                ))}
            </span>
            <span className="sr-only"> {t('subject.loadingDescription')}</span>
        </>
    );
}
