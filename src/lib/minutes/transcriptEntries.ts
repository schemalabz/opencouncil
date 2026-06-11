import { MinutesTranscriptEntry, MinutesSpeakerEntry, MinutesCrossSubjectEntry } from './types';

export interface TranscriptUtterance {
    id: string;
    text: string;
    startTimestamp: number;
    endTimestamp: number;
    discussionStatus?: string | null;
    discussionSubjectId?: string | null;
    speakerSegment: {
        speakerTag: {
            label: string | null;
            personId: string | null;
        };
    };
}

export interface SpeakerInfo {
    speakerName: string;
    party: string | null;
    isPartyHead: boolean;
    role: string | null;
}

export type SpeakerResolver = (personId: string | null, label: string | null) => SpeakerInfo;

export interface CrossSubjectInfo {
    /** Map of utterance ID → the subjectId this utterance is actually linked to */
    crossSubjectUtterances: Map<string, string>;
    /** Map of subjectId → subject name, for annotation labels */
    subjectNames: Map<string, string>;
}

export function buildTranscriptEntriesFromUtterances(
    utterances: TranscriptUtterance[],
    resolveSpeaker: SpeakerResolver,
    crossSubjectInfo?: CrossSubjectInfo,
): MinutesTranscriptEntry[] {
    if (utterances.length === 0) return [];

    const entries: MinutesTranscriptEntry[] = [];
    let currentPersonId: string | null | undefined = undefined;
    let currentLabel: string | null | undefined = undefined;
    let currentTexts: string[] = [];
    let currentTimestamp = 0;
    let inCrossSubject: string | null = null;
    let currentDebugStatus: string | null | undefined = undefined;
    let currentDebugSubjectId: string | null | undefined = undefined;

    function flushCurrentBlock() {
        if (currentTexts.length > 0 && currentPersonId !== undefined) {
            const info = resolveSpeaker(currentPersonId, currentLabel ?? null);
            const entry: MinutesSpeakerEntry = {
                type: 'speaker',
                speakerName: info.speakerName,
                party: info.party,
                isPartyHead: info.isPartyHead,
                role: info.role,
                text: currentTexts.join(' '),
                timestamp: currentTimestamp,
                debugStatus: currentDebugStatus ?? null,
                debugSubjectId: currentDebugSubjectId ?? null,
            };
            entries.push(entry);
        }
    }

    for (const u of utterances) {
        if (crossSubjectInfo) {
            const crossSubjectId = crossSubjectInfo.crossSubjectUtterances.get(u.id) ?? null;

            if (crossSubjectId && crossSubjectId !== inCrossSubject) {
                flushCurrentBlock();
                currentPersonId = undefined;
                currentTexts = [];
                currentDebugStatus = undefined;
                currentDebugSubjectId = undefined;
                // Close the previous cross-subject block before opening a new one
                if (inCrossSubject) {
                    entries.push({
                        type: 'cross-subject',
                        direction: 'end',
                        subject: { id: inCrossSubject, name: crossSubjectInfo.subjectNames.get(inCrossSubject) ?? inCrossSubject },
                    });
                }
                const name = crossSubjectInfo.subjectNames.get(crossSubjectId) ?? crossSubjectId;
                entries.push({
                    type: 'cross-subject',
                    direction: 'start',
                    subject: { id: crossSubjectId, name },
                });
                inCrossSubject = crossSubjectId;
            } else if (!crossSubjectId && inCrossSubject) {
                flushCurrentBlock();
                currentPersonId = undefined;
                currentTexts = [];
                currentDebugStatus = undefined;
                currentDebugSubjectId = undefined;
                entries.push({
                    type: 'cross-subject',
                    direction: 'end',
                    subject: { id: inCrossSubject, name: crossSubjectInfo.subjectNames.get(inCrossSubject) ?? inCrossSubject },
                });
                inCrossSubject = null;
            }
        }

        const tag = u.speakerSegment.speakerTag;
        const isSameSpeaker =
            currentPersonId !== undefined &&
            tag.personId === currentPersonId &&
            (tag.personId !== null || tag.label === currentLabel);

        if (isSameSpeaker) {
            currentTexts.push(u.text);
        } else {
            flushCurrentBlock();
            currentPersonId = tag.personId;
            currentLabel = tag.label;
            currentTexts = [u.text];
            currentTimestamp = u.startTimestamp;
            currentDebugStatus = u.discussionStatus ?? null;
            currentDebugSubjectId = u.discussionSubjectId ?? null;
        }
    }

    flushCurrentBlock();

    if (inCrossSubject && crossSubjectInfo) {
        entries.push({
            type: 'cross-subject',
            direction: 'end',
            subject: { id: inCrossSubject, name: crossSubjectInfo.subjectNames.get(inCrossSubject) ?? inCrossSubject },
        });
    }

    return entries;
}
