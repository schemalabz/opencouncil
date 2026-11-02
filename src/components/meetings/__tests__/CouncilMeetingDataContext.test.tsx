import React from 'react';
import { render, act } from '@testing-library/react';

import { CouncilMeetingDataProvider, useCouncilMeetingActions, useCouncilMeetingData } from '../CouncilMeetingDataContext';
import type { MeetingData } from '@/lib/getMeetingData';

jest.mock('@/lib/actions/speakerTags', () => ({ assignSpeaker: jest.fn() }));
jest.mock('@/lib/db/speakerSegments', () => ({ addUtteranceToSegment: jest.fn(), updateSpeakerSegmentData: jest.fn() }));

import { addUtteranceToSegment, updateSpeakerSegmentData } from '@/lib/db/speakerSegments';
const mockAddUtterance = addUtteranceToSegment as jest.Mock;
const mockUpdateSegment = updateSpeakerSegmentData as jest.Mock;

const data = {
    meeting: { id: 'meeting-1', cityId: 'city-1' },
    people: [],
    parties: [],
    speakerTags: [{ id: 'tag-1' }],
    highlights: [],
    transcript: [
        {
            id: 'segment-a',
            startTimestamp: 10,
            endTimestamp: 25,
            speakerTagId: 'tag-1',
            speakerTag: { id: 'tag-1' },
            utterances: [
                { id: 'u-1', text: 'one', startTimestamp: 10, endTimestamp: 15 },
                { id: 'u-2', text: 'two', startTimestamp: 20, endTimestamp: 25 },
            ],
        },
    ],
} as unknown as MeetingData;

let actions: ReturnType<typeof useCouncilMeetingActions>;
let transcript: ReturnType<typeof useCouncilMeetingData>['transcript'];

function Harness() {
    actions = useCouncilMeetingActions();
    transcript = useCouncilMeetingData().transcript;
    return null;
}

const utteranceIds = () => transcript.flatMap(s => s.utterances.map(u => u.id));

