"use client";
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { BodyClaimLinks } from '@/lib/db/bodyMembers';
import { formatDate } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';

interface BodyClaimLinksCardProps {
    cityId: string;
    bodyId: string;
}

/**
 * The claim links of the members who have no account yet (#829). The admin
 * asks for them, copies each one and sends it to the member, who signs in
 * through it and gets their page. Each request mints new links, so the card
 * makes them on demand and not on every visit.
 */
export function BodyClaimLinksCard({ cityId, bodyId }: BodyClaimLinksCardProps) {
    const t = useTranslations('body');
    const locale = useLocale();
    const { toast } = useToast();
    const [links, setLinks] = useState<BodyClaimLinks | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${bodyId}/claim-links`);
            if (!response.ok) throw new Error(t('claimLinksFailed'));
            setLinks(await response.json());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('claimLinksFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function copy(url: string) {
        await navigator.clipboard.writeText(url);
        toast({ title: t('claimLinkCopied') });
    }

    return (
        <section className={cn(surfaceCardClass, 'space-y-5 p-5')}>
            <div>
                <h2 className="!m-0 !text-left text-lg">{t('claimLinksTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('claimLinksIntro')}</p>
            </div>
            {links === null ? (
                <Button type="button" variant="outline" onClick={load} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" aria-hidden />}
                    {t('claimLinksMake')}
                </Button>
            ) : links.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('claimLinksNone')}</p>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        {t('claimLinksValidUntil', { date: formatDate(new Date(links.validUntil), undefined, locale) })}
                    </p>
                    <ul className="divide-y divide-border rounded-lg border">
                        {links.people.map(person => (
                            <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{person.name}</div>
                                    <div className="truncate text-xs text-muted-foreground">{person.role ?? t('claimLinkMember')}</div>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => copy(person.joinUrl)}>
                                    <Copy className="mr-2 h-4 w-4" aria-hidden />
                                    {t('claimLinkCopy')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
        </section>
    );
}
