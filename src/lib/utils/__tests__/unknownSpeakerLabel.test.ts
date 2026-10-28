import { Realm } from '@prisma/client';
import { REALMS } from '@/lib/realm';
import el from '../../../../messages/el/editing.json';
import en from '../../../../messages/en/editing.json';
import fr from '../../../../messages/fr/editing.json';
import sr from '../../../../messages/sr/editing.json';
import {
    buildUnknownSpeakerLabel, isUnknownSpeakerLabel, lastUnknownSpeakerIndex, parseUnknownSpeakerLabel,
} from '../unknownSpeakerLabel';

describe('buildUnknownSpeakerLabel', () => {
    it('writes the label in the UI language of the realm', () => {
        expect(buildUnknownSpeakerLabel(5, 'greece')).toBe('Άγνωστος Ομιλητής 5');
        expect(buildUnknownSpeakerLabel(5, 'cyprus')).toBe('Άγνωστος Ομιλητής 5');
        expect(buildUnknownSpeakerLabel(2, 'france')).toBe('Intervenant inconnu 2');
        expect(buildUnknownSpeakerLabel(2, 'serbia')).toBe('Непознат говорник 2');
        expect(buildUnknownSpeakerLabel(1, 'poland')).toBe('Unknown Speaker 1');
    });

    it('uses the unknownSpeaker message of the editing catalog of each realm language', () => {
        const catalogs: Record<string, { actions: { unknownSpeaker: string } }> = { el, en, fr, sr };
        for (const realm of Object.values(Realm)) {
            const words = catalogs[REALMS[realm].defaultLocale].actions.unknownSpeaker;
            expect(buildUnknownSpeakerLabel(7, realm)).toBe(`${words} 7`);
        }
    });
});

describe('parseUnknownSpeakerLabel', () => {
    it('reads the label of every realm language, with its index', () => {
        for (const realm of Object.values(Realm)) {
            expect(parseUnknownSpeakerLabel(buildUnknownSpeakerLabel(12, realm))).toEqual({ index: 12 });
        }
    });

    it('reads the words without a number as an unknown speaker with no index', () => {
        expect(parseUnknownSpeakerLabel('Άγνωστος Ομιλητής')).toEqual({ index: null });
        expect(parseUnknownSpeakerLabel('Άγνωστος Ομιλητής Β')).toEqual({ index: null });
    });

    it('refuses any other label', () => {
        for (const label of ['SPEAKER_3', 'Μαρία Παπαδοπούλου', 'Speaker 1', 'unknown speaker 2', '', null, undefined]) {
            expect(parseUnknownSpeakerLabel(label)).toBeNull();
            expect(isUnknownSpeakerLabel(label)).toBe(false);
        }
    });
});

describe('lastUnknownSpeakerIndex', () => {
    it('takes the highest index over the labels of every language', () => {
        expect(lastUnknownSpeakerIndex(['Άγνωστος Ομιλητής 4', 'Unknown Speaker 9', 'SPEAKER_12', null, 'Άγνωστος Ομιλητής'])).toBe(9);
        expect(lastUnknownSpeakerIndex([])).toBe(0);
    });
});
