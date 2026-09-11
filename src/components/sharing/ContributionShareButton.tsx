'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { contributionSubjectPath } from '@/lib/sharing/contributionUrl';
import { ContentShareDialog } from './ContentShareDialog';
import { storyImagePath } from '@/lib/sharing/story';

export function ContributionShareButton({ contributionId, cityId, meetingId, subjectId, text, speakerName, subjectName }: { contributionId: string; cityId: string; meetingId: string; subjectId: string; text: string; speakerName: string | null; subjectName?: string }) {
    const locale = useLocale();
    const t = useTranslations('sharing');
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const summary = localizeText(stripMarkdown(text), locale);
    const name = speakerName ? localizeText(speakerName, locale) : t('unknownSpeaker');
    function handleOpen() {
        setUrl(new URL(contributionSubjectPath(locale, cityId, meetingId, subjectId, contributionId), window.location.origin).href);
        setOpen(true);
    }
    return <>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={handleOpen} title={t('shareContribution')} aria-label={t('shareContribution')}>
            <Share2 className="size-4" aria-hidden />
        </Button>
        <ContentShareDialog open={open} onOpenChange={setOpen} title={t('shareContribution')} description={t('contributionDescription')} url={url} storyImageUrl={storyImagePath({ type: 'contribution', id: contributionId, locale })}
            sourceText={`${name}${subjectName ? ` · ${subjectName}` : ''}\n${t('summary')}\n\n${summary}`} copyTextLabel={t('copySummary')}>
            <div className="space-y-4">
                {subjectName && <p className="text-xs leading-5 text-muted-foreground">{localizeText(subjectName, locale)}</p>}
                <div><p className="text-lg font-semibold">{name}</p><p className="mt-1 text-xs text-muted-foreground">{t('summary')}</p></div>
                <p className="max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words text-base leading-7">{summary}</p>
            </div>
        </ContentShareDialog>
    </>;
}
