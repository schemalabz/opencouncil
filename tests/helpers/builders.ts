import { Subject, ProcessAgendaResult, SummarizeResult, PollDecisionsResult, PollDecisionsMatch, DocumentRollCall, ExtractedDecisionData } from '@/lib/apiTypes'
import { PersonWithRelations } from '@/lib/db/people'
import { Transcript } from '@/lib/db/transcript'

export function makeSubject(overrides: Partial<Subject> & { name: string; agendaItemIndex: Subject['agendaItemIndex'] }): Subject {
    return {
        description: 'Description',
        introducedByPersonId: null,
        speakerContributions: [],
        topicImportance: 'normal',
        proximityImportance: 'none',
        location: null,
        topicLabel: null,
        context: null,
        ...overrides,
    }
}

export function makeProcessAgendaResult(subjects: Subject[]): ProcessAgendaResult {
    return { subjects }
}

export function makeSummarizeResult(params: {
    speakerSegmentSummaries?: SummarizeResult['speakerSegmentSummaries']
    subjects?: Subject[]
    utteranceDiscussionStatuses?: SummarizeResult['utteranceDiscussionStatuses']
}): SummarizeResult {
    return {
        speakerSegmentSummaries: params.speakerSegmentSummaries ?? [],
        subjects: params.subjects ?? [],
        utteranceDiscussionStatuses: params.utteranceDiscussionStatuses ?? [],
    }
}

export function makePollDecisionsMatch(overrides: Partial<PollDecisionsMatch> & { subjectId: string; ada: string }): PollDecisionsMatch {
    return {
        decisionTitle: 'Decision Title',
        pdfUrl: 'https://example.com/decision.pdf',
        protocolNumber: '1/2025',
        publishDate: '2025-01-15',
        matchConfidence: 0.95,
        ...overrides,
    }
}

/**
 * In-memory speaker segment with speakerTag and utterances.
 * Suitable for mocking getTranscript() return values.
 */
export function makeTranscriptSegment(overrides: {
    id: string
    personId?: string | null
    label?: string
    text?: string
}): Transcript[number] {
    return {
        id: overrides.id,
        meetingId: 'meeting-1',
        cityId: 'city-1',
        speakerTagId: `tag-${overrides.id}`,
        startTimestamp: 0,
        endTimestamp: 60,
        speakerTag: {
            id: `tag-${overrides.id}`,
            personId: overrides.personId ?? null,
            label: overrides.label ?? 'Unknown',
        },
        utterances: [{
            id: `utt-${overrides.id}`,
            text: overrides.text ?? `Text from ${overrides.id}`,
            startTimestamp: 0,
            endTimestamp: 10,
            speakerSegmentId: overrides.id,
        }],
        topicLabels: [],
        summary: null,
    } as unknown as Transcript[number]
}

/**
 * In-memory person with roles for mocking person queries.
 * Roles are pre-populated with party and administrativeBody relations.
 */
export function makePersonWithRoles(overrides: {
    id: string
    name: string
    partyId?: string
    partyName?: string
    roleName?: string
    adminBodyId?: string | null
    cityId?: string
}): PersonWithRelations {
    const cityId = overrides.cityId ?? 'city-1'
    const adminBodyId = overrides.adminBodyId ?? 'admin-body-1'

    return {
        id: overrides.id,
        name: overrides.name,
        name_en: overrides.name,
        name_short: overrides.name,
        name_short_en: overrides.name,
        image: null,
        profileUrl: null,
        cityId,
        roles: overrides.partyId ? [{
            id: `role-${overrides.id}`,
            personId: overrides.id,
            cityId: null,
            partyId: overrides.partyId,
            administrativeBodyId: adminBodyId,
            name: overrides.roleName ?? 'Member',
            name_en: overrides.roleName ?? 'Member',
            startDate: new Date('2020-01-01'),
            endDate: null,
            isHead: false,
            electedOrder: null,
            party: { id: overrides.partyId, name: overrides.partyName ?? 'Party', cityId, logo: null },
            administrativeBody: adminBodyId ? { id: adminBodyId, name: 'Body', name_en: 'Body', type: 'council', cityId } : null,
            city: null,
        }] : [],
    } as unknown as PersonWithRelations
}

