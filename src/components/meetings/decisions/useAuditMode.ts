"use client";

import { useStoredState } from '@/hooks/useStoredState';

const AUDIT_MODE_KEY = 'oc.decisions.auditMode';

const parseAuditMode = (raw: string): boolean | undefined =>
    raw === 'true' ? true : raw === 'false' ? false : undefined;

/**
 * Whether the decisions page is showing how each fact came to be: what the
 * document stated, what the derivation concluded from it, and where the two
 * left a gap.
 *
 * The preference is per person, not per meeting. Someone checking the
 * extraction works through many meetings in a sitting, and a mode that reset
 * on every navigation would be turned on again at each one.
 *
 * Every caller must also hold `isSuperAdmin`: this hook says what the person
 * chose, never who they are. Off is the fallback, so a browser that refuses
 * storage — and the server render, which has none — shows the ordinary page.
 */
export function useAuditMode(): [boolean, (value: boolean) => void] {
    return useStoredState(AUDIT_MODE_KEY, parseAuditMode, false);
}
