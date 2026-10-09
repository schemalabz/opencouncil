"use client";
import { Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { buttonVariants } from '@/components/ui/button';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

interface BodyEmbedCardProps {
    cityId: string;
    bodyId: string;
}

/**
 * The way to the embed configurator of this body (#829). A youth council
 * puts its meetings on its own site or blog; the configurator opens locked
 * to the body, so the widget never shows the rest of the municipality.
 */
export function BodyEmbedCard({ cityId, bodyId }: BodyEmbedCardProps) {
    const t = useTranslations('body');
    return (
        <section className={cn(surfaceCardClass, 'space-y-5 p-5')}>
            <div>
                <h2 className="!m-0 !text-left text-lg">{t('embedTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('embedIntro')}</p>
            </div>
            <Link
                href={`/${cityId}/widget?body=${encodeURIComponent(bodyId)}`}
                prefetch={false}
                className={cn(buttonVariants({ variant: 'outline' }), 'no-underline hover:no-underline')}
            >
                <Code2 className="mr-2 h-4 w-4" aria-hidden />
                {t('embedOpen')}
            </Link>
        </section>
    );
}
