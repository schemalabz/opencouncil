import { Clock, MessageSquare } from "lucide-react";
import { PersonAvatarList } from "@/components/persons/PersonAvatarList";
import type { PersonWithRelations } from "@/lib/db/people";
import type { SubjectCardStats } from "@/lib/subjectCardStats";

interface SubjectCardFooterProps {
    stats: SubjectCardStats;
    /** Introducer + top speakers for the avatar row. */
    speakers: PersonWithRelations[];
    withdrawn?: boolean;
    withdrawnLabel?: string;
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
    withdrawn,
    withdrawnLabel,
    avatarsAutoScroll,
    avatarsHovered,
    onAvatarsClick,
}: SubjectCardFooterProps) {
    return (
        <>
            {/* Stats row: time, speakers, party dots */}
            {stats.minutes > 0 && (
                <div className="flex items-center gap-3 w-full text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{stats.minutes} λεπτά</span>
                    </div>
                    {stats.speakerCount > 0 && (
                        <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>{stats.speakerCount}</span>
                        </div>
                    )}
                    {stats.partyDots.length > 0 && (
                        <div className="flex items-center gap-1 ml-auto">
                            {stats.partyDots.map(p => (
                                <div
                                    key={p.id}
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: p.colorHex }}
                                    title={p.name}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
            {/* Speaker avatars or withdrawn label */}
            {withdrawn ? (
                <div className="w-full text-xs text-muted-foreground/70 italic">{withdrawnLabel}</div>
            ) : (
                <div onClick={onAvatarsClick} className="w-full">
                    <PersonAvatarList users={speakers} autoScroll={avatarsAutoScroll} isHovered={avatarsHovered} />
                </div>
            )}
        </>
    );
}
