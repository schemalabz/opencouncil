import React from 'react';
import { render, act } from '@testing-library/react';

import { KeyboardShortcutsProvider, useKeyboardShortcut, ACTIONS } from '../KeyboardShortcutsContext';

function Register({ handler }: { handler: () => void }) {
    useKeyboardShortcut(ACTIONS.EDIT_NEXT_UTTERANCE.id, handler, true);
    return null;
}

function setup() {
    const handler = jest.fn();
    render(
        <KeyboardShortcutsProvider>
            <Register handler={handler} />
        </KeyboardShortcutsProvider>,
    );
    return handler;
}

describe('KeyboardShortcutsContext dialog guard', () => {
    it('fires the registered shortcut when focus is outside any dialog', () => {
        const handler = setup();
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('ignores keystrokes whose target is inside a [role="dialog"] (so native button activation wins)', () => {
        const handler = setup();

        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        const button = document.createElement('button');
        dialog.appendChild(button);
        document.body.appendChild(dialog);

        act(() => {
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            Object.defineProperty(event, 'target', { value: button });
            window.dispatchEvent(event);
        });

        expect(handler).not.toHaveBeenCalled();
        document.body.removeChild(dialog);
    });

    it('ignores keystrokes whose target is inside a [role="alertdialog"]', () => {
        const handler = setup();

        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'alertdialog');
        const button = document.createElement('button');
        dialog.appendChild(button);
        document.body.appendChild(dialog);

        act(() => {
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            Object.defineProperty(event, 'target', { value: button });
            window.dispatchEvent(event);
        });

        expect(handler).not.toHaveBeenCalled();
        document.body.removeChild(dialog);
    });
});