export function makePollDecisionsResult(params: {
    decisions?: PollDecisionsResult['decisions']
    matches?: PollDecisionsMatch[]
    reassignments?: PollDecisionsResult['reassignments']
    unmatchedSubjects?: PollDecisionsResult['unmatchedSubjects']
    ambiguousSubjects?: PollDecisionsResult['ambiguousSubjects']
    extractions?: PollDecisionsResult['extractions']
    usage?: PollDecisionsResult['usage']
}): PollDecisionsResult {
    // The meeting's roll call is a field of its own: the task resolves one across
    // the documents and sends it as `initialAttendance`, and that alone is what
    // per-subject rows are replayed from. A one-document fixture has nothing to
    // resolve, so its document's roll call is the meeting's and standing it up
    // here keeps those fixtures short. With several, only the caller knows which
    // one wins — promoting the first would let a fixture pass on attendance no
    // real callback would have sent.
    const given = params.extractions ?? null
    let extractions = given
    if (given && !given.initialAttendance) {
        const stated = given.decisions.map(d => d.rollCall).filter(r => r?.presentIds.length || r?.absentIds.length)
        if (stated.length > 1) {
            throw new Error('makePollDecisionsResult: several documents state a roll call. Pass extractions.initialAttendance — only you know which one the task would have resolved.')
        }
        const rollCall = stated[0]
        if (rollCall) {
            // A new object: a caller's `extractions` reused for a second result would
            // otherwise arrive at it already carrying the first one's roll call.
            extractions = {
                ...given,
                initialAttendance: [
                    ...rollCall.presentIds.map(personId => ({ personId, status: 'PRESENT' as const })),
                    ...rollCall.absentIds.map(personId => ({ personId, status: 'ABSENT' as const })),
                ],
            }
        }
    }
    return {
        ...(params.decisions ? { decisions: params.decisions } : {}),
        matches: params.matches ?? [],
        reassignments: params.reassignments ?? [],
        unmatchedSubjects: params.unmatchedSubjects ?? [],
        ambiguousSubjects: params.ambiguousSubjects ?? [],
        extractions,
        usage: params.usage ?? { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }
}

/**
 * A document as task v4 sends it. Callers say who the page's roll call states
 * present and absent the short way, with `rollCallPresent` / `rollCallAbsent`,
 * and this states it as that document's roll call — which is what every
 * per-subject row is derived from. A caller passing its own `rollCall` keeps it;
 * one passing neither states none, which is a meeting the derivation declines to
 * write rows for.
 *
 * The deprecated v3 `presentMemberIds` / `absentMemberIds` are not emitted: v4
 * ignores them, and a result carrying both was a shape no callback sends.
 * `layout` and the page's own words for the two lists are the caller's to give —
 * raw names equal to person ids are something no reading produces.
 */
export function makeExtractedDecision({ rollCallPresent, rollCallAbsent, rollCallLayout, rollCallPresentNames, rollCallAbsentNames, ...overrides }: Partial<ExtractedDecisionData> & {
    subjectId: string
    /** Ids the page's roll call states present, and absent. */
    rollCallPresent?: string[]
    rollCallAbsent?: string[]
    /** How the page laid the roll call out, and its own words for the two lists. */
    rollCallLayout?: DocumentRollCall['layout']
    rollCallPresentNames?: string[]
    rollCallAbsentNames?: string[]
}): ExtractedDecisionData {
    const presentIds = rollCallPresent ?? []
    const absentIds = rollCallAbsent ?? []
    const rollCall = overrides.rollCall !== undefined
        ? overrides.rollCall
        : (presentIds.length || absentIds.length)
            ? {
                layout: rollCallLayout ?? 'present_and_absent',
                composition: [],
                present: rollCallPresentNames ?? [],
                absent: rollCallAbsentNames ?? [],
                presentIds,
                absentIds,
            }
            : null
    return {
        excerpt: '',
        references: '',
        voteResult: null,
        voteDetails: [],
        unmatchedMembers: [],
        subjectInfo: null,
        ...overrides,
        rollCall,
    }
}
