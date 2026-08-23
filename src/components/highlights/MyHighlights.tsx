import Image from "next/image";
import { Landmark } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/formatters/time";
import { getLocalizedName } from "@/lib/formatters/name";
import { generateHighlightFileName } from "@/lib/export/download";
import type { HighlightWithMeetingAndStatistics, MyHighlights as MyHighlightsData } from "@/lib/db/highlights";
import { HighlightsGrid } from "./HighlightsGrid";
import type { HighlightCardData } from "./HighlightCard";

function toCardData(highlight: HighlightWithMeetingAndStatistics): HighlightCardData {
    return {
        id: highlight.id,
        name: highlight.name,
        isShowcased: highlight.isShowcased,
        updatedAt: highlight.updatedAt,
        href: `/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`,
        duration: highlight.statistics.duration,
        speakerCount: highlight.statistics.speakerCount,
        utteranceCount: highlight.statistics.utteranceCount,
        subjectName: highlight.subject?.name ?? null,
        // Every highlight on this page belongs to the viewer.
        creatorName: null,
        canManage: true,
        video: highlight.videoUrl
            ? {
                url: highlight.videoUrl,
                playbackId: highlight.muxPlaybackId,
                fileName: generateHighlightFileName(highlight.cityId, highlight.meetingId, highlight.name),
            }
            : undefined,
    };
}

interface MeetingGroup {
    meeting: HighlightWithMeetingAndStatistics["meeting"];
    items: HighlightCardData[];
}

/**
 * One group per meeting, in first-seen order: the query sorts by meeting date,
 * so groups come out newest first. Keyed rather than adjacency-based, because
 * distinct meetings can share a dateTime and would otherwise split into
 * repeated groups for the same meeting.
 */
function groupByMeeting(highlights: HighlightWithMeetingAndStatistics[]): MeetingGroup[] {
    const groups = new Map<string, MeetingGroup>();
    for (const highlight of highlights) {
        const key = `${highlight.cityId}/${highlight.meetingId}`;
        let group = groups.get(key);
        if (!group) {
            group = { meeting: highlight.meeting, items: [] };
            groups.set(key, group);
        }
        group.items.push(toCardData(highlight));
    }
    return [...groups.values()];
}

export async function MyHighlights({ highlights, truncated }: MyHighlightsData) {
    const [t, locale] = await Promise.all([
        getTranslations('highlights.myHighlights'),
        getLocale(),
    ]);

    if (highlights.length === 0) {
        return (
            <HighlightsGrid
                items={[]}
                surface="profile"
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
                                className="h-10 w-10 shrink-0 rounded-md object-contain"
                            />
                        ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Landmark className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-semibold truncate">
                                {getLocalizedName(meeting, locale)}
                            </h2>
                            <p className="text-sm text-muted-foreground truncate">
                                {[
                                    getLocalizedName(meeting.city, locale),
                                    meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null,
                                    formatDate(meeting.dateTime, meeting.city.timezone, locale),
                                ].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                    </div>
                    <HighlightsGrid items={items} surface="profile" />
                </section>
            ))}

            {truncated && (
                <p className="text-sm text-muted-foreground text-center">
                    {t('truncated', { count: highlights.length })}
                </p>
            )}
        </div>
    );
}
