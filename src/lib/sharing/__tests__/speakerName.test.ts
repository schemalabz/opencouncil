import { sharedSpeakerName } from '../speakerName';

const labels = { unknownSpeaker: 'Unknown speaker', unverified: 'unverified' };

describe('sharedSpeakerName', () => {
    it('labels an unverified name', () => {
        expect(sharedSpeakerName('Anna', true, labels)).toBe('Anna (unverified)');
    });

    it('keeps a verified name as it is', () => {
        expect(sharedSpeakerName('Anna', false, labels)).toBe('Anna');
    });

    it('gives the unknown speaker text, without a label, when there is no name', () => {
        expect(sharedSpeakerName(null, true, labels)).toBe('Unknown speaker');
    });
});
