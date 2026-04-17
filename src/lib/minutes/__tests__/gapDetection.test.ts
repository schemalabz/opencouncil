import {
    buildTranscriptEntriesFromUtterances,
    TranscriptUtterance,
    SpeakerResolver,
    GapContentUtterance,
    GAP_FILL_THRESHOLD_SECONDS,
} from '../transcriptEntries';
import { MinutesSpeakerEntry, MinutesGapEntry } from '../types';

function makeUtterance(overrides: Partial<TranscriptUtterance> & {
    startTimestamp: number;
    endTimestamp: number;
    text: string;
    personId?: string | null;
    label?: string | null;
}): TranscriptUtterance {
    return {
        text: overrides.text,
        startTimestamp: overrides.startTimestamp,
        endTimestamp: overrides.endTimestamp,
        speakerSegment: {
            speakerTag: {
                personId: 'personId' in overrides ? overrides.personId! : 'person-1',
                label: 'label' in overrides ? overrides.label! : 'Speaker 1',
            },
        },
    };
}

const simpleSpeakerResolver: SpeakerResolver = (personId, label) => ({
    speakerName: label || 'Unknown',
    party: null,
    isPartyHead: false,
    role: null,
});

describe('buildTranscriptEntriesFromUtterances', () => {
    it('returns empty array for no utterances', () => {
        const result = buildTranscriptEntriesFromUtterances([], simpleSpeakerResolver);
        expect(result).toEqual([]);
    });

    it('produces speaker entries with no gaps when utterances are consecutive', () => {
        const utterances = [
            makeUtterance({ text: 'Hello', startTimestamp: 0, endTimestamp: 3, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'World', startTimestamp: 3, endTimestamp: 6, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Goodbye', startTimestamp: 6, endTimestamp: 9, personId: 'p2', label: 'Bob' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('speaker');
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Hello World');
        expect((result[0] as MinutesSpeakerEntry).speakerName).toBe('Alice');
        expect(result[1].type).toBe('speaker');
        expect((result[1] as MinutesSpeakerEntry).text).toBe('Goodbye');
        expect((result[1] as MinutesSpeakerEntry).speakerName).toBe('Bob');
    });

    it('does not insert gap marker for gaps below threshold', () => {
        const utterances = [
            makeUtterance({ text: 'First', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Second', startTimestamp: 10, endTimestamp: 15, personId: 'p1', label: 'Alice' }),
        ];
        // gap = 10 - 5 = 5 seconds, below threshold

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('speaker');
        expect((result[0] as MinutesSpeakerEntry).text).toBe('First Second');
    });

    it('inserts gap marker when gap has content (no options = backwards compat)', () => {
        const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
        const utterances = [
            makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'After', startTimestamp: 5 + gapDuration, endTimestamp: 5 + gapDuration + 5, personId: 'p1', label: 'Alice' }),
        ];

        // No options = backwards compat, always inserts marker
        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('speaker');
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Before');
        expect(result[1].type).toBe('gap');
        expect((result[1] as MinutesGapEntry).durationSeconds).toBe(gapDuration);
        expect((result[1] as MinutesGapEntry).subjects).toEqual([]);
        expect(result[2].type).toBe('speaker');
        expect((result[2] as MinutesSpeakerEntry).text).toBe('After');
    });

    it('splits same speaker into two blocks around a gap', () => {
        const utterances = [
            makeUtterance({ text: 'Part 1', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Part 2', startTimestamp: 100, endTimestamp: 105, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('speaker');
        expect((result[0] as MinutesSpeakerEntry).speakerName).toBe('Alice');
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Part 1');
        expect(result[1].type).toBe('gap');
        expect(result[2].type).toBe('speaker');
        expect((result[2] as MinutesSpeakerEntry).speakerName).toBe('Alice');
        expect((result[2] as MinutesSpeakerEntry).text).toBe('Part 2');
    });

    it('keeps null-personId utterances separate when labels differ', () => {
        const utterances = [
            makeUtterance({ text: 'Hello', startTimestamp: 0, endTimestamp: 3, personId: null, label: 'Unknown 1' }),
            makeUtterance({ text: 'World', startTimestamp: 3, endTimestamp: 6, personId: null, label: 'Unknown 2' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(2);
        expect((result[0] as MinutesSpeakerEntry).speakerName).toBe('Unknown 1');
        expect((result[1] as MinutesSpeakerEntry).speakerName).toBe('Unknown 2');
    });

    it('merges null-personId utterances when labels match', () => {
        const utterances = [
            makeUtterance({ text: 'Part 1', startTimestamp: 0, endTimestamp: 3, personId: null, label: 'Unknown Speaker' }),
            makeUtterance({ text: 'Part 2', startTimestamp: 3, endTimestamp: 6, personId: null, label: 'Unknown Speaker' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Part 1 Part 2');
    });

    it('does not merge null-personId with identified speaker even with same label', () => {
        const utterances = [
            makeUtterance({ text: 'First', startTimestamp: 0, endTimestamp: 3, personId: null, label: 'Alice' }),
            makeUtterance({ text: 'Second', startTimestamp: 3, endTimestamp: 6, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        // Different personId (null vs 'p1') means different speakers
        expect(result).toHaveLength(2);
    });

    it('handles single utterance without gaps', () => {
        const utterances = [
            makeUtterance({ text: 'Only one', startTimestamp: 10, endTimestamp: 20, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('speaker');
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Only one');
        expect((result[0] as MinutesSpeakerEntry).timestamp).toBe(10);
    });

    it('handles multiple gaps in sequence', () => {
        const gap = GAP_FILL_THRESHOLD_SECONDS + 5;
        const utterances = [
            makeUtterance({ text: 'A', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'B', startTimestamp: 5 + gap, endTimestamp: 10 + gap, personId: 'p2', label: 'Bob' }),
            makeUtterance({ text: 'C', startTimestamp: 10 + gap * 2, endTimestamp: 15 + gap * 2, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        // A, gap, B, gap, C
        expect(result).toHaveLength(5);
        expect(result[0].type).toBe('speaker');
        expect(result[1].type).toBe('gap');
        expect(result[2].type).toBe('speaker');
        expect(result[3].type).toBe('gap');
        expect(result[4].type).toBe('speaker');
    });

    it('merges fill utterances with different speakers inline (no gap marker for short gaps)', () => {
        // Simulate already-merged fill utterances within a short gap
        const utterances = [
            makeUtterance({ text: 'Subject talk', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Fill content', startTimestamp: 6, endTimestamp: 8, personId: 'p2', label: 'Bob' }),
            makeUtterance({ text: 'More subject', startTimestamp: 9, endTimestamp: 14, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        // All gaps < threshold, so no gap markers; but speaker changes create separate entries
        expect(result).toHaveLength(3);
        expect(result.every(e => e.type === 'speaker')).toBe(true);
    });

    it('preserves timestamp of first utterance in each speaker block', () => {
        const utterances = [
            makeUtterance({ text: 'First', startTimestamp: 10, endTimestamp: 15, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Second', startTimestamp: 15, endTimestamp: 20, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect((result[0] as MinutesSpeakerEntry).timestamp).toBe(10);
    });

    it('handles gap exactly at threshold', () => {
        const utterances = [
            makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'After', startTimestamp: 5 + GAP_FILL_THRESHOLD_SECONDS, endTimestamp: 10 + GAP_FILL_THRESHOLD_SECONDS, personId: 'p2', label: 'Bob' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(3);
        expect(result[1].type).toBe('gap');
        expect((result[1] as MinutesGapEntry).durationSeconds).toBe(GAP_FILL_THRESHOLD_SECONDS);
    });

    it('uses speaker resolver for display info', () => {
        const resolver: SpeakerResolver = (personId) => ({
            speakerName: personId === 'mayor' ? 'Δήμαρχος' : 'Σύμβουλος',
            party: personId === 'mayor' ? 'ΝΔ' : null,
            isPartyHead: personId === 'mayor',
            role: personId === 'mayor' ? 'Πρόεδρος' : null,
        });

        const utterances = [
            makeUtterance({ text: 'Opening', startTimestamp: 0, endTimestamp: 5, personId: 'mayor', label: 'M' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, resolver);

        expect(result).toHaveLength(1);
        const entry = result[0] as MinutesSpeakerEntry;
        expect(entry.speakerName).toBe('Δήμαρχος');
        expect(entry.party).toBe('ΝΔ');
        expect(entry.isPartyHead).toBe(true);
        expect(entry.role).toBe('Πρόεδρος');
    });

    describe('silence detection', () => {
        it('does not insert gap marker when gap has no content (silence)', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const utterances = [
                makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'After', startTimestamp: 5 + gapDuration, endTimestamp: 10 + gapDuration, personId: 'p2', label: 'Bob' }),
            ];

            // Empty gapContentUtterances = no other content in gap = silence
            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances: [],
            });

            // No gap marker, just two speaker entries
            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('speaker');
            expect(result[1].type).toBe('speaker');
        });

        it('merges same speaker across silence gap', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const utterances = [
                makeUtterance({ text: 'Part 1', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'Part 2', startTimestamp: 5 + gapDuration, endTimestamp: 10 + gapDuration, personId: 'p1', label: 'Alice' }),
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances: [],
            });

            // Same speaker, silence gap — should merge into one block
            expect(result).toHaveLength(1);
            expect((result[0] as MinutesSpeakerEntry).text).toBe('Part 1 Part 2');
        });

        it('inserts gap marker when gap has content', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const gapStart = 5;
            const utterances = [
                makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: gapStart, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'After', startTimestamp: gapStart + gapDuration, endTimestamp: gapStart + gapDuration + 5, personId: 'p2', label: 'Bob' }),
            ];

            const gapContentUtterances: GapContentUtterance[] = [
                { startTimestamp: gapStart + 3, discussionSubjectId: null },
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances,
            });

            expect(result).toHaveLength(3);
            expect(result[1].type).toBe('gap');
            expect((result[1] as MinutesGapEntry).subjects).toEqual([]);
        });

        it('only counts gap content within the specific gap range', () => {
            const gap = GAP_FILL_THRESHOLD_SECONDS + 5;
            const utterances = [
                makeUtterance({ text: 'A', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'B', startTimestamp: 5 + gap, endTimestamp: 10 + gap, personId: 'p2', label: 'Bob' }),
                makeUtterance({ text: 'C', startTimestamp: 10 + gap * 2, endTimestamp: 15 + gap * 2, personId: 'p1', label: 'Alice' }),
            ];

            // Content only in first gap, not second
            const gapContentUtterances: GapContentUtterance[] = [
                { startTimestamp: 8, discussionSubjectId: 'other-subject' },
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances,
                subjectNames: new Map([['other-subject', 'Budget Discussion']]),
            });

            // First gap has content → marker, second gap is silence → no marker
            expect(result).toHaveLength(4); // A, gap, B, C
            expect(result[0].type).toBe('speaker');
            expect(result[1].type).toBe('gap');
            expect(result[2].type).toBe('speaker');
            expect(result[3].type).toBe('speaker');
        });
    });

    describe('subject name in gap markers', () => {
        it('shows subject name when all gap content is from one subject', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const gapStart = 5;
            const utterances = [
                makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: gapStart, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'After', startTimestamp: gapStart + gapDuration, endTimestamp: gapStart + gapDuration + 5, personId: 'p2', label: 'Bob' }),
            ];

            const gapContentUtterances: GapContentUtterance[] = [
                { startTimestamp: gapStart + 2, discussionSubjectId: 'subject-2' },
                { startTimestamp: gapStart + 5, discussionSubjectId: 'subject-2' },
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances,
                subjectNames: new Map([['subject-2', 'Προϋπολογισμός 2026']]),
            });

            expect(result).toHaveLength(3);
            const gap = result[1] as MinutesGapEntry;
            expect(gap.type).toBe('gap');
            expect(gap.subjects).toEqual([{ id: 'subject-2', name: 'Προϋπολογισμός 2026' }]);
        });

        it('shows multiple subject names when gap content spans subjects', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const gapStart = 5;
            const utterances = [
                makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: gapStart, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'After', startTimestamp: gapStart + gapDuration, endTimestamp: gapStart + gapDuration + 5, personId: 'p2', label: 'Bob' }),
            ];

            const gapContentUtterances: GapContentUtterance[] = [
                { startTimestamp: gapStart + 2, discussionSubjectId: 'subject-2' },
                { startTimestamp: gapStart + 5, discussionSubjectId: 'subject-3' },
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances,
                subjectNames: new Map([['subject-2', 'Θέμα Α'], ['subject-3', 'Θέμα Β']]),
            });

            expect(result).toHaveLength(3);
            const gap = result[1] as MinutesGapEntry;
            expect(gap.type).toBe('gap');
            expect(gap.subjects).toEqual([{ id: 'subject-2', name: 'Θέμα Α' }, { id: 'subject-3', name: 'Θέμα Β' }]);
        });

        it('returns empty subjectNames when gap content has null subject IDs', () => {
            const gapDuration = GAP_FILL_THRESHOLD_SECONDS + 10;
            const gapStart = 5;
            const utterances = [
                makeUtterance({ text: 'Before', startTimestamp: 0, endTimestamp: gapStart, personId: 'p1', label: 'Alice' }),
                makeUtterance({ text: 'After', startTimestamp: gapStart + gapDuration, endTimestamp: gapStart + gapDuration + 5, personId: 'p2', label: 'Bob' }),
            ];

            const gapContentUtterances: GapContentUtterance[] = [
                { startTimestamp: gapStart + 2, discussionSubjectId: null },
                { startTimestamp: gapStart + 5, discussionSubjectId: null },
            ];

            const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, {
                gapContentUtterances,
            });

            expect(result).toHaveLength(3);
            const gap = result[1] as MinutesGapEntry;
            expect(gap.subjects).toEqual([]);
        });
    });
});
