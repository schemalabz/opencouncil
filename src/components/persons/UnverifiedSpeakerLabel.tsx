import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Marks a speaker name that the AI assigned and no person has checked yet
 * (issue #982). Shown next to the name, so the name stays readable.
 */
export function UnverifiedSpeakerLabel({ className }: { className?: string }) {
    const t = useTranslations('transcript.unverifiedSpeaker');
    return (
        <span
            title={t('description')}
            className={cn(
                "inline-flex h-[18px] shrink-0 items-center rounded border border-yellow-500/50 bg-yellow-50 px-1.5 align-middle text-[10px] font-medium leading-none text-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-100",
                className,
            )}
        >
            {t('label')}
        </span>
    );
}
