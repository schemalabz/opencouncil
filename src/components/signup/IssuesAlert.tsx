'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { SignupIssue } from './signup-shared';

/**
 * Why the last step did not submit: the save action's answer first, then
 * what the reader still has to fill. An existing account gets the way in.
 */
export function IssuesAlert({
    saveError,
    issues,
    signInHref,
}: {
    /** The save action's answer, as a key under `signup.errors`. */
    saveError: string | null;
    issues: SignupIssue[];
    signInHref: string;
}) {
    const t = useTranslations('signup');
    if (!saveError && issues.length === 0) return null;
    return (
        <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
                {saveError && (
                    <p>
                        {t(`errors.${saveError}`)}
                        {saveError === 'emailExists' && (
                            <>
                                {' '}
                                <Link href={signInHref} className="underline">
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

/** Where the sign-in link sends an existing account: back here, with the email filled. */
export function signInHrefFor(email: string): string {
    const back = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
    return `/sign-in?callbackUrl=${encodeURIComponent(back)}&email=${encodeURIComponent(email.trim())}`;
}
