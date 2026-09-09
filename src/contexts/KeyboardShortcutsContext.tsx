"use client";
import React, { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';

export type KeyboardActionHandler = () => void;

export interface ShortcutRegistrationOptions {
    /**
     * Bare arrows scroll the page while reading, so a reader's playback actions
     * run only from inside the dock. The editing surface claims them outright:
     * an editor drives the audio while the caret and the focus stay on the
     * transcript. Defaults to the action definition.
     */
    requiresPlaybackFocus?: boolean;
}

interface ShortcutRegistration {
    handler: KeyboardActionHandler;
    requiresPlaybackFocus?: boolean;
}

export interface KeyboardAction {
    id: string;
    description: string;
    keys: string[]; // e.g., ['Control+s', 'Meta+s']
    handler?: KeyboardActionHandler;
    /** Bare arrows belong to reading (scroll) unless focus sits in the playback dock. */
    requiresPlaybackFocus?: boolean;
}

interface KeyboardShortcutsContextType {
    registerShortcut: (actionId: string, handler: KeyboardActionHandler, options?: ShortcutRegistrationOptions) => void;
    unregisterShortcut: (actionId: string) => void;
    getShortcutLabel: (actionId: string) => string | null;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | undefined>(undefined);

// Pre-defined action definitions to ensure consistency
const ACTION_DEFINITIONS: Record<string, Omit<KeyboardAction, 'handler'>> = {
    EXTRACT_SEGMENT: {
        id: 'EXTRACT_SEGMENT',
        description: 'Extract selected utterances to new segment',
        keys: ['e']
    },
    CLEAR_SELECTION: {
        id: 'CLEAR_SELECTION',
        description: 'Clear current selection',
        keys: ['Escape']
    },
    PLAY_PAUSE: {
        id: 'PLAY_PAUSE',
        description: 'Play/Pause video',
        keys: [' ']
    },
    EDIT_NEXT_UTTERANCE: {
        id: 'EDIT_NEXT_UTTERANCE',
        description: 'Save current utterance and edit next',
        keys: ['Enter']
    },
    SEEK_PREVIOUS: {
        id: 'SEEK_PREVIOUS',
        description: 'Seek to previous utterance or 5s back',
        keys: ['ArrowLeft'],
        requiresPlaybackFocus: true
    },
    SEEK_NEXT: {
        id: 'SEEK_NEXT',
        description: 'Seek to next utterance or 5s forward',
        keys: ['ArrowRight'],
        requiresPlaybackFocus: true
    },
    SPEED_UP: {
        id: 'SPEED_UP',
        description: 'Increase playback speed',
        keys: ['ArrowUp'],
        requiresPlaybackFocus: true
    },
    SPEED_DOWN: {
        id: 'SPEED_DOWN',
        description: 'Decrease playback speed',
        keys: ['ArrowDown'],
        requiresPlaybackFocus: true
    },
    SKIP_BACKWARD: {
        id: 'SKIP_BACKWARD',
        description: 'Skip backward by interval',
        keys: ['Shift+ArrowLeft']
    },
    SKIP_FORWARD: {
        id: 'SKIP_FORWARD',
        description: 'Skip forward by interval',
        keys: ['Shift+ArrowRight']
    }
};

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
    // Map of actionId -> handler
    const handlers = React.useRef<Map<string, ShortcutRegistration>>(new Map());

    const registerShortcut = useCallback((actionId: string, handler: KeyboardActionHandler, options?: ShortcutRegistrationOptions) => {
        handlers.current.set(actionId, { handler, requiresPlaybackFocus: options?.requiresPlaybackFocus });
    }, []);

    const unregisterShortcut = useCallback((actionId: string) => {
        handlers.current.delete(actionId);
    }, []);

    const getShortcutLabel = useCallback((actionId: string) => {
        const def = ACTION_DEFINITIONS[actionId];
        return def ? def.keys.join(' or ') : null;
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // A component that already handled this key (the timeline slider's
            // arrows, for example) wins over the global shortcuts.
            if (event.defaultPrevented) {
                return;
            }
            // Ignore if input/textarea is focused (unless it's a special modifier command we want to allow globally)
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (event.target instanceof HTMLElement && event.target.isContentEditable) {
                return;
            }
            const inPlaybackDock = event.target instanceof HTMLElement
                && event.target.closest('[data-playback-focus]') !== null;
            // A composite widget owns every key: menus, listboxes, sliders, tab
            // lists, comboboxes and selects move their own selection with the
            // arrows, close on Escape and jump to a letter as you type it.
            const onCompositeWidget = event.target instanceof HTMLElement && (
                event.target instanceof HTMLSelectElement ||
                event.target.closest('[role="menu"], [role="menubar"], [role="listbox"], [role="slider"], [role="tablist"], [role="combobox"]') !== null
            );
            // A focused button owns Space and Enter, which activate it. It owns
            // no other key, so the rest of the shortcuts still reach their action.
            const onButton = event.target instanceof HTMLButtonElement;

            // Check all definitions
            for (const action of Object.values(ACTION_DEFINITIONS)) {
                const matchedKey = action.keys.map(keyCombo => {
                    const parts = keyCombo.toLowerCase().split('+');
                    const key = parts.pop();
                    const modifiers = parts;

                    if (event.key.toLowerCase() !== key) return undefined;

                    const ctrl = modifiers.includes('control') || modifiers.includes('ctrl');
                    const meta = modifiers.includes('meta') || modifiers.includes('cmd');
                    const shift = modifiers.includes('shift');
                    const alt = modifiers.includes('alt');

                    const modifiersMatch = (
                        event.ctrlKey === ctrl &&
                        event.metaKey === meta &&
                        event.shiftKey === shift &&
                        event.altKey === alt
                    );
                    return modifiersMatch ? key : undefined;
                }).find(key => key !== undefined);

                if (matchedKey === undefined) {
                    continue;
                }

                const registration = handlers.current.get(action.id);
                if (!registration) {
                    continue;
                }

                const isArrow = matchedKey.startsWith('arrow');

                // Inside the dock the arrow actions outrank the widget under
                // focus, which is how the dock's own strip and buttons work.
                if (onCompositeWidget && !(inPlaybackDock && isArrow)) {
                    continue;
                }
                if (onButton && (matchedKey === ' ' || matchedKey === 'enter')) {
                    continue;
                }
                if (isArrow) {
                    const requiresPlaybackFocus = registration.requiresPlaybackFocus ?? action.requiresPlaybackFocus;
                    if (requiresPlaybackFocus && !inPlaybackDock) {
                        continue;
                    }
                }

                event.preventDefault();
                registration.handler();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <KeyboardShortcutsContext.Provider value={{ registerShortcut, unregisterShortcut, getShortcutLabel }}>
            {children}
        </KeyboardShortcutsContext.Provider>
    );
}

export function useKeyboardShortcut(
    actionId: string,
    handler: KeyboardActionHandler,
    enabled: boolean = true,
    options?: ShortcutRegistrationOptions
) {
    const context = useContext(KeyboardShortcutsContext);
    if (context === undefined) {
        throw new Error('useKeyboardShortcut must be used within a KeyboardShortcutsProvider');
    }

    const requiresPlaybackFocus = options?.requiresPlaybackFocus;

    useEffect(() => {
        if (enabled) {
            context.registerShortcut(actionId, handler, { requiresPlaybackFocus });
            return () => context.unregisterShortcut(actionId);
        }
    }, [actionId, handler, enabled, requiresPlaybackFocus, context]);
}

export const ACTIONS = ACTION_DEFINITIONS;
