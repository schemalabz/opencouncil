'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhoneFieldValidity } from '@/components/ui/phone-field';
import { captureEvent } from '@/lib/analytics/capture';

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
}) {
    const { cityId, signedIn, events } = opts;
    const [state, setState] = useState<S>(opts.initial);
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>(INITIAL_VALIDITY);
    const viewed = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (done || viewed.current.has(state.step)) return;
        viewed.current.add(state.step);
        captureEvent(events.stepViewed, { city_id: cityId, step: state.step, signed_in: signedIn });
    }, [cityId, done, events.stepViewed, signedIn, state.step]);

    const patch = useCallback((next: Partial<S>) => setState((s) => ({ ...s, ...next })), []);

    const goTo = useCallback((step: S['step']) => {
        setState((s) => ({ ...s, step }));
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
            if (outcome === 'blocked') return;
            if (!outcome.ok) {
                setSaveError(outcome.error);
                return;
            }
            setDone(true);
            window.scrollTo({ top: 0 });
        } catch (error) {
            console.error('Signup failed:', error);
            setSaveError('generic');
            captureEvent(events.failed, { city_id: cityId, code: 'exception' });
        } finally {
            setSubmitting(false);
        }
    };

    return { state, patch, goTo, done, submitting, attempted, saveError, phoneValidity, setPhoneValidity, validity, submit };
}
