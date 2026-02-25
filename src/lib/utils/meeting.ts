import { VideoIcon, AudioLines, FileText, Ban, LucideIcon } from "lucide-react";
import type { CouncilMeeting, Subject } from "@prisma/client";

type MeetingMediaTypeInput = Partial<Pick<CouncilMeeting, "videoUrl" | "audioUrl" | "muxPlaybackId" | "agendaUrl">> & {
    subjects?: Subject[];
};

function isMp3Url(url: string): boolean {
    const normalizedUrl = url.split('#')[0].split('?')[0].toLowerCase();
    return normalizedUrl.endsWith('.mp3');
}

/**
 * Get media type information for a meeting
 * Returns the type of media available with label and icon component
 */
export function getMeetingMediaType(meeting: MeetingMediaTypeInput): { label: string; icon: LucideIcon } {
    // Video state - if there's a video and mux playback id
    if (meeting.videoUrl && meeting.muxPlaybackId && !isMp3Url(meeting.videoUrl)) {
        return {
            label: "Βίντεο",
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
