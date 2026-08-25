import type { Statistics } from "@/lib/statistics";

/** Footer stats shown on a subject card: speaking minutes, speaker count, party dots. */
export interface SubjectCardStats {
    minutes: number;
    /**
     * The unrounded speaking time. `minutes` is what a card displays, but comparing
     * subjects to each other (the city page ranks them against the leader) needs the
     * raw value — at these durations rounding to minutes loses the differences that
     * separate the tail.
     */
    speakingSeconds: number;
    speakerCount: number;
    partyDots: { id: string; colorHex: string; name: string }[];
}

/** Derive the footer stats from a subject's statistics (shared by the app card and the widget). */
export function subjectCardStats(statistics: Statistics | undefined, fallbackSpeakerCount = 0): SubjectCardStats {
    return {
        minutes: statistics?.speakingSeconds ? Math.round(statistics.speakingSeconds / 60) : 0,
        speakingSeconds: statistics?.speakingSeconds ?? 0,
        // `??`, not `||`: a subject whose segments have no resolved speaker has a
        // people list of length 0, and that is the answer — falling through would
        // report its contribution count as a speaker count.
        speakerCount: statistics?.people?.length ?? fallbackSpeakerCount,
        partyDots: (statistics?.parties ?? []).map(p => ({ id: p.item.id, colorHex: p.item.colorHex, name: p.item.name })),
    };
}
