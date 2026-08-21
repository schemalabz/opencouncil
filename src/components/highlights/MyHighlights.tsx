import Image from "next/image";
import { Landmark } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/formatters/time";
import { getLocalizedName } from "@/lib/formatters/name";
import type { HighlightWithMeeting } from "@/lib/db/highlights";
import { HighlightsGrid, type HighlightCardData } from "./HighlightCards";

// Server-side view of the personal highlights page (/profile/highlights):
// the user's highlights grouped by meeting, one section per meeting.

function toCardData(highlight: HighlightWithMeeting): HighlightCardData {
    const utterances = highlight.highlightedUtterances.map(hu => hu.utterance);

    const duration = utterances.reduce(
        (total, u) => total + (u.endTimestamp - u.startTimestamp), 0
    );

    // Distinct speakers, matching the meeting page's per-name counting as
    // closely as the DB payload allows (person first, then tag label).
    const speakerKeys = new Set(
        utterances.map(u => u.speakerSegment.speakerTag.personId
            ?? u.speakerSegment.speakerTag.label
            ?? 'unknown')
    );

    return {
        id: highlight.id,
        name: highlight.name,
        isShowcased: highlight.isShowcased,
        hasVideo: !!highlight.videoUrl,
        updatedAt: highlight.updatedAt,
        href: `/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`,
        duration,
        speakerCount: speakerKeys.size,
        utteranceCount: utterances.length,
        subjectName: highlight.subject?.name ?? null,
        // Every highlight on this page belongs to the viewer.
        creatorName: null,
        download: highlight.videoUrl
            ? {
                videoUrl: highlight.videoUrl,
                fileName: `${highlight.cityId}_${highlight.meetingId}_${highlight.name || 'highlight'}`,
            }
            : undefined,
    };
}

interface MeetingGroup {
    meeting: HighlightWithMeeting["meeting"];
    items: HighlightCardData[];
}

/**
 * One group per meeting, in first-seen order: the query sorts by meeting date,
 * so groups come out newest first. Keyed rather than adjacency-based, because
 * distinct meetings can share a dateTime and would otherwise split into
 * repeated groups for the same meeting.
 */
function groupByMeeting(highlights: HighlightWithMeeting[]): MeetingGroup[] {
    const groups = new Map<string, MeetingGroup>();
    for (const highlight of highlights) {
        const key = `${highlight.cityId}/${highlight.meetingId}`;
        const group = groups.get(key);
        if (group) {
            group.items.push(toCardData(highlight));
        } else {
            groups.set(key, { meeting: highlight.meeting, items: [toCardData(highlight)] });
        }
    }
    return [...groups.values()];
}

export async function MyHighlights({ highlights }: { highlights: HighlightWithMeeting[] }) {
    const [t, locale] = await Promise.all([
        getTranslations('highlights.myHighlights'),
        getLocale(),
    ]);

    if (highlights.length === 0) {
        return (
            <HighlightsGrid
                items={[]}
                emptyState={{ title: t('empty'), description: t('emptyDescription') }}
            />
        );
    }

    return (
        <div className="space-y-10">
            {groupByMeeting(highlights).map(({ meeting, items }) => (
                <section key={`${meeting.cityId}-${meeting.id}`}>
                    <div className="flex items-center gap-3 mb-4">
                        {/* Most cities store no logo, so the placeholder is the common case. */}
                        {meeting.city.logoImage ? (
                            <Image
                                src={meeting.city.logoImage}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-contain flex-shrink-0"
                            />
                        ) : (
                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <Landmark className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-semibold truncate">
                                {getLocalizedName(meeting, locale)}
                            </h2>
                            <p className="text-sm text-muted-foreground truncate">
                                {getLocalizedName(meeting.city, locale)}
                                {' · '}
                                {formatDate(meeting.dateTime, meeting.city.timezone, locale)}
                            </p>
                        </div>
                    </div>
                    <HighlightsGrid items={items} grouped={false} />
                </section>
            ))}
        </div>
    );
}
