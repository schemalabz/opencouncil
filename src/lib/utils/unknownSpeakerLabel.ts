import type { Realm } from '@prisma/client';
import { REALMS } from '@/lib/realm';

type RealmLocale = (typeof REALMS)[Realm]['defaultLocale'];

/**
 * The words of an unknown speaker label in the UI language of each realm. Each
 * one is the `actions.unknownSpeaker` message of `messages/<locale>/editing.json`,
 * and a test keeps the two equal. The transcript editor imports this module, so
 * it does not import the catalogs: they would go into the client bundle.
 */
const UNKNOWN_SPEAKER_WORDS: Record<RealmLocale, string> = {
    el: 'Άγνωστος Ομιλητής',
    fr: 'Intervenant inconnu',
    sr: 'Непознат говорник',
    en: 'Unknown Speaker',
};

const ALL_UNKNOWN_SPEAKER_WORDS = Object.values(UNKNOWN_SPEAKER_WORDS);

/**
 * The label of the `index`th unknown speaker of a meeting, «Άγνωστος Ομιλητής 5»,
 * in the UI language of the realm of the meeting's city. `SpeakerTag.label` keeps
 * it as plain text, so every reader shows it as it is.
 */
export function buildUnknownSpeakerLabel(index: number, realm: Realm): string {
    return `${UNKNOWN_SPEAKER_WORDS[REALMS[realm].defaultLocale]} ${index}`;
}

/**
 * Reads a label that buildUnknownSpeakerLabel wrote, in the language of any
 * realm: Greek labels stay in the data of every Greek city. Null for a label
 * that does not start with the words of an unknown speaker. The index is null
 * when the words have no number after them.
 */
export function parseUnknownSpeakerLabel(label: string | null | undefined): { index: number | null } | null {
    if (!label) return null;
    const words = ALL_UNKNOWN_SPEAKER_WORDS.find(candidate => label.startsWith(candidate));
    if (words === undefined) return null;
    const number = label.slice(words.length).match(/^ (\d+)$/)?.[1];
    return { index: number === undefined ? null : Number(number) };
}

/** Whether a label is the label of an unknown speaker, in the language of any realm. */
export function isUnknownSpeakerLabel(label: string | null | undefined): boolean {
    return parseUnknownSpeakerLabel(label) !== null;
}

/** The highest index among the unknown speaker labels, 0 when there is none. */
export function lastUnknownSpeakerIndex(labels: (string | null | undefined)[]): number {
    return Math.max(0, ...labels.map(label => parseUnknownSpeakerLabel(label)?.index ?? 0));
}
