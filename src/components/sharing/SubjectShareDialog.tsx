'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localizeText } from '@/lib/serbian';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localePath } from '@/lib/sharing/excerptSelector';
import { storyImagePath } from '@/lib/sharing/story';
import { ContentShareDialog } from './ContentShareDialog';

export function SubjectShareDialog({ open, onOpenChange, cityId, meetingId, subject }: {
    open: boolean; onOpenChange: (open: boolean) => void; cityId: string; meetingId: string;
    subject: { id: string; name: string; description: string | null };
}) {
    const locale = useLocale();
    const t = useTranslations('sharing');
    const [url, setUrl] = useState('');
    useEffect(() => {
        setUrl(new URL(localePath(locale, `/${cityId}/${meetingId}/subjects/${subject.id}`), window.location.origin).href);
    }, [cityId, meetingId, subject.id, locale]);
    const name = localizeText(subject.name, locale);
    const summary = localizeText(stripMarkdown(subject.description ?? ''), locale);
    return <ContentShareDialog open={open} onOpenChange={onOpenChange} initialMode="story"
        analytics={{ content_type: 'subject', surface: 'subject_menu', city_id: cityId, meeting_id: meetingId, subject_id: subject.id, locale }}
        title={t('shareSubject')} description={t('storySubjectDescription')} url={url}
        storyImageUrl={storyImagePath({ type: 'subject', cityId, meetingId, subjectId: subject.id, locale })}
        sourceText={[name, summary && t('summary'), summary].filter(Boolean).join('\n\n')} copyTextLabel={t('copySummary')}>
        <div className="space-y-3"><p className="text-lg font-semibold">{name}</p>{summary && <><p className="text-xs text-muted-foreground">{t('summary')}</p><p className="max-h-[30dvh] overflow-y-auto text-base leading-7">{summary}</p></>}</div>
    </ContentShareDialog>;
}
