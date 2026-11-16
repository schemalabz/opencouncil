import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Utterance } from '@prisma/client';
import UtteranceC from '../Utterance';
import { TooltipProvider } from '@/components/ui/tooltip';

type TestMatch = { utteranceId: string; segmentId: string; start: number; end: number; globalIndex: number };

// A tiny external store, so a test can change the matches of an utterance the
// way the Find & Replace context does: without new props.
const mockMatchStore = {
    matches: [] as TestMatch[],
    listeners: new Set<() => void>(),
    set(matches: TestMatch[]) {
        this.matches = matches;
        this.listeners.forEach(l => l());
    },
};

jest.mock('../FindReplaceContext', () => {
    const { useSyncExternalStore } = jest.requireActual('react');
    return {
        useUtteranceMatches: () => {
            const matches = useSyncExternalStore(
                (cb: () => void) => { mockMatchStore.listeners.add(cb); return () => mockMatchStore.listeners.delete(cb); },
                () => mockMatchStore.matches,
            );
            return { matches, activeIndex: 0 };
        },
    };
});
let mockLocalize: (text: string) => string = text => text.toUpperCase();
jest.mock('@/hooks/useLocalizeText', () => ({ useLocalizeText: () => (text: string) => mockLocalize(text) }));
jest.mock('../../VideoProvider', () => ({
    useVideoActions: () => ({ currentTimeRef: { current: 0 }, seekToWithoutScroll: jest.fn(), togglePlayPause: jest.fn(), seekTo: jest.fn() }),
}));
let mockEditable = false;
jest.mock('../../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({ options: { editable: mockEditable, maxUtteranceDrift: 100, skipInterval: 5 } }),
}));
jest.mock('../../HighlightContext', () => ({ useHighlight: () => ({ editingHighlight: null, updateHighlightUtterances: jest.fn() }) }));
jest.mock('../../CouncilMeetingDataContext', () => ({ useCouncilMeetingActions: () => ({ deleteUtterance: jest.fn(), updateUtterance: jest.fn() }) }));
jest.mock('../../EditingContext', () => ({ useEditing: () => ({ selectedUtteranceIds: new Set(), toggleSelection: jest.fn() }) }));
jest.mock('@/components/sharing/ExcerptRangeHighlight', () => ({ useExcerptHighlighted: () => false }));
jest.mock('@/lib/db/utterance', () => ({ editUtterance: jest.fn(), updateUtteranceTimestamps: jest.fn() }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const utterance = {
    id: 'u-1', text: 'foo bar', startTimestamp: 0, endTimestamp: 5, drift: 0,
    speakerSegmentId: 's-1', lastModifiedBy: null,
} as unknown as Utterance;
const fooMatch: TestMatch = { utteranceId: 'u-1', segmentId: 's-1', start: 0, end: 3, globalIndex: 0 };

beforeEach(() => {
    mockLocalize = text => text.toUpperCase();
    mockEditable = false;
    mockMatchStore.matches = [];
});

it('keeps the display script for an utterance with search matches', () => {
    mockMatchStore.matches = [fooMatch];
    render(<UtteranceC utterance={utterance} />);

    expect(document.getElementById('u-1')?.textContent).toBe('FOO BAR ');
    expect(screen.getByText('FOO').tagName).toBe('MARK');
});

it('does not take focus back from the search box when the matches change', () => {
    mockEditable = true;
    render(
        <TooltipProvider>
            <input aria-label="search" />
            <UtteranceC utterance={utterance} />
        </TooltipProvider>,
    );
    fireEvent.click(document.getElementById('u-1')!);
    const editor = document.querySelector('textarea')!;
    expect(document.activeElement).toBe(editor);

    const search = screen.getByLabelText('search');
    search.focus();
    act(() => mockMatchStore.set([fooMatch]));

    expect(document.activeElement).toBe(search);
});

it('still returns focus to the textarea from a control inside the editor', () => {
    mockEditable = true;
    render(
        <TooltipProvider>
            <UtteranceC utterance={utterance} />
        </TooltipProvider>,
    );
    fireEvent.click(document.getElementById('u-1')!);
    const editor = document.querySelector('textarea')!;
    const insideButton = document.getElementById('u-1')!.querySelector('button')!;
    insideButton.focus();
    expect(document.activeElement).toBe(insideButton);

    act(() => mockMatchStore.set([fooMatch]));

    expect(document.activeElement).toBe(editor);
});

it.each([
    // Cyrillic to Latin: the case of Љ depends on the next letter.
    ['latn', 'ЉУБЉАНА', 1, 3, 'LJUBLJANA ', 'UB'],
    // Latin to Cyrillic: nj is one letter.
    ['cyrl', 'njiva', 1, 5, 'њива ', 'њива'],
] as const)('transliterates the whole text to %s and marks the match in it', (script, text, start, end, shown, marked) => {
    const { toScript } = jest.requireActual('@/lib/serbian');
    mockLocalize = t => toScript(t, script);
    mockMatchStore.matches = [{ ...fooMatch, start, end }];
    render(<UtteranceC utterance={{ ...utterance, text } as Utterance} />);

    expect(document.getElementById('u-1')?.textContent).toBe(shown);
    expect(document.querySelector('mark')?.textContent).toBe(marked);
});

it('does not repeat a letter when two matches split the same digraph', () => {
    const { toScript } = jest.requireActual('@/lib/serbian');
    mockLocalize = t => toScript(t, 'cyrl');
    mockMatchStore.matches = [{ ...fooMatch, start: 0, end: 1 }, { ...fooMatch, start: 1, end: 2, globalIndex: 1 }];
    render(<UtteranceC utterance={{ ...utterance, text: 'njiva' } as Utterance} />);

    expect(document.getElementById('u-1')?.textContent).toBe('њива ');
});
