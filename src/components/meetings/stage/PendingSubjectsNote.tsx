'use client';
import { useTranslations } from 'next-intl';
import { PendingBox } from './PendingBox';

/**
 * Stands where the προ/εκτός ημερησίας sections will be: the transcript review
 * creates those subjects, so under review the page says when, instead of
 * silently showing nothing.
 */
export function PendingSubjectsNote({ deadline }: { deadline: Date | null }) {
    const t = useTranslations('meetingStage');
    return (
        <section className="mx-auto mt-8 w-full max-w-4xl">
            <h3 className="text-base font-bold sm:text-lg">{t('pendingSections.title')}</h3>
            <PendingBox deadline={deadline} className="mt-3">{t('pendingSections.body')}</PendingBox>
        </section>
    );
}
