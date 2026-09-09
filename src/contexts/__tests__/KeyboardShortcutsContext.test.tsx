import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsProvider, useKeyboardShortcut, ACTIONS, getActionKeyLabel } from '../KeyboardShortcutsContext';

type Handlers = {
    seekNext: jest.Mock;
    speedUp: jest.Mock;
    playPause: jest.Mock;
    clearSelection: jest.Mock;
    extract: jest.Mock;
};

function Shortcuts({ editable, handlers }: { editable: boolean; handlers: Handlers }) {
    // Seek belongs to everyone; speed is the editing surface's until a reader
    // reaches the dock, because up and down are a reader's scroll keys.
    useKeyboardShortcut(ACTIONS.SEEK_NEXT.id, handlers.seekNext, true, { requiresPlaybackFocus: false });
    useKeyboardShortcut(ACTIONS.SPEED_UP.id, handlers.speedUp, true, { requiresPlaybackFocus: !editable });
    useKeyboardShortcut(ACTIONS.PLAY_PAUSE.id, handlers.playPause, true);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, handlers.clearSelection, true);
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, handlers.extract, true);
    return null;
}

function setup(editable: boolean) {
    const handlers: Handlers = {
        seekNext: jest.fn(),
        speedUp: jest.fn(),
        playPause: jest.fn(),
        clearSelection: jest.fn(),
        extract: jest.fn(),
    };
    const view = render(
        <KeyboardShortcutsProvider>
            <Shortcuts editable={editable} handlers={handlers} />
            <p data-testid="transcript">an utterance</p>
            <button data-testid="toolbar">Speakers</button>
            <div data-playback-focus="">
                <button data-testid="dock-play">Play</button>
                <div role="slider" aria-label="timeline" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} data-testid="strip" tabIndex={0} />
            </div>
            <div role="listbox" data-testid="listbox" tabIndex={-1} />
        </KeyboardShortcutsProvider>
    );
    return { handlers, view };
}

describe('a control that owns the keyboard', () => {
    it('leaves Space to a focused button, which it activates', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: ' ' });
        expect(handlers.playPause).not.toHaveBeenCalled();
    });

    it('passes Escape from a focused button to its action', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: 'Escape' });
        expect(handlers.clearSelection).toHaveBeenCalledTimes(1);
    });

    it('passes a letter from a focused button to its action', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: 'e' });
        expect(handlers.extract).toHaveBeenCalledTimes(1);
    });

    it('leaves every key to a listbox, which moves its own selection', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('listbox'), { key: 'ArrowRight' });
        fireEvent.keyDown(view.getByTestId('listbox'), { key: 'Escape' });
        expect(handlers.seekNext).not.toHaveBeenCalled();
        expect(handlers.clearSelection).not.toHaveBeenCalled();
    });
});

describe('bare arrows in the editing surface', () => {
    it('seeks to the next utterance with focus on the transcript', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('transcript'), { key: 'ArrowRight' });
        expect(handlers.seekNext).toHaveBeenCalledTimes(1);
    });

    it('changes the speed with focus on the transcript', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('transcript'), { key: 'ArrowUp' });
        expect(handlers.speedUp).toHaveBeenCalledTimes(1);
    });

    it('seeks with focus on a button, which has no arrow behaviour of its own', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: 'ArrowRight' });
        expect(handlers.seekNext).toHaveBeenCalledTimes(1);
    });
});

describe('bare arrows for a reader', () => {
    it('seeks from the transcript, because left and right never scroll it', () => {
        const { handlers, view } = setup(false);
        fireEvent.keyDown(view.getByTestId('transcript'), { key: 'ArrowRight' });
        expect(handlers.seekNext).toHaveBeenCalledTimes(1);
    });

    it('keeps up and down for scroll, so a stray press cannot store a new speed', () => {
        const { handlers, view } = setup(false);
        fireEvent.keyDown(view.getByTestId('transcript'), { key: 'ArrowUp' });
        expect(handlers.speedUp).not.toHaveBeenCalled();
    });

    it('changes the speed from inside the dock', () => {
        const { handlers, view } = setup(false);
        fireEvent.keyDown(view.getByTestId('dock-play'), { key: 'ArrowUp' });
        expect(handlers.speedUp).toHaveBeenCalledTimes(1);
    });

    it('plays and pauses with Space anywhere', () => {
        const { handlers, view } = setup(false);
        fireEvent.keyDown(view.getByTestId('transcript'), { key: ' ' });
        expect(handlers.playPause).toHaveBeenCalledTimes(1);
    });
});

describe('the timeline strip', () => {
    it('passes its arrows to the shortcuts, though it is a slider', () => {
        const { handlers, view } = setup(true);
        fireEvent.keyDown(view.getByTestId('strip'), { key: 'ArrowRight' });
        expect(handlers.seekNext).toHaveBeenCalledTimes(1);
    });

    it('lets a reader reach the speed keys there', () => {
        const { handlers, view } = setup(false);
        fireEvent.keyDown(view.getByTestId('strip'), { key: 'ArrowUp' });
        expect(handlers.speedUp).toHaveBeenCalledTimes(1);
    });
});

describe('the keys a guide shows', () => {
    it('writes an arrow as an arrow', () => {
        expect(getActionKeyLabel(ACTIONS.SEEK_NEXT.id)).toBe('→');
        expect(getActionKeyLabel(ACTIONS.SPEED_UP.id)).toBe('↑');
    });

    it('keeps the modifier in front of the key', () => {
        expect(getActionKeyLabel(ACTIONS.SKIP_FORWARD.id)).toBe('Shift+→');
    });

    it('names the keys that have no glyph', () => {
        expect(getActionKeyLabel(ACTIONS.PLAY_PAUSE.id)).toBe('Space');
        expect(getActionKeyLabel(ACTIONS.CLEAR_SELECTION.id)).toBe('Esc');
        expect(getActionKeyLabel(ACTIONS.EDIT_NEXT_UTTERANCE.id)).toBe('Enter');
        expect(getActionKeyLabel(ACTIONS.EXTRACT_SEGMENT.id)).toBe('E');
    });

    it('has no label for an action that does not exist', () => {
        expect(getActionKeyLabel('NOT_AN_ACTION')).toBeNull();
    });
});
