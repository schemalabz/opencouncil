import { Subject, ProcessAgendaResult, SummarizeResult, PollDecisionsResult, PollDecisionsMatch } from '@/lib/apiTypes'

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

export function makePollDecisionsResult(params: {
    matches?: PollDecisionsMatch[]
    reassignments?: PollDecisionsResult['reassignments']
    unmatchedSubjects?: PollDecisionsResult['unmatchedSubjects']
    ambiguousSubjects?: PollDecisionsResult['ambiguousSubjects']
}): PollDecisionsResult {
    return {
        matches: params.matches ?? [],
        reassignments: params.reassignments ?? [],
        unmatchedSubjects: params.unmatchedSubjects ?? [],
        ambiguousSubjects: params.ambiguousSubjects ?? [],
    }
}
