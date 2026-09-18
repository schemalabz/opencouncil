'use client';

import { useTranslations } from 'next-intl';
import { XCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { DoneCheck } from '@/components/notifications/signup/CompleteScreen';
import { StepHeading } from '@/components/signup/SignupChrome';
import { useCelebration } from '@/components/signup/useCelebration';
import { Button } from '@/components/ui/button';
import type { JoinPersonView } from '@/lib/personJoin/stage';
import { PersonCard } from './JoinSteps';

/**
 * The join flow's page: one centred column at a reading measure, on a phone
 * and on a desktop alike. Room at the bottom for the pinned action bar.
 */
export function JoinLayout({ children }: { children: React.ReactNode }) {
    // The padding outside the measure, as the pinned bar has it, so the two line up.
    return (
        <div className="px-5 pb-32 lg:pb-16">
            <div className="mx-auto w-full max-w-lg">{children}</div>
        </div>
    );
}

/** Done: what happened, and the way to their page. */
export function JoinComplete({ person }: { person: JoinPersonView }) {
    const t = useTranslations('personJoin');
    useCelebration();
    return (
        <div className="pb-10">
            <StepHeading className="pt-6 lg:pt-10" leading={<DoneCheck />} title={t('done.title')} lead={t('done.lead')} />
            <PersonCard person={person} className="mt-6" />
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <Button asChild className="h-12 rounded-[10px] bg-[hsl(var(--orange-deep))] px-5 text-[15px] text-white hover:bg-[hsl(var(--orange-deep))]/90">
                    <Link href={`/${person.cityId}/people/${person.id}`}>{t('done.page')}</Link>
                </Button>
                <Button asChild variant="ghost" className="h-12 text-[15px] text-muted-foreground">
                    <Link href="/profile">{t('done.profile')}</Link>
                </Button>
            </div>
        </div>
    );
}

/**
 * A code that cannot go on: forged or expired, or a person that already has
 * an account. The code works once, so for everybody but that account it is
 * simply no longer valid. Signed out, the reader may be that account on
 * another phone, so a quiet link offers sign-in, which lands on the
 * profile. Centred in the space under the header.
 */
export function JoinProblem(
    props: { kind: 'invalid' } | { kind: 'used'; signedIn: boolean; own: boolean; person: JoinPersonView },
) {
    const t = useTranslations('personJoin');
    return (
        <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50" aria-hidden>
                <XCircle className="h-7 w-7 text-red-600" />
            </span>
            <h1 className="mt-6 text-[26px] font-normal leading-tight tracking-[-0.01em] lg:text-[30px]">
                {props.kind === 'used' ? t('problem.usedTitle') : t('problem.invalidTitle')}
            </h1>
            <p className="mt-3 text-[16px] leading-[1.5] text-muted-foreground">
                {props.kind === 'used' ? t('problem.used', { name: props.person.name }) : t('problem.invalid')}
            </p>
            {props.kind === 'used' && !props.own && (
                <p className="mt-2 text-[16px] leading-[1.5] text-muted-foreground">{t('problem.usedHelp')}</p>
            )}
            {props.kind === 'used' && props.own && (
                <Button asChild variant="outline" className="mt-8 h-12 w-full text-[15px] sm:w-auto sm:min-w-[220px]">
                    <Link href="/profile">{t('done.profile')}</Link>
                </Button>
            )}
            {props.kind === 'used' && !props.signedIn && (
                <p className="mt-8 text-[15px] text-muted-foreground">
                    {t('problem.usedYours')}{' '}
                    {/* Sign-in lands on the profile by default: the account is done. */}
                    <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
                        {t('problem.signIn')}
                    </Link>
                </p>
            )}
        </div>
    );
}
