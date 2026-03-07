import { EditAction, invertAction, getActionLabel } from '../editActions';

describe('editActions', () => {
    describe('invertAction', () => {
        it('inverts TEXT_EDIT', () => {
            const action: EditAction = {
                type: 'TEXT_EDIT',
                payload: {
                    utteranceId: 'u1',
                    previousState: { text: 'old', startTimestamp: 1, endTimestamp: 2 },
                    nextState: { text: 'new', startTimestamp: 1, endTimestamp: 2 }
                }
            };
            const inverted = invertAction(action);
            expect(inverted).toEqual({
                type: 'TEXT_EDIT',
                payload: {
                    utteranceId: 'u1',
                    previousState: { text: 'new', startTimestamp: 1, endTimestamp: 2 },
                    nextState: { text: 'old', startTimestamp: 1, endTimestamp: 2 }
                }
            });
        });

        it('inverts MOVE_UTTERANCE (previous -> next)', () => {
            const action: EditAction = {
                type: 'MOVE_UTTERANCE',
                payload: {
                    utteranceId: 'u1',
                    fromSegmentId: 's1',
                    toSegmentId: 's2',
                    direction: 'previous'
                }
            };
            const inverted = invertAction(action);
            expect(inverted).toEqual({
                type: 'MOVE_UTTERANCE',
                payload: {
                    utteranceId: 'u1',
                    fromSegmentId: 's2',
                    toSegmentId: 's1',
                    direction: 'next'
                }
            });
        });

        it('inverts MOVE_UTTERANCE (next -> previous)', () => {
            const action: EditAction = {
                type: 'MOVE_UTTERANCE',
                payload: {
                    utteranceId: 'u1',
                    fromSegmentId: 's2',
                    toSegmentId: 's1',
                    direction: 'next'
                }
            };
            const inverted = invertAction(action);
            expect(inverted).toEqual({
                type: 'MOVE_UTTERANCE',
                payload: {
                    utteranceId: 'u1',
                    fromSegmentId: 's1',
                    toSegmentId: 's2',
                    direction: 'previous'
                }
            });
        });

        it('inverts SPEAKER_ASSIGNMENT', () => {
            const action: EditAction = {
                type: 'SPEAKER_ASSIGNMENT',
                payload: {
                    speakerTagId: 't1',
                    previousPersonId: 'p1',
                    nextPersonId: 'p2'
                }
            };
            const inverted = invertAction(action);
            expect(inverted).toEqual({
                type: 'SPEAKER_ASSIGNMENT',
                payload: {
                    speakerTagId: 't1',
                    previousPersonId: 'p2',
                    nextPersonId: 'p1'
                }
            });
        });

        it('inverts SPEAKER_LABEL', () => {
            const action: EditAction = {
                type: 'SPEAKER_LABEL',
                payload: {
                    speakerTagId: 't1',
                    previousLabel: 'old label',
                    nextLabel: 'new label'
                }
            };
            const inverted = invertAction(action);
            expect(inverted).toEqual({
                type: 'SPEAKER_LABEL',
                payload: {
                    speakerTagId: 't1',
                    previousLabel: 'new label',
                    nextLabel: 'old label'
                }
            });
        });

        it('is reversible (double inversion)', () => {
            const action: EditAction = {
                type: 'TEXT_EDIT',
                payload: {
                    utteranceId: 'u1',
                    previousState: { text: 'old', startTimestamp: 1, endTimestamp: 2 },
                    nextState: { text: 'new', startTimestamp: 1, endTimestamp: 2 }
                }
            };
            expect(invertAction(invertAction(action))).toEqual(action);
        });
    });

    describe('getActionLabel', () => {
        const t = (key: string) => `key:${key}`;

        it('returns correct label for TEXT_EDIT', () => {
            expect(getActionLabel({ type: 'TEXT_EDIT' } as any, t)).toBe('key:textEdit');
        });

        it('returns correct label for MOVE_UTTERANCE', () => {
            expect(getActionLabel({ type: 'MOVE_UTTERANCE' } as any, t)).toBe('key:moveUtterance');
        });

        it('returns correct label for SPEAKER_ASSIGNMENT', () => {
            expect(getActionLabel({ type: 'SPEAKER_ASSIGNMENT' } as any, t)).toBe('key:speakerAssignment');
        });

        it('returns correct label for SPEAKER_LABEL', () => {
            expect(getActionLabel({ type: 'SPEAKER_LABEL' } as any, t)).toBe('key:speakerLabel');
        });
    });
});
