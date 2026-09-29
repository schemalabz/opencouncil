import { isReviewerAssignment, listSpeakerSuggestions, reconcileSpeakerHints, speakerHintsDisagree, speakerHintsStatus, TRANSCRIPT_HINT_MIN_CONFIDENCE } from '../speakerHints';

const hints = (voiceprintPersonId: string | null, transcriptPersonId: string | null, transcriptConfidence: number | null = null) =>
    ({ voiceprintPersonId, transcriptPersonId, transcriptConfidence });
const CONFIDENT = TRANSCRIPT_HINT_MIN_CONFIDENCE;
const UNSURE = TRANSCRIPT_HINT_MIN_CONFIDENCE - 1;

describe('reconcileSpeakerHints', () => {
    it('assigns the person both methods name, whatever the transcript confidence', () => {
        expect(reconcileSpeakerHints(hints('anna', 'anna', CONFIDENT))).toEqual({ personId: 'anna', personSetBy: 'both' });
        expect(reconcileSpeakerHints(hints('anna', 'anna', UNSURE))).toEqual({ personId: 'anna', personSetBy: 'both' });
    });

    it('keeps the voiceprint match when only the voiceprint names someone', () => {
        expect(reconcileSpeakerHints(hints('anna', null))).toEqual({ personId: 'anna', personSetBy: 'voiceprint' });
    });

    it('assigns nobody when the methods confidently disagree', () => {
        expect(reconcileSpeakerHints(hints('anna', 'babis', CONFIDENT))).toEqual({ personId: null, personSetBy: null });
    });

    it('keeps the voiceprint match against an unsure transcript guess', () => {
        expect(reconcileSpeakerHints(hints('anna', 'babis', UNSURE))).toEqual({ personId: 'anna', personSetBy: 'voiceprint' });
    });

    it('assigns a transcript-only hint at the confidence bar, and not below it', () => {
        expect(reconcileSpeakerHints(hints(null, 'babis', CONFIDENT))).toEqual({ personId: 'babis', personSetBy: 'transcript' });
        expect(reconcileSpeakerHints(hints(null, 'babis', UNSURE))).toEqual({ personId: null, personSetBy: null });
        expect(reconcileSpeakerHints(hints(null, 'babis', null))).toEqual({ personId: null, personSetBy: null });
    });

    it('assigns nobody when neither method names someone', () => {
        expect(reconcileSpeakerHints(hints(null, null))).toEqual({ personId: null, personSetBy: null });
    });
});

describe('speakerHintsDisagree', () => {
    it('is true only for two different people with a confident transcript hint', () => {
        expect(speakerHintsDisagree(hints('anna', 'babis', CONFIDENT))).toBe(true);
        expect(speakerHintsDisagree(hints('anna', 'babis', UNSURE))).toBe(false);
        expect(speakerHintsDisagree(hints('anna', 'anna', 100))).toBe(false);
        expect(speakerHintsDisagree(hints('anna', null))).toBe(false);
        expect(speakerHintsDisagree(hints(null, 'babis', 100))).toBe(false);
    });
});

describe('isReviewerAssignment', () => {
    it('protects a reviewer\'s choice, including the choice of nobody', () => {
        expect(isReviewerAssignment({ personId: 'anna', personSetBy: 'user' })).toBe(true);
        expect(isReviewerAssignment({ personId: null, personSetBy: 'user' })).toBe(true);
    });

    it('protects a person with no recorded source', () => {
        expect(isReviewerAssignment({ personId: 'anna', personSetBy: null })).toBe(true);
    });

    it('leaves automatic assignments and untouched tags open', () => {
        expect(isReviewerAssignment({ personId: 'anna', personSetBy: 'voiceprint' })).toBe(false);
        expect(isReviewerAssignment({ personId: 'anna', personSetBy: 'transcript' })).toBe(false);
        expect(isReviewerAssignment({ personId: 'anna', personSetBy: 'both' })).toBe(false);
        expect(isReviewerAssignment({ personId: null, personSetBy: null })).toBe(false);
    });
});

describe('listSpeakerSuggestions', () => {
    it('lists one entry when the methods agree', () => {
        expect(listSpeakerSuggestions(hints('anna', 'anna', 95))).toEqual([{ personId: 'anna', source: 'both' }]);
    });

    it('lists both people when the methods differ, the voiceprint first', () => {
        expect(listSpeakerSuggestions(hints('anna', 'babis', UNSURE))).toEqual([
            { personId: 'anna', source: 'voiceprint' },
            { personId: 'babis', source: 'transcript' },
        ]);
    });

    it('lists the only opinion there is, or nothing', () => {
        expect(listSpeakerSuggestions(hints(null, 'babis', 40))).toEqual([{ personId: 'babis', source: 'transcript' }]);
        expect(listSpeakerSuggestions(hints(null, null))).toEqual([]);
    });
});

describe('speakerHintsStatus', () => {
    it('says whether the methods agree, differ, or only one has an opinion', () => {
        expect(speakerHintsStatus(hints('anna', 'anna', 95))).toBe('agree');
        expect(speakerHintsStatus(hints('anna', 'babis', 95))).toBe('disagree');
        expect(speakerHintsStatus(hints('anna', 'babis', UNSURE))).toBe('disagree');
        expect(speakerHintsStatus(hints('anna', null))).toBe('voiceprintOnly');
        expect(speakerHintsStatus(hints(null, 'babis', 40))).toBe('transcriptOnly');
        expect(speakerHintsStatus(hints(null, null))).toBeNull();
    });
});
