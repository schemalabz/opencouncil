'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhoneFieldValidity } from '@/components/ui/phone-field';
import { captureEvent } from '@/lib/analytics/capture';
import { clearDraft, readDraft, writeDraft } from './signup-draft';

const INITIAL_VALIDITY: PhoneFieldValidity = { isActive: false, isEmpty: true, isValid: false, reason: null };

/** What a flow's submit reports back: saved, or refused with a key under `signup.errors`. */
export type SubmitOutcome = { ok: true } | { ok: false; error: string };

/**
 * The scaffold the two signup flows share: the step in the URL (`?step=N`
 * survives a reload; the choices do not), the phone field's validity, the
 * attempted/submitting/error trio, the step-viewed event, and the
 * bookkeeping around a submit. Each flow keeps its own state shape, its own
 * rules and its own JSX.
 */
export function useSignupFlow<S extends { step: number }>(opts: {
    initial: () => S;
    cityId: string;
    signedIn: boolean;
    events: { stepViewed: string; failed: string };
    /**
     * Keeps the half-filled form in this browser, so the inbox round trip a
     * reader with an existing account has to make does not cost them their
     * answers. `apply` decides what a stored draft may put back — the flow
     * knows which of its fields are the reader's and which are the server's.
     */
    draft?: { key: string; apply: (state: S, stored: Partial<S>) => S };
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
    const draftKey = draft?.key;

    // The draft arrives in a mount effect, never during the first render:
    // reading storage while rendering makes the server HTML and the
    // hydration render disagree for everyone who has one. `restored` is
    // state, not a ref, so the write below cannot run in the same commit and
    // put the pre-restore form back over the draft it just read.
    const [restored, setRestored] = useState(false);
    useEffect(() => {
        if (!draftKey || restored) return;
        const stored = readDraft<Partial<S>>(draftKey);
        const apply = draftRef.current?.apply;
        if (stored && apply) setState((s) => apply(s, stored));
        setRestored(true);
    }, [draftKey, restored]);

    // Kept from the reader's first edit — a visitor who types nothing leaves
    // nothing behind — and cleared the moment the form is saved.
    const [edited, setEdited] = useState(false);
    useEffect(() => {
        if (!draftKey || !restored) return;
        if (done) {
            clearDraft(draftKey);
            return;
        }
        if (edited) writeDraft(draftKey, state);
    }, [draftKey, done, edited, restored, state]);

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
    };
}
