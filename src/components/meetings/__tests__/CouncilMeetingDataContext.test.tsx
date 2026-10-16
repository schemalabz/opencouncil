import React from 'react';
import { render, act } from '@testing-library/react';

import { CouncilMeetingDataProvider, useCouncilMeetingActions, useCouncilMeetingData } from '../CouncilMeetingDataContext';
import type { MeetingData } from '@/lib/getMeetingData';

jest.mock('@/lib/actions/speakerTags', () => ({ assignSpeaker: jest.fn() }));
jest.mock('@/lib/db/speakerSegments', () => ({}));

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
});
