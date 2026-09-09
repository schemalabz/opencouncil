import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsProvider, useKeyboardShortcut, ACTIONS } from '../KeyboardShortcutsContext';

type Handlers = {
    seekNext: jest.Mock;
    speedUp: jest.Mock;
    playPause: jest.Mock;
    clearSelection: jest.Mock;
    extract: jest.Mock;
};

function Shortcuts({ handlers }: { handlers: Handlers }) {
    useKeyboardShortcut(ACTIONS.SEEK_NEXT.id, handlers.seekNext);
    useKeyboardShortcut(ACTIONS.SPEED_UP.id, handlers.speedUp);
    useKeyboardShortcut(ACTIONS.PLAY_PAUSE.id, handlers.playPause);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, handlers.clearSelection, true);
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, handlers.extract, true);
    return null;
}

function setup() {
    const handlers: Handlers = {
        seekNext: jest.fn(),
        speedUp: jest.fn(),
        playPause: jest.fn(),
        clearSelection: jest.fn(),
        extract: jest.fn(),
    };
    const view = render(
        <KeyboardShortcutsProvider>
            <Shortcuts handlers={handlers} />
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
        const { handlers, view } = setup();
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: ' ' });
        expect(handlers.playPause).not.toHaveBeenCalled();
    });

    it('passes Escape from a focused button to its action', () => {
        const { handlers, view } = setup();
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: 'Escape' });
        expect(handlers.clearSelection).toHaveBeenCalledTimes(1);
    });

    it('passes a letter from a focused button to its action', () => {
        const { handlers, view } = setup();
        fireEvent.keyDown(view.getByTestId('toolbar'), { key: 'e' });
        expect(handlers.extract).toHaveBeenCalledTimes(1);
    });

    it('leaves every key to a listbox, which moves its own selection', () => {
        const { handlers, view } = setup();
        fireEvent.keyDown(view.getByTestId('listbox'), { key: 'ArrowRight' });
        fireEvent.keyDown(view.getByTestId('listbox'), { key: 'Escape' });
        expect(handlers.seekNext).not.toHaveBeenCalled();
        expect(handlers.clearSelection).not.toHaveBeenCalled();
    });
});
