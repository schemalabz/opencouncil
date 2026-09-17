'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { SIGN_IN_LINK_SENT, type SignupIssue } from './signup-shared';

/**
 * Why the last step did not submit: the save action's answer first, then
 * what the reader still has to fill. An existing account gets the way in.
 *
 * It sits under the step's heading, which on a phone is a screen above the
 * button that was pressed; so each failed press scrolls it back into view.
 */
export function IssuesAlert({
    saveError,
    issues,
    email,
    signedIn,
    failures,
}: {
    /** The save action's answer, as a key under `signup.errors`. */
    saveError: string | null;
    issues: SignupIssue[];
    /** The email on the form, prefilled into the sign-in link for the account that owns it. */
    email: string;
    signedIn: boolean;
    /** Failed presses of submit since the reader arrived on the step. */
    failures: number;
}) {
    const t = useTranslations('signup');
    const ref = useRef<HTMLDivElement>(null);
    const shown = saveError !== null || issues.length > 0;
    // The reader already has an account and the link is on its way: nothing
    // is wrong, so nothing reads as an error. Their answers are still on the
    // form, kept by the draft, and one press finishes the job when they
    // return signed in.
    const linkSent = saveError === SIGN_IN_LINK_SENT && issues.length === 0;
    // A number that belongs to another account is the same dead end as an
    // email that does, and it has the same way out: sign in as the account
    // that already holds it, then the same form saves. A reader who is
    // already signed in has no way out to offer, so they read the shorter
    // sentence and change the number instead.
    const otherAccountHoldsPhone = saveError === 'phoneInUse' && !signedIn;
    const messageKey = saveError === 'phoneInUse' && signedIn ? 'phoneInUseSignedIn' : saveError;
    // The manual route stays on both email answers: an email can be slow or
    // filtered, and the reader should never be left with only a message to
    // look at. The email answers prefill the address the reader typed,
    // because that is the account; the phone answer prefills nothing — the
    // account that holds the number is another one, and naming its address
    // would tell a stranger whose it is.
    const wayIn =
        saveError === 'emailExists' || saveError === SIGN_IN_LINK_SENT
            ? signInHrefFor(email)
            : otherAccountHoldsPhone
              ? signInHrefFor()
              : null;

    useEffect(() => {
        if (!shown || failures === 0) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ref.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }, [failures, shown]);

    if (!shown) return null;
    return (
        <div
            ref={ref}
            role={linkSent ? 'status' : 'alert'}
            className={cn(
                'mt-5 flex scroll-mt-24 items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm',
                linkSent
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-red-200 bg-red-50 text-red-700',
            )}
        >
            {linkSent ? (
                <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div className="flex flex-col gap-1">
                {messageKey && (
                    <p>
                        {t(`errors.${messageKey}`)}
                        {wayIn && (
                            <>
                                {' '}
                                <Link href={wayIn} className="underline">
                                    {t('errors.signIn')}
                                </Link>
                            </>
                        )}
                    </p>
                )}
                {issues.map((issue) => (
                    <p key={issue}>{t(`issues.${issue}`)}</p>
                ))}
            </div>
        </div>
    );
}

/**
 * Where the sign-in link sends the reader: back here, signed in. An email
 * names the account to sign in as and fills the sign-in field; without one
 * the reader names the account themselves.
 */
function signInHrefFor(email?: string): string {
    const back = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
    const address = email?.trim();
    const filled = address ? `&email=${encodeURIComponent(address)}` : '';
    return `/sign-in?callbackUrl=${encodeURIComponent(back)}${filled}`;
}
