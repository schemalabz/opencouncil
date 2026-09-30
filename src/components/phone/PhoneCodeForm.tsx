'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/error-line';
import { maskPhone } from '@/components/signup/signup-shared';
import { confirmPhoneCode, requestPhoneCode } from '@/lib/actions/phoneVerification';
import { captureEvent } from '@/lib/analytics/capture';
import { formatTime } from '@/lib/formatters/time';
import { CODE_LENGTH, RESEND_COOLDOWN_MS } from '@/lib/phone-verification/constants';
import { cn } from '@/lib/utils';

/**
 * The code that proves a mobile number (issue #813): six boxes that check the
 * code as soon as the last digit is in, one line that says where the code
 * went, and one quiet row for "send again" and "not now". The signup shows it
 * under its own step heading, the profile in a dialog that names it. The number is
 * already the account's pending one; the send stages it again, which is a
 * no-op, so both callers pass the same thing.
 *
 * Not a <form>: the profile mounts it inside its own form, and a form inside
 * a form is dropped by the HTML parser, so a button here would submit the
 * profile.
 */

/**
 * Error codes with a message of their own; the rest read as `generic`. The
 * send limits (`too_soon`, `too_many`) are not among them: a limit is not the
 * reader's mistake, and the form says when the next code can go instead.
 */
const LIMITS = new Set(['too_soon', 'too_many']);
const KNOWN_ERRORS = new Set([
    'code_invalid',
    'code_expired',
    'too_many_attempts',
    'phone_in_use',
    'phone_invalid',
    'phone_not_mobile',
    'send_failed',
    'no_pending',
]);

type Channel = 'sms' | 'log';

