import { Subject, ProcessAgendaResult, SummarizeResult } from '@/lib/apiTypes'

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
