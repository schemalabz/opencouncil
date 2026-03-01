export type TextState = {
    text: string;
    startTimestamp: number;
    endTimestamp: number;
};

export type EditAction =
    | { type: 'TEXT_EDIT'; payload: { utteranceId: string; previousState: TextState; nextState: TextState } }
    | { type: 'MOVE_UTTERANCE'; payload: { utteranceId: string; fromSegmentId: string; toSegmentId: string; direction: 'previous' | 'next' } }
    | { type: 'SPEAKER_ASSIGNMENT'; payload: { speakerTagId: string; previousPersonId: string | null; nextPersonId: string | null } }
    | { type: 'SPEAKER_LABEL'; payload: { speakerTagId: string; previousLabel: string; nextLabel: string } };

export function invertAction(action: EditAction): EditAction {
    switch (action.type) {
        case 'TEXT_EDIT':
            return {
                type: 'TEXT_EDIT',
                payload: {
                    utteranceId: action.payload.utteranceId,
                    previousState: action.payload.nextState,
                    nextState: action.payload.previousState
                }
            };
        case 'MOVE_UTTERANCE':
            return {
                type: 'MOVE_UTTERANCE',
                payload: {
                    utteranceId: action.payload.utteranceId,
                    fromSegmentId: action.payload.toSegmentId,
                    toSegmentId: action.payload.fromSegmentId,
                    direction: action.payload.direction === 'previous' ? 'next' : 'previous'
                }
            };
        case 'SPEAKER_ASSIGNMENT':
            return {
                type: 'SPEAKER_ASSIGNMENT',
                payload: {
                    speakerTagId: action.payload.speakerTagId,
                    previousPersonId: action.payload.nextPersonId,
                    nextPersonId: action.payload.previousPersonId
                }
            };
        case 'SPEAKER_LABEL':
            return {
                type: 'SPEAKER_LABEL',
                payload: {
                    speakerTagId: action.payload.speakerTagId,
                    previousLabel: action.payload.nextLabel,
                    nextLabel: action.payload.previousLabel
                }
            };
    }
}

export function getActionLabel(action: EditAction, t: (key: string) => string): string {
    switch (action.type) {
        case 'TEXT_EDIT':
            return t('textEdit');
        case 'MOVE_UTTERANCE':
            return t('moveUtterance');
        case 'SPEAKER_ASSIGNMENT':
            return t('speakerAssignment');
        case 'SPEAKER_LABEL':
            return t('speakerLabel');
    }
}
