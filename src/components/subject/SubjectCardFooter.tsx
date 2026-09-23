import { PersonAvatarList } from "@/components/persons/PersonAvatarList";
import { SubjectStatsRow } from "@/components/subject/SubjectStatsRow";
import type { PersonWithRelations } from "@/lib/db/people";
import type { SubjectCardStats } from "@/lib/subjectCardStats";

interface SubjectCardFooterProps {
    stats: SubjectCardStats;
    /** Introducer + top speakers for the avatar row. */
    speakers: PersonWithRelations[];
    /** The introducer, marked with a pen badge in the avatar row. */
    introducerId?: string;
    withdrawn?: boolean;
    withdrawnLabel?: string;
    /** Localized speaking-time text, already pluralized (e.g. "12 minutes"). */
    minutesText: string;
    /** Avatar auto-scroll (app card); left off in the static widget. */
    avatarsAutoScroll?: boolean;
    avatarsHovered?: boolean;
    /** Stop card-navigation when interacting with the avatars (app card only). */
    onAvatarsClick?: (e: React.MouseEvent) => void;
}

/**
 * Shared subject-card footer: a stats row (speaking minutes, speaker count,
 * party-color dots) above the speaker avatar list. Used by both the app's
 * SubjectCard and the embed widget so the two render identically.
 */
export function SubjectCardFooter({
    stats,
    speakers,
    introducerId,
    withdrawn,
    withdrawnLabel,
    minutesText,
    avatarsAutoScroll,
    avatarsHovered,
    onAvatarsClick,
}: SubjectCardFooterProps) {
    return (
        <>
            <SubjectStatsRow stats={stats} minutesText={minutesText} className="w-full text-[11px]" dotsAtEnd />
            {/* Speaker avatars or withdrawn label */}
            {withdrawn ? (
                <div className="w-full text-xs text-muted-foreground/70 italic">{withdrawnLabel}</div>
            ) : (
                <div onClick={onAvatarsClick} className="w-full">
                    <PersonAvatarList users={speakers} introducerId={introducerId} autoScroll={avatarsAutoScroll} isHovered={avatarsHovered} />
                </div>
            )}
        </>
    );
}
