import { Subject, ProcessAgendaResult, SummarizeResult, PollDecisionsResult, PollDecisionsMatch, ExtractedDecisionData } from '@/lib/apiTypes'
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
            rank: null,
            party: { id: overrides.partyId, name: overrides.partyName ?? 'Party', cityId, logo: null },
            administrativeBody: adminBodyId ? { id: adminBodyId, name: 'Body', name_en: 'Body', type: 'council', cityId } : null,
            city: null,
        }] : [],
    } as unknown as PersonWithRelations
}

export function makePollDecisionsResult(params: {
    matches?: PollDecisionsMatch[]
    reassignments?: PollDecisionsResult['reassignments']
    unmatchedSubjects?: PollDecisionsResult['unmatchedSubjects']
    ambiguousSubjects?: PollDecisionsResult['ambiguousSubjects']
    extractions?: PollDecisionsResult['extractions']
    costs?: PollDecisionsResult['costs']
}): PollDecisionsResult {
    return {
        matches: params.matches ?? [],
        reassignments: params.reassignments ?? [],
        unmatchedSubjects: params.unmatchedSubjects ?? [],
        ambiguousSubjects: params.ambiguousSubjects ?? [],
        extractions: params.extractions ?? null,
        costs: params.costs ?? { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }
}

export function makeExtractedDecision(overrides: Partial<ExtractedDecisionData> & { subjectId: string }): ExtractedDecisionData {
    return {
        excerpt: '',
        references: '',
        presentMemberIds: [],
        absentMemberIds: [],
        voteResult: null,
        voteDetails: [],
        unmatchedMembers: [],
        subjectInfo: null,
        ...overrides,
    }
}
