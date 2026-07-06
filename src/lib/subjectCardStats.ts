import type { Statistics } from "@/lib/statistics";

/** Footer stats shown on a subject card: speaking minutes, speaker count, party dots. */
export interface SubjectCardStats {
    minutes: number;
    speakerCount: number;
    partyDots: { id: string; colorHex: string; name: string }[];
}

/** Derive the footer stats from a subject's statistics (shared by the app card and the widget). */
export function subjectCardStats(statistics: Statistics | undefined, fallbackSpeakerCount = 0): SubjectCardStats {
    return {
        minutes: statistics?.speakingSeconds ? Math.round(statistics.speakingSeconds / 60) : 0,
        speakerCount: statistics?.people?.length || fallbackSpeakerCount || 0,
        partyDots: (statistics?.parties ?? []).map(p => ({ id: p.item.id, colorHex: p.item.colorHex, name: p.item.name })),
    };
}
