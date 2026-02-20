"use client";
import React, { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';

export type KeyboardActionHandler = () => void;

export interface KeyboardAction {
    id: string;
    description: string;
    keys: string[]; // e.g., ['Control+s', 'Meta+s']
    handler?: KeyboardActionHandler;
}

interface KeyboardShortcutsContextType {
    registerShortcut: (actionId: string, handler: KeyboardActionHandler) => void;
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
        keys: ['ArrowLeft']
    },
    SEEK_NEXT: {
        id: 'SEEK_NEXT',
        description: 'Seek to next utterance or 5s forward',
        keys: ['ArrowRight']
    },
    SPEED_UP: {
        id: 'SPEED_UP',
        description: 'Increase playback speed',
        keys: ['ArrowUp']
    },
    SPEED_DOWN: {
        id: 'SPEED_DOWN',
        description: 'Decrease playback speed',
        keys: ['ArrowDown']
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
    const handlers = React.useRef<Map<string, KeyboardActionHandler>>(new Map());

    const registerShortcut = useCallback((actionId: string, handler: KeyboardActionHandler) => {
        handlers.current.set(actionId, handler);
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
            // Ignore if input/textarea is focused (unless it's a special modifier command we want to allow globally)
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Check all definitions
            for (const action of Object.values(ACTION_DEFINITIONS)) {
                const isMatch = action.keys.some(keyCombo => {
                    const parts = keyCombo.toLowerCase().split('+');
                    const key = parts.pop();
                    const modifiers = parts;
                    
                    if (event.key.toLowerCase() !== key) return false;
                    
                    const ctrl = modifiers.includes('control') || modifiers.includes('ctrl');
                    const meta = modifiers.includes('meta') || modifiers.includes('cmd');
                    const shift = modifiers.includes('shift');
                    const alt = modifiers.includes('alt');

                    return (
                        event.ctrlKey === ctrl &&
                        event.metaKey === meta &&
                        event.shiftKey === shift &&
                        event.altKey === alt
                    );
                });

                if (isMatch) {
                    const handler = handlers.current.get(action.id);
                    if (handler) {
                        event.preventDefault();
                        handler();
                        return;
                    }
                }
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

export function useKeyboardShortcut(actionId: string, handler: KeyboardActionHandler, enabled: boolean = true) {
    const context = useContext(KeyboardShortcutsContext);
    if (context === undefined) {
        throw new Error('useKeyboardShortcut must be used within a KeyboardShortcutsProvider');
    }

    useEffect(() => {
        if (enabled) {
            context.registerShortcut(actionId, handler);
            return () => context.unregisterShortcut(actionId);
        }
    }, [actionId, handler, enabled, context]);
}

export const ACTIONS = ACTION_DEFINITIONS;
