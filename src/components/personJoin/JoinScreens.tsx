'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { XCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { DoneCheck } from '@/components/notifications/signup/CompleteScreen';
import { Eyebrow, StepHeading } from '@/components/signup/SignupChrome';
import { useCelebration } from '@/components/signup/useCelebration';
import { Button } from '@/components/ui/button';
import { CtaButton } from '@/components/ui/cta-button';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { JoinPersonView } from '@/lib/personJoin/stage';
import { cn } from '@/lib/utils';
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

// `hover:no-underline` because this renders as an anchor, and globals.css
// underlines every anchor on hover.
const QUIET_BUTTON = 'h-12 text-[15px] text-muted-foreground hover:no-underline';

/**
 * Done: what happened, then the one thing to do next. With the city's
 * notifications on offer, the invitation to them is the screen's action and
 * the way to their page steps aside; without, their page is the action.
 */
export function JoinComplete({ person, offerNotifications }: { person: JoinPersonView; offerNotifications: boolean }) {
    const t = useTranslations('personJoin');
    useCelebration();
    return (
        <div className="pb-10">
            <StepHeading className="pt-6 lg:pt-10" leading={<DoneCheck />} title={t('done.title')} lead={t('done.lead')} />
            <PersonCard person={person} className="mt-6" />
            {offerNotifications && <NotificationsInvite cityId={person.cityId} />}
            <div className={cn('flex flex-col gap-2 sm:flex-row', offerNotifications ? 'mt-4' : 'mt-8')}>
                {offerNotifications ? (
                    <Button asChild variant="ghost" className={QUIET_BUTTON}>
                        <Link href={`/${person.cityId}/people/${person.id}`}>{t('done.page')}</Link>
                    </Button>
                ) : (
                    <CtaButton href={`/${person.cityId}/people/${person.id}`} size="md" arrow={false}>
                        {t('done.page')}
                    </CtaButton>
                )}
                <Button asChild variant="ghost" className={QUIET_BUTTON}>
                    <Link href="/profile">{t('done.profile')}</Link>
                </Button>
            </div>
        </div>
    );
}

/**
 * The invitation to the city's notifications. A councillor who just made an
 * account is the reader Νότης serves best, and this is the moment they are
 * listening. The card makes the case itself, so the button skips the
 * signup's explainer and lands on step 2, where the reader says what
 * concerns them — the same landing the city page's card uses.
 */
function NotificationsInvite({ cityId }: { cityId: string }) {
    const t = useTranslations('personJoin');
    // The heading names the region, so a screen reader announces what it
    // offers instead of repeating the eyebrow.
    const titleId = useId();
    return (
        <section className={cn(surfaceCardClass, 'mt-6 p-4')} aria-labelledby={titleId}>
            <Eyebrow className="block">{t('done.notifyEyebrow')}</Eyebrow>
            {/* globals.css centres every h2 outside `.prose` and forces 24px, so both are overridden here. */}
            <h2 id={titleId} className="mt-2 !text-left !text-[22px] font-normal leading-tight tracking-[-0.01em]">{t('done.notifyTitle')}</h2>
            <p className="mt-2 text-[15px] leading-[1.45] text-muted-foreground">{t('done.notifyBody')}</p>
            <CtaButton
                href={`/${cityId}/notifications?step=2`}
                event="person_join_notifications_clicked"
                eventProps={{ city_id: cityId }}
                size="md"
                className="mt-4 w-full"
            >
                {t('done.notifyCta')}
            </CtaButton>
        </section>
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
