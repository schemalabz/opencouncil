"use client";

import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { CtaButton } from '@/components/ui/cta-button';
import { RailCard } from '@/components/ui/rail-card';

/** The rail's second export: the Πίνακας αποφάσεων the municipality posts on
 * its website, as a DOCX. The table itself is the page's main column, so the
 * card only says what the document is and offers the download. */
export function DecisionsTableCard({ onExport }: { onExport: () => void }) {
    const t = useTranslations('decisionsTable');
    return (
        <RailCard title={t('title')}>
            <p className="text-xs leading-snug text-muted-foreground">{t('exportHint')}</p>
            <CtaButton arrow={false} className="mt-3 w-full" onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                {t('export')}
            </CtaButton>
        </RailCard>
    );
}