describe('deleteUtterances', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    function renderProvider() {
        render(
            <CouncilMeetingDataProvider data={data}>
                <Harness />
            </CouncilMeetingDataProvider>,
        );
    }

    it('restores the utterances when the server refuses the deletion', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false });
        renderProvider();

        await act(async () => {
            await expect(actions.deleteUtterances(['u-1'])).rejects.toThrow();
        });

        expect(utteranceIds()).toEqual(['u-1', 'u-2']);
    });

    it('restores the utterances when the request never reaches the server', async () => {
        global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        renderProvider();

        await act(async () => {
            await expect(actions.deleteUtterances(['u-1'])).rejects.toThrow('Failed to fetch');
        });

        expect(utteranceIds()).toEqual(['u-1', 'u-2']);
    });

    it('keeps the deletion when the server accepts it', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true });
        renderProvider();

        await act(async () => {
            await actions.deleteUtterances(['u-1']);
        });

        expect(utteranceIds()).toEqual(['u-2']);
    });

    it('keeps an edit made while the failed deletion was in flight', async () => {
        let rejectFetch: (error: Error) => void = () => {};
        global.fetch = jest.fn(() => new Promise((_resolve, reject) => { rejectFetch = reject; })) as unknown as typeof fetch;
        renderProvider();

        let deletion: Promise<void> = Promise.resolve();
        act(() => {
            deletion = actions.deleteUtterances(['u-1']);
        });
        expect(utteranceIds()).toEqual(['u-2']);

        act(() => {
            actions.updateUtterance('segment-a', 'u-2', { text: 'edited' });
        });
        await act(async () => {
            rejectFetch(new TypeError('Failed to fetch'));
            await expect(deletion).rejects.toThrow('Failed to fetch');
        });

        const utterances = transcript.flatMap(s => s.utterances);
        expect(utterances.map(u => u.id)).toEqual(['u-1', 'u-2']);
        expect(utterances.map(u => u.text)).toEqual(['one', 'edited']);
        expect(transcript[0].startTimestamp).toBe(10);
        expect(transcript[0].endTimestamp).toBe(25);
    });
    it.each([
        ['before the deletion finishes', true],
        ['after the deletion finishes', false],
    ])('keeps a deleted utterance out of a segment the server returns %s', async (_label, addFirst) => {
        let resolveFetch: (value: { ok: boolean }) => void = () => {};
        global.fetch = jest.fn(() => new Promise(resolve => { resolveFetch = resolve; })) as unknown as typeof fetch;
        // The add request reached the server before the deletion committed, so
        // its response still holds the deleted utterance.
        let resolveAdd: (segment: unknown) => void = () => {};
        mockAddUtterance.mockReturnValue(new Promise(resolve => { resolveAdd = resolve; }));
        renderProvider();

        let deletion: Promise<void> = Promise.resolve();
        let adding: Promise<string> = Promise.resolve('');
        act(() => {
            deletion = actions.deleteUtterances(['u-1']);
            adding = actions.addUtteranceToSegment('segment-a');
        });
        const staleSegment = {
            ...data.transcript[0],
            endTimestamp: 30,
            utterances: [
                ...data.transcript[0].utterances,
                { id: 'u-3', text: '', startTimestamp: 25, endTimestamp: 30 },
            ],
        };
        const finishAdd = async () => { resolveAdd(staleSegment); await adding; };
        const finishDelete = async () => { resolveFetch({ ok: true }); await deletion; };

        await act(async () => {
            if (addFirst) { await finishAdd(); await finishDelete(); }
            else { await finishDelete(); await finishAdd(); }
        });

        expect(utteranceIds()).toEqual(['u-2', 'u-3']);
        expect(transcript[0].startTimestamp).toBe(20);
    });
    it('keeps a server edit of an utterance whose deletion then fails', async () => {
        let resolveFetch: (value: { ok: boolean }) => void = () => {};
        global.fetch = jest.fn(() => new Promise(resolve => { resolveFetch = resolve; })) as unknown as typeof fetch;
        const editedSegment = {
            ...data.transcript[0],
            utterances: [
                { ...data.transcript[0].utterances[0], text: 'one, edited' },
                data.transcript[0].utterances[1],
            ],
        };
        mockUpdateSegment.mockResolvedValue(editedSegment);
        renderProvider();

        let deletion: Promise<void> = Promise.resolve();
        act(() => {
            deletion = actions.deleteUtterances(['u-1']);
        });
        await act(async () => {
            await actions.updateSpeakerSegmentData('segment-a', {} as never);
        });
        await act(async () => {
            resolveFetch({ ok: false });
            await expect(deletion).rejects.toThrow();
        });

        const utterances = transcript.flatMap(s => s.utterances);
        expect(utterances.map(u => [u.id, u.text])).toEqual([['u-1', 'one, edited'], ['u-2', 'two']]);
    });
    it('does not bring back a confirmed deletion when a later deletion of it fails', async () => {
        const fetches: Array<(value: { ok: boolean }) => void> = [];
        global.fetch = jest.fn(() => new Promise(resolve => { fetches.push(resolve); })) as unknown as typeof fetch;
        // The server returns the segment with u-1 while the first deletion runs.
        mockUpdateSegment.mockResolvedValue(data.transcript[0]);
        renderProvider();

        let first: Promise<void> = Promise.resolve();
        let second: Promise<void> = Promise.resolve();
        act(() => {
            first = actions.deleteUtterances(['u-1']);
        });
        await act(async () => {
            await actions.updateSpeakerSegmentData('segment-a', {} as never);
        });
        act(() => {
            second = actions.deleteUtterances(['u-1']);
        });
        await act(async () => {
            fetches[0]({ ok: true });
            await first;
        });
        await act(async () => {
            fetches[1]({ ok: false });
            await expect(second).rejects.toThrow();
        });

        expect(utteranceIds()).toEqual(['u-2']);
    });
});
