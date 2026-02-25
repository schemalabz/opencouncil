import { VideoIcon, AudioLines, FileText, Ban, LucideIcon } from "lucide-react";
import type { CouncilMeeting, Subject } from "@prisma/client";

type MeetingMediaTypeInput = Partial<Pick<CouncilMeeting, "videoUrl" | "audioUrl" | "muxPlaybackId" | "agendaUrl">> & {
    subjects?: Subject[];
};

/**
 * Get media type information for a meeting
 * Returns the type of media available with label and icon component
 */
export function getMeetingMediaType(meeting: MeetingMediaTypeInput): { label: string; icon: LucideIcon } {
    // Video state - if there's a video and mux playback id
    if (meeting.videoUrl && meeting.muxPlaybackId && !meeting.videoUrl.endsWith('mp3')) {
        return {
            label: "Bίντεο",
            icon: VideoIcon
        };
    }

    // Audio state - if there's audio and mux playback id
    if (meeting.audioUrl && meeting.muxPlaybackId) {
        return {
            label: "Ήχος",
            icon: AudioLines
        };
    }

    // Agenda state - if there's an agenda and at least one subject but no media
    if (meeting.agendaUrl && meeting.subjects && meeting.subjects.length > 0 && !meeting.muxPlaybackId) {
        return {
            label: "Διάταξη",
            icon: FileText
        };
    }

    // Empty state - default case
    return {
        label: "Κενή",
        icon: Ban
    };
}
