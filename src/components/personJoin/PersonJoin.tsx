'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SignupFooter, SignupProgress } from '@/components/signup/SignupChrome';
import { claimWithToken, sendJoinEmail } from '@/lib/actions/personJoin';
import { setVoicePrintConsent } from '@/lib/actions/personConsent';
import { captureEvent } from '@/lib/analytics/capture';
import { isLikelyEmail, normalizeEmail } from '@/lib/personJoin/email';
import type { JoinStage } from '@/lib/personJoin/stage';
import { JoinComplete, JoinLayout, JoinProblem } from './JoinScreens';
import { ConfirmStep, ConsentStep, EmailStep, NotMeStep, SentStep, type ConsentChoice } from './JoinSteps';

type View = 'confirm' | 'notMe' | 'email' | 'sent' | 'consent' | 'done' | 'used' | 'invalid';
type EmailError = 'invalid' | 'sendFailed';

function initialView(stage: JoinStage): View {
    if (stage.kind === 'confirm') return 'confirm';
    if (stage.kind === 'consent') return stage.consented ? 'done' : 'consent';
    return stage.kind;
}

/**
 * The join flow behind a councillor's QR, for readers who are not at home
 * on a phone: one question per screen, one button, and words instead of
 * jargon. The server decides where a scan stands (`stage`); this component
 * only walks forward from there. It keeps nothing the server could not
 * rebuild, so a reload or a second device never strands anybody.
 */
export function PersonJoin({ token, stage, totalSteps }: { token: string; stage: JoinStage; totalSteps: 2 | 3 }) {
    const t = useTranslations('personJoin');
    const ts = useTranslations('signup');
    const [view, setView] = useState<View>(() => initialView(stage));
    // A session that ended between the page and the button turns a two-step
    // flow into a three-step one.
    const [total, setTotal] = useState(totalSteps);
    const [signedIn, setSignedIn] = useState(stage.kind === 'consent' || ((stage.kind === 'confirm' || stage.kind === 'used') && stage.signedIn));
    const [busy, setBusy] = useState(false);
    const [failures, setFailures] = useState(0);
    const [confirmError, setConfirmError] = useState(false);
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<EmailError | null>(null);
    const [choice, setChoice] = useState<ConsentChoice | null>(null);
    const [consentError, setConsentError] = useState(false);

    const person = stage.kind === 'invalid' ? null : stage.person;
    const cityId = person?.cityId ?? null;

    useEffect(() => {
        captureEvent('person_join_viewed', { city_id: cityId, view });
    }, [cityId, view]);

    const go = (next: View) => {
        setFailures(0);
        setView(next);
        window.scrollTo({ top: 0 });
    };

    if (!person || view === 'invalid') return <JoinProblem kind="invalid" />;
    if (view === 'used') {
        return <JoinProblem kind="used" signedIn={signedIn} own={stage.kind === 'used' && stage.own} person={person} />;
    }
    if (view === 'done') return <JoinLayout><JoinComplete person={person} /></JoinLayout>;

    async function confirm() {
        setConfirmError(false);
        if (!signedIn) return go('email');
        setBusy(true);
        try {
            const status = await claimWithToken(token);
            captureEvent('person_join_claimed', { city_id: cityId, status });
            if (status === 'linked' || status === 'already_yours') {
                // Mark the tab as inside the flow, so a reload stays on the consent.
                const url = new URL(window.location.href);
                url.searchParams.set('step', '2');
                window.history.replaceState(window.history.state, '', url);
                go('consent');
            }
            else if (status === 'already_linked') go('used');
            else if (status === 'signed_out') {
                setSignedIn(false);
                setTotal(3);
                go('email');
            } else go('invalid');
        } catch (error) {
            console.error('Join claim failed:', error);
            setConfirmError(true);
            setFailures((n) => n + 1);
        } finally {
            setBusy(false);
        }
    }

    async function sendEmail(address = email): Promise<boolean> {
        setEmailError(null);
        if (!isLikelyEmail(address)) {
            setEmailError('invalid');
            setFailures((n) => n + 1);
            return false;
        }
        setBusy(true);
        try {
            const result = await sendJoinEmail(token, normalizeEmail(address));
            if (result.ok) {
                setEmail(normalizeEmail(address));
                captureEvent('person_join_email_sent', { city_id: cityId });
                if (view !== 'sent') go('sent');
                return true;
            }
            if (result.error === 'invalid_code') {
                go('invalid');
                return false;
            }
            setEmailError(result.error === 'invalid_email' ? 'invalid' : 'sendFailed');
        } catch (error) {
            console.error('Join email failed:', error);
            setEmailError('sendFailed');
        } finally {
            setBusy(false);
        }
        setFailures((n) => n + 1);
        return false;
    }

    async function finish() {
        if (!choice) return;
        setConsentError(false);
        if (choice === 'no') {
            captureEvent('person_join_consent', { city_id: cityId, granted: false });
            return go('done');
        }
        setBusy(true);
        try {
            await setVoicePrintConsent(person!.id, true);
            captureEvent('person_join_consent', { city_id: cityId, granted: true });
            go('done');
        } catch (error) {
            console.error('Join consent failed:', error);
            setConsentError(true);
            setFailures((n) => n + 1);
        } finally {
            setBusy(false);
        }
    }

    const step = view === 'confirm' || view === 'notMe' ? 1 : view === 'consent' ? total : 2;

    return (
        <JoinLayout>
            <SignupProgress step={step} total={total} label={ts('stepOf', { step, total })} />

            {view === 'confirm' && <ConfirmStep person={person} error={confirmError} />}
            {view === 'notMe' && <NotMeStep person={person} />}
            {view === 'email' && (
                <EmailStep email={email} error={emailError} busy={busy} onChange={(value) => { setEmail(value); setEmailError(null); }} onSubmit={() => sendEmail()} />
            )}
            {view === 'sent' && <SentStep email={email} busy={busy} onResend={() => sendEmail(email)} onChange={() => go('email')} />}
            {view === 'consent' && <ConsentStep choice={choice} error={consentError} onChoice={setChoice} />}

            {view === 'confirm' && (
                <SignupFooter
                    pinned
                    actionLabel={busy ? t('confirm.working') : t('confirm.yes')}
                    onAction={confirm}
                    disabled={busy}
                    failure={confirmError ? 'refused' : null}
                    failures={failures}
                    backLabel={t('confirm.no')}
                    onBack={() => go('notMe')}
                />
            )}
            {view === 'notMe' && <SignupFooter pinned actionLabel={t('notMe.back')} onAction={() => go('confirm')} />}
            {view === 'email' && (
                <SignupFooter
                    pinned
                    actionLabel={busy ? t('email.sending') : t('email.cta')}
                    onAction={() => sendEmail()}
                    disabled={busy}
                    failure={emailError ? (emailError === 'invalid' ? 'issues' : 'refused') : null}
                    failures={failures}
                    backLabel={ts('back')}
                    onBack={() => go('confirm')}
                />
            )}
            {view === 'consent' && (
                <SignupFooter
                    pinned
                    actionLabel={busy ? t('consent.saving') : t('consent.cta')}
                    onAction={finish}
                    disabled={busy || choice === null}
                    failure={consentError ? 'refused' : null}
                    failures={failures}
                />
            )}
        </JoinLayout>
    );
}
