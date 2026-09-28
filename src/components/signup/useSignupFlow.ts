'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhoneFieldValidity } from '@/components/ui/phone-field';
import { captureEvent } from '@/lib/analytics/capture';
import { clearDraft, draftKey, readDraft, stashPhoneForGoogleReturn, takePhoneFromGoogleReturn, writeDraft } from './signup-draft';

const INITIAL_VALIDITY: PhoneFieldValidity = { isActive: false, isEmpty: true, isValid: false, reason: null };

/** The fields every signup flow shares: the account's, and the step. */
interface SignupFields {
    step: number;
    name: string;
    email: string;
    phone: string;
}

/** The signed-in account, as far as the draft cares: whether it has a phone. */
interface DraftAccount {
    phone: string | null;
}

/**
 * The account fields a kept draft may put back. They belong to the session
 * once there is one. A phone the account lacks comes back only from this
 * tab's own trip to Google, never from the draft: the draft is the
 * browser's, and on a shared browser it may be another reader's.
 */
function restoreAccountFields<S extends SignupFields>(
    state: S,
    stored: Partial<S> | null,
    account: DraftAccount | null,
    googlePhone: string | null,
): S {
    if (account) {
        return account.phone || googlePhone === null ? state : { ...state, phone: googlePhone };
    }
    if (!stored) return state;
    return {
        ...state,
        name: stored.name ?? state.name,
        email: stored.email ?? state.email,
        phone: stored.phone ?? state.phone,
    };
}

/** What a flow's submit reports back: saved, or refused with a key under `signup.errors`. */
export type SubmitOutcome = { ok: true } | { ok: false; error: string };

/**
 * The scaffold the two signup flows share: the step in the URL (`?step=N`
 * survives a reload; the choices do not), the phone field's validity, the
 * attempted/submitting/error trio, the step-viewed event, and the
 * bookkeeping around a submit. Each flow keeps its own state shape, its own
 * rules and its own JSX.
 */
export function useSignupFlow<S extends SignupFields>(opts: {
    initial: () => S;
    cityId: string;
    signedIn: boolean;
    events: { stepViewed: string; failed: string };
    /**
     * Keeps the half-filled form in this browser, so the inbox round trip a
     * reader with an existing account has to make, or the trip to Google,
     * does not cost them their answers. The hook restores the account fields
     * (see restoreAccountFields); `apply` decides what a stored draft may put
     * back of the flow's own fields — the flow knows which of them are the
     * reader's and which are the server's.
     */
    draft?: {
        /** Names the flow in the storage key. */
        flow: string;
        /** The signed-in account, or null for a visitor. */
        account: DraftAccount | null;
        apply: (state: S, stored: Partial<S>) => S;
    };
}) {
    const { cityId, signedIn, events, draft } = opts;
    const [state, setState] = useState<S>(opts.initial);
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [attempted, setAttempted] = useState(false);
    // Failed presses of submit since the reader arrived on the step — the
    // flow's rules stopping it, or a refusal. The issues alert scrolls into
    // view on each one, and stays put when the reader merely comes back to
    // the step with the old issues still standing.
    const [failures, setFailures] = useState(0);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>(INITIAL_VALIDITY);
    const viewed = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (done || viewed.current.has(state.step)) return;
        viewed.current.add(state.step);
        captureEvent(events.stepViewed, { city_id: cityId, step: state.step, signed_in: signedIn });
    }, [cityId, done, events.stepViewed, signedIn, state.step]);

    // The flows build `draft` inline, so its identity changes on every
    // render. A ref holds it and the effects depend on the key alone —
    // otherwise both of them would run on every render, and the write below
    // would serialize the whole state on every keystroke.
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const storageKey = draft ? draftKey(draft.flow, cityId) : undefined;

    // The draft arrives in a mount effect, never during the first render:
    // reading storage while rendering makes the server HTML and the
    // hydration render disagree for everyone who has one. `restored` is
    // state, not a ref, so the write below cannot run in the same commit and
    // put the pre-restore form back over the draft it just read.
    const [restored, setRestored] = useState(false);
    useEffect(() => {
        if (!storageKey || restored) return;
        const current = draftRef.current;
        if (current) {
            const stored = readDraft<Partial<S>>(storageKey);
            // Taken on every restore, and outside the updater: the stash is
            // spent on read, and a number left behind by a reader whose
            // account did not need it must not wait in the tab for the next.
            const googlePhone = takePhoneFromGoogleReturn(storageKey);
            setState((s) => restoreAccountFields(stored ? current.apply(s, stored) : s, stored, current.account, googlePhone));
        }
        setRestored(true);
    }, [storageKey, restored]);

    // Kept from the reader's first edit — a visitor who types nothing leaves
    // nothing behind — and cleared the moment the form is saved.
    const [edited, setEdited] = useState(false);
    useEffect(() => {
        if (!storageKey || !restored) return;
        if (done) {
            clearDraft(storageKey);
            return;
        }
        if (edited) writeDraft(storageKey, state);
    }, [storageKey, done, edited, restored, state]);

    /** Keeps the phone in the form for this tab's return from Google. */
    const stashPhoneForGoogle = () => {
        if (storageKey) stashPhoneForGoogleReturn(storageKey, state.phone);
    };

    const patch = useCallback((next: Partial<S>) => {
        setEdited(true);
        setState((s) => ({ ...s, ...next }));
    }, []);

    const goTo = useCallback((step: S['step']) => {
        setState((s) => ({ ...s, step }));
        setFailures(0);
        const url = new URL(window.location.href);
        url.searchParams.set('step', String(step));
        window.history.replaceState(window.history.state, '', url);
        window.scrollTo({ top: 0 });
    }, []);

    const validity = { phoneEmpty: phoneValidity.isEmpty, phoneValid: phoneValidity.isValid, signedIn };

    /**
     * Runs a flow's submit inside the shared bookkeeping. `blocked` means the
     * flow's own rules stopped it (it shows them as issues); a refusal is a
     * key under `signup.errors`; a throw is the generic error plus an event.
     */
    const submit = async (run: () => Promise<SubmitOutcome | 'blocked'>) => {
        setAttempted(true);
        setSaveError(null);
        setSubmitting(true);
        try {
            const outcome = await run();
            if (outcome === 'blocked') {
                setFailures((n) => n + 1);
                return;
            }
            if (!outcome.ok) {
                setSaveError(outcome.error);
                setFailures((n) => n + 1);
                return;
            }
            setDone(true);
            window.scrollTo({ top: 0 });
        } catch (error) {
            console.error('Signup failed:', error);
            setSaveError('generic');
            setFailures((n) => n + 1);
            captureEvent(events.failed, { city_id: cityId, code: 'exception' });
        } finally {
            setSubmitting(false);
        }
    };

    return {
        state,
        patch,
        goTo,
        /** The reader has changed something that a navigation away would discard. */
        edited,
        done,
        submitting,
        attempted,
        failures,
        saveError,
        phoneValidity,
        setPhoneValidity,
        validity,
        submit,
        stashPhoneForGoogle,
    };
}
