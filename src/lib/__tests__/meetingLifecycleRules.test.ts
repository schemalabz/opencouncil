import {
    validateMeetingRecord,
    type LifecycleContext,
    type MeetingRecordState,
} from '../meetingLifecycleRules';

const MARCH_12 = new Date('2026-03-12T16:00:00Z');
const MARCH_13 = new Date('2026-03-13T16:00:00Z');

function state(overrides: Partial<MeetingRecordState> = {}): MeetingRecordState {
    return {
        id: 'b',
        administrativeBodyId: 'council',
        dateTime: MARCH_12,
        scheduleStatus: 'scheduled',
        scheduleStatusReason: null,
        kind: 'regular',
        sessionNumber: null,
        format: 'inPerson',
        postponedFromId: null,
        continuationOfId: null,
        ...overrides,
    };
}

function context(overrides: Partial<LifecycleContext> = {}): LifecycleContext {
    return {
        body: { type: 'council' },
        postponedFrom: null,
        postponedTo: null,
        chainReachesSelf: false,
        continuationOf: null,
        continuations: [],
        ...overrides,
    };
}

function codes(next: MeetingRecordState, ctx: LifecycleContext) {
    return validateMeetingRecord(next, ctx).map((error) => error.code);
}

describe('validateMeetingRecord', () => {
    it('accepts a regular meeting with no links', () => {
        expect(codes(state(), context())).toEqual([]);
    });

    it('keeps λογοδοσία and απολογισμός for the council', () => {
        const committee = context({ body: { type: 'committee' } });
        expect(codes(state({ kind: 'accountability' }), committee)).toEqual(['councilOnlyKind']);
        expect(codes(state({ kind: 'annualReport' }), committee)).toEqual(['councilOnlyKind']);
        expect(codes(state({ kind: 'accountability' }), context())).toEqual([]);
        // A meeting with no body reads as the council's everywhere.
        expect(codes(state({ kind: 'accountability', administrativeBodyId: null }), context({ body: null }))).toEqual([]);
    });

    it('keeps the meeting by circulation for the council', () => {
        expect(codes(state({ format: 'byCirculation' }), context({ body: { type: 'community' } }))).toEqual(['councilOnlyFormat']);
        expect(codes(state({ format: 'byCirculation' }), context())).toEqual([]);
    });

    describe('postponement', () => {
        const postponedA = { administrativeBodyId: 'council', scheduleStatus: 'postponed' as const };

        it('accepts a link to a postponed meeting of the same body', () => {
            expect(codes(state({ postponedFromId: 'a' }), context({ postponedFrom: postponedA }))).toEqual([]);
        });

        it('refuses a link to a meeting that does not exist', () => {
            expect(codes(state({ postponedFromId: 'a' }), context({ postponedFrom: 'missing' }))).toEqual(['postponedFromMissing']);
        });

        it('refuses a link to a meeting that is not postponed', () => {
            const scheduledA = { ...postponedA, scheduleStatus: 'scheduled' as const };
            expect(codes(state({ postponedFromId: 'a' }), context({ postponedFrom: scheduledA }))).toEqual(['postponedFromNotPostponed']);
        });

        it('refuses a link across bodies, in both directions', () => {
            const otherBody = { ...postponedA, administrativeBodyId: 'committee' };
            expect(codes(state({ postponedFromId: 'a' }), context({ postponedFrom: otherBody }))).toEqual(['postponedFromOtherBody']);
            // Moving the new meeting to another body breaks its link as well.
            expect(codes(state({ postponedFromId: 'a', administrativeBodyId: 'committee' }), context({ body: { type: 'committee' }, postponedFrom: postponedA })))
                .toEqual(['postponedFromOtherBody']);
            // And moving the postponed meeting breaks the link of its new meeting.
            expect(codes(state({ scheduleStatus: 'postponed', administrativeBodyId: 'committee' }), context({ body: { type: 'committee' }, postponedTo: { administrativeBodyId: 'council' } })))
                .toEqual(['postponedToOtherBody']);
        });

        it('refuses a cycle', () => {
            expect(codes(state({ postponedFromId: 'a' }), context({ postponedFrom: postponedA, chainReachesSelf: true }))).toEqual(['postponementCycle']);
        });

        it('refuses to change the status of a postponed meeting that has its new meeting', () => {
            const linked = context({ postponedTo: { administrativeBodyId: 'council' } });
            expect(codes(state({ scheduleStatus: 'cancelled' }), linked)).toEqual(['postponedMeetingIsLinked']);
            expect(codes(state({ scheduleStatus: 'postponed' }), linked)).toEqual([]);
        });
    });

    describe('continuation', () => {
        const firstPart = { administrativeBodyId: 'council', continuationOfId: null, dateTime: MARCH_12 };
        const part = state({ id: 'part', dateTime: MARCH_13, continuationOfId: 'first', kind: null });

        it('accepts a later part of the same body with no kind and no number', () => {
            expect(codes(part, context({ continuationOf: firstPart }))).toEqual([]);
        });

        it('refuses a part that points to another part', () => {
            expect(codes(part, context({ continuationOf: { ...firstPart, continuationOfId: 'zero' } }))).toEqual(['continuationTargetIsPart']);
        });

        it('refuses a first part that already has parts', () => {
            expect(codes(part, context({ continuationOf: firstPart, continuations: [{ administrativeBodyId: 'council', dateTime: new Date('2026-03-14T16:00:00Z') }] })))
                .toContain('continuationHasParts');
        });

        it('refuses a part that is not later, or of another body', () => {
            expect(codes({ ...part, dateTime: MARCH_12 }, context({ continuationOf: firstPart }))).toEqual(['continuationNotLater']);
            expect(codes(part, context({ continuationOf: { ...firstPart, administrativeBodyId: 'committee' } }))).toEqual(['continuationOtherBody']);
        });

        it('refuses a part that carries a kind or a number', () => {
            expect(codes({ ...part, kind: 'regular' }, context({ continuationOf: firstPart }))).toEqual(['continuationOwnsNothing']);
            expect(codes({ ...part, sessionNumber: 4 }, context({ continuationOf: firstPart }))).toEqual(['continuationOwnsNothing']);
        });

        it('refuses to move a first part after its parts or to another body', () => {
            const parts = [{ administrativeBodyId: 'council', dateTime: MARCH_13 }];
            expect(codes(state({ dateTime: MARCH_13 }), context({ continuations: parts }))).toEqual(['partsNotLater']);
            expect(codes(state({ administrativeBodyId: 'committee' }), context({ body: { type: 'committee' }, continuations: parts }))).toEqual(['partsOtherBody']);
        });
    });

    it('refuses a session number below 1 and a long reason', () => {
        expect(codes(state({ sessionNumber: 0 }), context())).toEqual(['sessionNumberPositive']);
        expect(codes(state({ sessionNumber: 1 }), context())).toEqual([]);
        expect(codes(state({ scheduleStatus: 'cancelled', scheduleStatusReason: 'x'.repeat(501) }), context())).toEqual(['reasonTooLong']);
    });
});
