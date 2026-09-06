import { Play } from 'lucide-react';
import { compactMetadataDescription } from '@/lib/seo/metadataDescription';
import { formatTimestamp } from '@/lib/formatters/time';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import type { MeetingSummarySubject } from '@/lib/db/types';

interface EmbedSummarySubjectCardProps {
    subject: MeetingSummarySubject;
    /** Seconds into the recording where the discussion starts; null when untagged. */
    startSeconds: number | null;
    /** Subject page URL; the whole card is the link. */
    href: string;
    locale: string;
}

/** Enough text for the two-line clamp on a wide card; the rest never reaches the iframe. */
const DESCRIPTION_MAX_CHARS = 240;

/**
 * Subject card of the summary widget: topic badge, title, a two-line summary
 * and the discussion's start time. One anchor per card (HTML forbids nesting
 * them); the subject page it opens already plays that discussion.
 */
export function EmbedSummarySubjectCard({ subject, startSeconds, href, locale }: EmbedSummarySubjectCardProps) {
    const description = subject.description
        ? localizeText(compactMetadataDescription(subject.description, DESCRIPTION_MAX_CHARS), locale)
        : null;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="embed-summary-card"
            style={{ borderRadius: 'var(--embed-radius)' }}
        >
            {subject.topic && (
                <span
                    className="embed-summary-topic"
                    style={{ color: subject.topic.colorHex, backgroundColor: `${subject.topic.colorHex}20` }}
                >
                    {getLocalizedName(subject.topic, locale)}
                </span>
            )}
            <span className="embed-summary-card-title">{localizeText(subject.name, locale)}</span>
            {description && <span className="embed-summary-desc">{description}</span>}
            {startSeconds != null && (
                <span className="embed-summary-time">
                    <Play size={12} />
                    {formatTimestamp(startSeconds)}
                </span>
            )}
        </a>
    );
}