export function PhoneCodeForm({
    phone,
    autoSend = false,
    title = true,
    lead = true,
    inDialog = false,
    onVerified,
    onCancel,
    className,
}: {
    /** The number awaiting the code, in E.164. */
    phone: string;
    /** Ask for the code as soon as the form shows: the reader just asked for it. */
    autoSend?: boolean;
    /** The form's own title; off where a dialog or a step heading names it. */
    title?: boolean;
    /** The "sent to" line; off where the page says it already. */
    lead?: boolean;
    /**
     * A dialog closes itself, so "not now" is dropped where it postpones
     * nothing: while a send limit holds and no code is out. A page keeps it,
     * because it is the only way on from there.
     */
    inDialog?: boolean;
    onVerified: (phone: string) => void;
    /** Leave the number unverified for now; absent when the flow has no way back. */
    onCancel?: () => void;
    className?: string;
}) {
    const t = useTranslations('phoneVerification');
    const locale = useLocale();
    const id = useId();
    const [channel, setChannel] = useState<Channel | null>(null);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    // A send limit stopped the last request, and no code that still works is out.
    const [limited, setLimited] = useState(false);
    const [code, setCode] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<{ key: string; attemptsLeft?: number } | null>(null);
    const [verified, setVerified] = useState(false);
    // Bumped on every code that went out, so the boxes take the focus again.
    const [sends, setSends] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const fail = (codeName: string, attemptsLeft?: number) =>
        setError({ key: KNOWN_ERRORS.has(codeName) ? codeName : 'generic', attemptsLeft });

    // The boxes are where the reader looks after a send and after a wrong
    // code. An effect, not a call in the handlers: the input renders only
    // once the code went out, it is disabled while a code is checked, and a
    // dialog around it moves the focus to its own button when it opens.
    useEffect(() => {
        if (channel && !confirming) inputRef.current?.focus();
    }, [channel, confirming, sends]);

    const send = useCallback(async () => {
        setSending(true);
        setError(null);
        try {
            const result = await requestPhoneCode({ phone, locale });
            if (!result.ok) {
                // The number is already the account's verified one: nothing to prove.
                if (result.code === 'already_verified') {
                    setVerified(true);
                    onVerified(phone);
                    return;
                }
                if (LIMITS.has(result.code) && result.retryAfterMs) {
                    setLimited(true);
                    setCooldown(Math.ceil(result.retryAfterMs / 1000));
                    return;
                }
                fail(result.code);
                return;
            }
            setLimited(false);
            setChannel(result.channel);
            // A code that still works came back instead of a new one: the wait is what is left of it.
            setCooldown(Math.ceil((result.resendInMs ?? RESEND_COOLDOWN_MS) / 1000));
            setCode('');
            setSends((n) => n + 1);
            if (result.resendInMs === undefined) captureEvent('phone_code_sent', { channel: result.channel });
        } catch (e) {
            console.error('Phone code request failed:', e);
            fail('generic');
        } finally {
            setSending(false);
        }
    }, [locale, onVerified, phone]);

    // One send on mount, when asked; a re-render must not send a second code.
    const autoSent = useRef(false);
    useEffect(() => {
        if (!autoSend || autoSent.current) return;
        autoSent.current = true;
        send();
    }, [autoSend, send]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const confirm = async (value: string) => {
        if (value.length !== CODE_LENGTH || confirming) return;
        setConfirming(true);
        setError(null);
        try {
            const result = await confirmPhoneCode(value);
            if (!result.ok) {
                fail(result.code, 'attemptsLeft' in result ? result.attemptsLeft : undefined);
                // A wrong code is retyped whole: the boxes empty, and the focus
                // comes back when the check ends.
                setCode('');
                return;
            }
            setVerified(true);
            captureEvent('phone_verified');
            onVerified(result.phone);
        } catch (e) {
            console.error('Phone code confirm failed:', e);
            fail('generic');
        } finally {
            setConfirming(false);
        }
    };

    const masked = maskPhone(phone);
    const isLimited = !channel && limited && cooldown > 0;
    const showCancel = onCancel !== undefined && !(inDialog && isLimited);
    const leadText = channel ? t('sentTo', { phone: masked }) : isLimited ? null : t('sendPrompt', { phone: masked });

    if (verified) {
        return (
            <p className={cn('flex items-center gap-1.5 text-[13px] text-emerald-700', className)} role="status">
                <Check className="h-4 w-4" aria-hidden />
                {t('verified')}
            </p>
        );
    }

    return (
        <div role="group" aria-labelledby={`${id}-title`} className={cn('flex flex-col gap-4', className)}>
            {(title || (lead && leadText)) && (
                <div>
                    {title && (
                        <p id={`${id}-title`} className="mb-1 text-[15px] font-semibold leading-snug">
                            {t('title')}
                        </p>
                    )}
                    {/* The production wording in development too: the dashed note says what differs. */}
                    {lead && leadText && <p className="text-[14px] leading-[1.5] text-muted-foreground">{leadText}</p>}
                </div>
            )}
            {!title && (
                <span id={`${id}-title`} className="sr-only">
                    {t('title')}
                </span>
            )}

            {channel ? (
                <div className="flex flex-col gap-2">
                    <CodeBoxes
                        inputRef={inputRef}
                        label={t('codeLabel')}
                        value={code}
                        disabled={confirming}
                        invalid={error !== null}
                        onChange={(value) => {
                            setError(null);
                            setCode(value);
                            if (value.length === CODE_LENGTH) confirm(value);
                        }}
                    />
                    {confirming && (
                        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground" role="status">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            {t('confirming')}
                        </p>
                    )}
                </div>
            ) : isLimited ? (
                <p className="text-[14px] leading-[1.5] text-muted-foreground" role="status">
                    {t('limited', { time: formatTime(cooldown) })}
                </p>
            ) : (
                <Button type="button" className="h-11 w-fit" disabled={sending} onClick={send}>
                    {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {sending ? t('sending') : t('send')}
                </Button>
            )}

            {error && <ErrorLine>{t(`errors.${error.key}`, { attemptsLeft: error.attemptsLeft ?? 0 })}</ErrorLine>}

            {channel === 'log' && (
                <p className="rounded-md border border-dashed border-amber-400 px-2.5 py-1.5 text-xs leading-[1.4] text-amber-800">
                    {t('devLog', { phone: masked })}
                </p>
            )}

            {(channel || showCancel) && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
                    {channel ? (
                        <span>
                            {t('notArrived')}{' '}
                            {cooldown > 0 ? (
                                <span>{t('resendIn', { time: formatTime(cooldown) })}</span>
                            ) : (
                                <button
                                    type="button"
                                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-60"
                                    disabled={sending}
                                    onClick={send}
                                >
                                    {sending ? t('sending') : t('resend')}
                                </button>
                            )}
                        </span>
                    ) : (
                        <span />
                    )}
                    {showCancel && (
                        <button type="button" className="hover:text-foreground" onClick={onCancel}>
                            {t('cancel')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Six boxes over one real input: the input keeps what the platform gives a
 * code field — the SMS code suggestion on a phone, paste, the numeric
 * keyboard, one tab stop — and the boxes only draw it.
 */
function CodeBoxes({
    inputRef,
    label,
    value,
    disabled,
    invalid,
    onChange,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    label: string;
    value: string;
    disabled: boolean;
    invalid: boolean;
    onChange: (value: string) => void;
}) {
    const [focused, setFocused] = useState(false);
    const current = Math.min(value.length, CODE_LENGTH - 1);

    return (
        <div className="relative w-full max-w-[20rem]">
            <div className="flex gap-2" aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => {
                    const digit = value[i];
                    const active = focused && !disabled && i === current;
                    return (
                        <div
                            key={i}
                            className={cn(
                                'flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border bg-background text-xl font-semibold tabular-nums transition-colors',
                                invalid ? 'border-red-400' : active ? 'border-foreground ring-2 ring-foreground/10' : 'border-input',
                                disabled && 'opacity-60',
                            )}
                        >
                            {digit ?? (active ? <span className="h-5 w-px animate-pulse bg-foreground" /> : null)}
                        </div>
                    );
                })}
            </div>
            <input
                ref={inputRef}
                aria-label={label}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                value={value}
                disabled={disabled}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
            />
        </div>
    );
}
