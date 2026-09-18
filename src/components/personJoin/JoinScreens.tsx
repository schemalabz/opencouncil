'use client';

import { useTranslations } from 'next-intl';
import { QrCode, XCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { DoneCheck } from '@/components/notifications/signup/CompleteScreen';
import { StepHeading } from '@/components/signup/SignupChrome';
import { useCelebration } from '@/components/signup/useCelebration';
import { Button } from '@/components/ui/button';
import { personJoinPagePath } from '@/lib/personJoin/paths';
import type { JoinPersonView } from '@/lib/personJoin/stage';
import { PersonCard } from './JoinSteps';

/** Done: what happened, what they answered, and the way to their page. */
export function JoinComplete({ person, consentGiven }: { person: JoinPersonView; consentGiven: boolean }) {
    const t = useTranslations('personJoin');
    useCelebration();
    return (
        <div className="pb-10">
            <StepHeading className="pt-6 lg:pt-10" leading={<DoneCheck />} title={t('done.title')} lead={t('done.lead')} />
            <PersonCard person={person} className="mt-6" />
            <p className="mt-5 text-[15px] leading-[1.45] text-muted-foreground">
                {consentGiven ? t('done.consentYes') : t('done.consentNo')}
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
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
 * A code that cannot go on: forged or expired, or a person some account
 * already claimed. Signed out, "used" cannot tell whose account that is;
 * it may be the reader's own, from another phone. So it offers sign-in,
 * which comes back here and lands on their consent step.
 */
export function JoinProblem(
    props: { kind: 'invalid' } | { kind: 'usedSignedOut' | 'usedOther'; person: JoinPersonView; token: string },
) {
    const t = useTranslations('personJoin');
    const used = props.kind !== 'invalid';
    return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
            {used ? <QrCode className="h-12 w-12 text-muted-foreground" /> : <XCircle className="h-12 w-12 text-destructive" />}
            <h1 className="text-xl font-semibold">{used ? t('problem.usedTitle') : t('problem.invalidTitle')}</h1>
            <p className="text-muted-foreground">
                {props.kind === 'invalid' && t('problem.invalid')}
                {props.kind === 'usedSignedOut' && t('problem.usedSignedOut', { name: props.person.name })}
                {props.kind === 'usedOther' && t('problem.usedOther', { name: props.person.name })}
            </p>
            {props.kind === 'usedSignedOut' && (
                <Button asChild className="h-12 px-6 text-[15px]">
                    <Link href={`/sign-in?callbackUrl=${encodeURIComponent(personJoinPagePath(props.person.cityId, props.token))}`}>
                        {t('problem.signIn')}
                    </Link>
                </Button>
            )}
        </div>
    );
}
