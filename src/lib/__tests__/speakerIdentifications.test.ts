import { isReviewerAssignment, listSpeakerSuggestions, MethodIdentification, reconcileSpeakerIdentifications, speakerIdentificationsDisagree, speakerIdentificationsStatus } from '../speakerIdentifications';

const voiceprint = (personId: string): MethodIdentification => ({ method: 'voiceprint', personId, actionable: true });
/** A name the transcript task would act on by itself, unless said otherwise. */
const transcript = (personId: string, actionable = true, evidence: string | null = null) =>
    ({ method: 'transcript' as const, personId, actionable, evidence });
const TENTATIVE = false;

describe('reconcileSpeakerIdentifications', () => {
    it('assigns the person both methods name, even when the transcript would not act alone', () => {
        expect(reconcileSpeakerIdentifications([voiceprint('anna'), transcript('anna')])).toEqual({ personId: 'anna', personSetBy: 'both' });
        expect(reconcileSpeakerIdentifications([voiceprint('anna'), transcript('anna', TENTATIVE)])).toEqual({ personId: 'anna', personSetBy: 'both' });
    });

    it('keeps the voiceprint match when only the voiceprint names someone', () => {
        expect(reconcileSpeakerIdentifications([voiceprint('anna')])).toEqual({ personId: 'anna', personSetBy: 'voiceprint' });
    });

    it('assigns nobody when both methods would act, on different people', () => {
        expect(reconcileSpeakerIdentifications([voiceprint('anna'), transcript('babis')])).toEqual({ personId: null, personSetBy: null });
    });

    it('keeps the voiceprint match against a name the transcript would not act on', () => {
        expect(reconcileSpeakerIdentifications([voiceprint('anna'), transcript('babis', TENTATIVE)])).toEqual({ personId: 'anna', personSetBy: 'voiceprint' });
    });

    it('assigns a transcript-only name the task would act on, and no other', () => {
        expect(reconcileSpeakerIdentifications([transcript('babis')])).toEqual({ personId: 'babis', personSetBy: 'transcript' });
        expect(reconcileSpeakerIdentifications([transcript('babis', TENTATIVE)])).toEqual({ personId: null, personSetBy: null });
    });

    it('assigns nobody when neither method names someone', () => {
        expect(reconcileSpeakerIdentifications([])).toEqual({ personId: null, personSetBy: null });
    });

    it('goes by who is named and who would act, in whatever order the opinions arrive', () => {
        expect(reconcileSpeakerIdentifications([transcript('anna'), voiceprint('anna')])).toEqual({ personId: 'anna', personSetBy: 'both' });
    });
});

describe('speakerIdentificationsDisagree', () => {
    it('is true only when both methods would act, on different people', () => {
        expect(speakerIdentificationsDisagree([voiceprint('anna'), transcript('babis')])).toBe(true);
        expect(speakerIdentificationsDisagree([voiceprint('anna'), transcript('babis', TENTATIVE)])).toBe(false);
        expect(speakerIdentificationsDisagree([voiceprint('anna'), transcript('anna')])).toBe(false);
        expect(speakerIdentificationsDisagree([voiceprint('anna')])).toBe(false);
        expect(speakerIdentificationsDisagree([transcript('babis')])).toBe(false);
        expect(speakerIdentificationsDisagree([])).toBe(false);
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
    it('lists one entry when the methods agree, with the transcript line it rests on', () => {
        expect(listSpeakerSuggestions([voiceprint('anna'), transcript('anna', true, '[00:01:14] τον λόγο έχει η κ. Άννα')]))
            .toEqual([{ personId: 'anna', source: 'both', evidence: '[00:01:14] τον λόγο έχει η κ. Άννα' }]);
    });

    it('lists both people when the methods differ, the voiceprint first', () => {
        expect(listSpeakerSuggestions([transcript('babis', TENTATIVE, 'κύριε Μπάμπη'), voiceprint('anna')])).toEqual([
            { personId: 'anna', source: 'voiceprint', evidence: null },
            { personId: 'babis', source: 'transcript', evidence: 'κύριε Μπάμπη' },
        ]);
    });

    it('lists the only opinion there is, or nothing', () => {
        expect(listSpeakerSuggestions([transcript('babis', TENTATIVE)])).toEqual([{ personId: 'babis', source: 'transcript', evidence: null }]);
        expect(listSpeakerSuggestions([])).toEqual([]);
    });
});

describe('speakerIdentificationsStatus', () => {
    it('says whether the methods agree, differ, or only one has an opinion', () => {
        expect(speakerIdentificationsStatus([voiceprint('anna'), transcript('anna')])).toBe('agree');
        expect(speakerIdentificationsStatus([voiceprint('anna'), transcript('babis')])).toBe('disagree');
        expect(speakerIdentificationsStatus([voiceprint('anna'), transcript('babis', TENTATIVE)])).toBe('disagree');
        expect(speakerIdentificationsStatus([voiceprint('anna')])).toBe('voiceprintOnly');
        expect(speakerIdentificationsStatus([transcript('babis', TENTATIVE)])).toBe('transcriptOnly');
        expect(speakerIdentificationsStatus([])).toBeNull();
    });
});
