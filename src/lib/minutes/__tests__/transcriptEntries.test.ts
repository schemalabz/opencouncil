import {
    buildTranscriptEntriesFromUtterances,
    TranscriptUtterance,
    SpeakerResolver,
    CrossSubjectInfo,
} from '../transcriptEntries';
import { MinutesSpeakerEntry, MinutesCrossSubjectEntry } from '../types';

function makeUtterance(overrides: {
    id?: string;
    startTimestamp: number;
    endTimestamp: number;
    text: string;
    personId?: string | null;
    label?: string | null;
}): TranscriptUtterance {
    return {
        id: overrides.id ?? `u-${overrides.startTimestamp}`,
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

const simpleSpeakerResolver: SpeakerResolver = (_personId, label) => ({
    speakerName: label || 'Unknown',
    party: null,
    isPartyHead: false,
    role: null,
});

describe('buildTranscriptEntriesFromUtterances', () => {
    it('returns empty array for no utterances', () => {
        expect(buildTranscriptEntriesFromUtterances([], simpleSpeakerResolver)).toEqual([]);
    });

    it('merges consecutive same-speaker utterances', () => {
        const utterances = [
            makeUtterance({ text: 'Hello', startTimestamp: 0, endTimestamp: 3, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'World', startTimestamp: 3, endTimestamp: 6, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect((result[0] as MinutesSpeakerEntry).text).toBe('Hello World');
    });

    it('splits on speaker change', () => {
        const utterances = [
            makeUtterance({ text: 'Hello', startTimestamp: 0, endTimestamp: 3, personId: 'p1', label: 'Alice' }),
            makeUtterance({ text: 'Reply', startTimestamp: 3, endTimestamp: 6, personId: 'p2', label: 'Bob' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(2);
        expect((result[0] as MinutesSpeakerEntry).speakerName).toBe('Alice');
        expect((result[1] as MinutesSpeakerEntry).speakerName).toBe('Bob');
    });

    it('inserts cross-subject start and end annotations', () => {
        const utterances = [
            makeUtterance({ id: 'u1', text: 'Subject A talk', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ id: 'u2', text: 'Subject B talk', startTimestamp: 6, endTimestamp: 10, personId: 'p2', label: 'Bob' }),
            makeUtterance({ id: 'u3', text: 'Back to A', startTimestamp: 11, endTimestamp: 15, personId: 'p1', label: 'Alice' }),
        ];

        const crossSubjectInfo: CrossSubjectInfo = {
            crossSubjectUtterances: new Map([['u2', 's-b']]),
            subjectNames: new Map([['s-b', 'Budget Discussion']]),
        };

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, crossSubjectInfo);

        expect(result).toHaveLength(5);
        expect(result[0].type).toBe('speaker');
        expect(result[1].type).toBe('cross-subject');
        expect((result[1] as MinutesCrossSubjectEntry).direction).toBe('start');
        expect((result[1] as MinutesCrossSubjectEntry).subject.name).toBe('Budget Discussion');
        expect(result[2].type).toBe('speaker');
        expect(result[3].type).toBe('cross-subject');
        expect((result[3] as MinutesCrossSubjectEntry).direction).toBe('end');
        expect(result[4].type).toBe('speaker');
    });

    it('closes cross-subject block at end of utterances', () => {
        const utterances = [
            makeUtterance({ id: 'u1', text: 'Normal', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ id: 'u2', text: 'Cross', startTimestamp: 6, endTimestamp: 10, personId: 'p2', label: 'Bob' }),
        ];

        const crossSubjectInfo: CrossSubjectInfo = {
            crossSubjectUtterances: new Map([['u2', 's-b']]),
            subjectNames: new Map([['s-b', 'Other Topic']]),
        };

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, crossSubjectInfo);

        expect(result).toHaveLength(4);
        expect(result[result.length - 1].type).toBe('cross-subject');
        expect((result[result.length - 1] as MinutesCrossSubjectEntry).direction).toBe('end');
    });

    it('handles consecutive cross-subject utterances as single block', () => {
        const utterances = [
            makeUtterance({ id: 'u1', text: 'Normal', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ id: 'u2', text: 'Cross 1', startTimestamp: 6, endTimestamp: 8, personId: 'p2', label: 'Bob' }),
            makeUtterance({ id: 'u3', text: 'Cross 2', startTimestamp: 9, endTimestamp: 12, personId: 'p2', label: 'Bob' }),
            makeUtterance({ id: 'u4', text: 'Normal again', startTimestamp: 13, endTimestamp: 16, personId: 'p1', label: 'Alice' }),
        ];

        const crossSubjectInfo: CrossSubjectInfo = {
            crossSubjectUtterances: new Map([['u2', 's-b'], ['u3', 's-b']]),
            subjectNames: new Map([['s-b', 'Topic B']]),
        };

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, crossSubjectInfo);

        expect(result).toHaveLength(5);
        expect(result[0].type).toBe('speaker');
        expect(result[1].type).toBe('cross-subject');
        expect((result[1] as MinutesCrossSubjectEntry).direction).toBe('start');
        expect(result[2].type).toBe('speaker');
        expect((result[2] as MinutesSpeakerEntry).text).toBe('Cross 1 Cross 2');
        expect(result[3].type).toBe('cross-subject');
        expect((result[3] as MinutesCrossSubjectEntry).direction).toBe('end');
        expect(result[4].type).toBe('speaker');
    });

    it('closes previous cross-subject block when transitioning to a different cross-subject', () => {
        const utterances = [
            makeUtterance({ id: 'u1', text: 'Normal', startTimestamp: 0, endTimestamp: 5, personId: 'p1', label: 'Alice' }),
            makeUtterance({ id: 'u2', text: 'Cross B', startTimestamp: 6, endTimestamp: 8, personId: 'p2', label: 'Bob' }),
            makeUtterance({ id: 'u3', text: 'Cross C', startTimestamp: 9, endTimestamp: 12, personId: 'p3', label: 'Charlie' }),
            makeUtterance({ id: 'u4', text: 'Normal again', startTimestamp: 13, endTimestamp: 16, personId: 'p1', label: 'Alice' }),
        ];

        const crossSubjectInfo: CrossSubjectInfo = {
            crossSubjectUtterances: new Map([['u2', 's-b'], ['u3', 's-c']]),
            subjectNames: new Map([['s-b', 'Topic B'], ['s-c', 'Topic C']]),
        };

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver, crossSubjectInfo);

        // Speaker A, cross-start B, Speaker B, cross-end B, cross-start C, Speaker C, cross-end C, Speaker A
        expect(result).toHaveLength(8);
        expect(result[0].type).toBe('speaker');
        expect(result[1].type).toBe('cross-subject');
        expect((result[1] as MinutesCrossSubjectEntry).direction).toBe('start');
        expect((result[1] as MinutesCrossSubjectEntry).subject.name).toBe('Topic B');
        expect(result[2].type).toBe('speaker');
        expect(result[3].type).toBe('cross-subject');
        expect((result[3] as MinutesCrossSubjectEntry).direction).toBe('end');
        expect((result[3] as MinutesCrossSubjectEntry).subject.name).toBe('Topic B');
        expect(result[4].type).toBe('cross-subject');
        expect((result[4] as MinutesCrossSubjectEntry).direction).toBe('start');
        expect((result[4] as MinutesCrossSubjectEntry).subject.name).toBe('Topic C');
        expect(result[5].type).toBe('speaker');
        expect(result[6].type).toBe('cross-subject');
        expect((result[6] as MinutesCrossSubjectEntry).direction).toBe('end');
        expect(result[7].type).toBe('speaker');
    });

    it('works without cross-subject info (no annotations)', () => {
        const utterances = [
            makeUtterance({ text: 'Hello', startTimestamp: 0, endTimestamp: 3, personId: 'p1', label: 'Alice' }),
        ];

        const result = buildTranscriptEntriesFromUtterances(utterances, simpleSpeakerResolver);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('speaker');
    });
});
