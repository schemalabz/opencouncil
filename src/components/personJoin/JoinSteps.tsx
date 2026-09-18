'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Check, Mail } from 'lucide-react';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import { StepHeading } from '@/components/signup/SignupChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { suggestEmailFix } from '@/lib/personJoin/email';
import type { JoinPersonView } from '@/lib/personJoin/stage';
import { cn } from '@/lib/utils';

/** Who the code is for: the face, the name, the title, the city. */
export function PersonCard({ person, className }: { person: JoinPersonView; className?: string }) {
    return (
        <div className={cn('flex items-center gap-4 rounded-2xl border border-foreground/15 bg-card p-4', className)}>
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
                <ImageOrInitials imageUrl={person.image} name={person.name} width={64} height={64} />
            </div>
            <div className="min-w-0">
                <p className="text-xl font-medium leading-tight">{person.name}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {person.title ? `${person.title} · ${person.cityName}` : person.cityName}
                </p>
            </div>
        </div>
    );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
    return (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[15px] leading-snug text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {children}
        </p>
    );
}

/** Step 1: is this you? */
export function ConfirmStep({ person, error }: { person: JoinPersonView; error: boolean }) {
    const t = useTranslations('personJoin');
    return (
        <div>
            <StepHeading eyebrow={t('confirm.eyebrow')} title={t('confirm.title')} lead={t('confirm.lead')} />
            <PersonCard person={person} className="mt-6" />
            {error && <ErrorLine>{t('confirm.error')}</ErrorLine>}
        </div>
    );
}

/** The other answer to step 1: the code belongs to somebody else. */
export function NotMeStep({ person }: { person: JoinPersonView }) {
    const t = useTranslations('personJoin');
    return (
        <div>
            <StepHeading title={t('notMe.title')} lead={t('notMe.lead', { name: person.name })} />
            <p className="mt-5 text-[15px] leading-[1.45] text-muted-foreground">{t('notMe.help')}</p>
        </div>
    );
}

/** Step 2: the email, with a second look at the usual slips in the domain. */
export function EmailStep({
    email,
    error,
    busy,
    onChange,
    onSubmit,
}: {
    email: string;
    error: 'invalid' | 'sendFailed' | null;
    busy: boolean;
    onChange: (email: string) => void;
    onSubmit: () => void;
}) {
    const t = useTranslations('personJoin');
    const suggestion = suggestEmailFix(email);
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                if (!busy) onSubmit();
            }}
        >
            <StepHeading title={t('email.title')} lead={t('email.lead')} />
            <div className="mt-6 flex flex-col gap-2">
                <Label htmlFor="join-email" className="text-[15px] font-medium">
                    {t('email.label')}
                </Label>
                {/* 16px and up, so a phone does not zoom into the field. */}
                <Input
                    id="join-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    value={email}
                    disabled={busy}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t('email.placeholder')}
                    aria-invalid={error === 'invalid'}
                    className="h-14 text-lg"
                />
            </div>
            {suggestion && (
                <div className="mt-3 rounded-xl border border-[hsl(var(--orange))]/40 bg-[hsl(var(--orange))]/5 p-3">
                    <p className="text-[15px] leading-snug">{t('email.suggestion', { email: suggestion })}</p>
                    <Button type="button" variant="outline" className="mt-2 h-10" onClick={() => onChange(suggestion)}>
                        {t('email.useSuggestion')}
                    </Button>
                </div>
            )}
            {error && <ErrorLine>{error === 'invalid' ? t('email.invalid') : t('email.sendFailed')}</ErrorLine>}
        </form>
    );
}

const RESEND_COOLDOWN_SECONDS = 30;

/** After step 2: what to do now, in three numbered lines, and the way out of a typo. */
export function SentStep({
    email,
    busy,
    error,
    onResend,
    onChange,
}: {
    email: string;
    busy: boolean;
    /** A resend that failed. */
    error: boolean;
    onResend: () => Promise<boolean>;
    onChange: () => void;
}) {
    const t = useTranslations('personJoin');
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
    const [resent, setResent] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    async function resend() {
        setResent(false);
        if (await onResend()) {
            setResent(true);
            setCooldown(RESEND_COOLDOWN_SECONDS);
        }
    }

    return (
        <div>
            <StepHeading
                leading={
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--orange))]/10" aria-hidden>
                        <Mail className="h-5 w-5 text-[hsl(var(--orange-deep))]" />
                    </span>
                }
                title={t('sent.title')}
                lead={t('sent.lead')}
            />
            <p className="mt-2 break-all text-xl font-medium">{email}</p>

            <ol className="mt-6 flex flex-col gap-3">
                {[t('sent.step1'), t('sent.step2'), t('sent.step3')].map((line, i) => (
                    <li key={i} className="flex items-start gap-3 text-[16px] leading-snug">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background" aria-hidden>
                            {i + 1}
                        </span>
                        <span className="pt-0.5">{line}</span>
                    </li>
                ))}
            </ol>

            <p className="mt-6 text-[15px] leading-[1.45] text-muted-foreground">{t('sent.spam')}</p>
            <p className="mt-2 text-[15px] leading-[1.45] text-muted-foreground">{t('sent.close')}</p>

            <div className="mt-6 flex flex-col gap-2 pb-8 sm:flex-row">
                <Button type="button" variant="outline" className="h-12 text-[15px]" disabled={busy || cooldown > 0} onClick={resend}>
                    {cooldown > 0 ? t('sent.resendIn', { seconds: cooldown }) : t('sent.resend')}
                </Button>
                <Button type="button" variant="ghost" className="h-12 text-[15px] text-muted-foreground" disabled={busy} onClick={onChange}>
                    {t('sent.change')}
                </Button>
            </div>
            {resent && (
                <p role="status" className="-mt-4 pb-8 text-[15px] text-emerald-700">
                    {t('sent.resent')}
                </p>
            )}
            {error && (
                <div className="-mt-4 pb-8">
                    <ErrorLine>{t('email.sendFailed')}</ErrorLine>
                </div>
            )}
        </div>
    );
}

export type ConsentChoice = 'yes' | 'no';

function ChoiceCard({
    selected,
    title,
    hint,
    onSelect,
}: {
    selected: boolean;
    title: string;
    hint: string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-[border-color,box-shadow] duration-300',
                selected
                    ? 'border-[hsl(var(--orange))]/60 shadow-[0_0_0_2px_hsl(var(--orange)/0.08),0_6px_18px_-12px_hsl(var(--orange)/0.35)]'
                    : 'border-foreground/15',
            )}
        >
            <span
                className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-[hsl(var(--orange-deep))] bg-[hsl(var(--orange-deep))]' : 'border-foreground/30',
                )}
                aria-hidden
            >
                {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </span>
            <span>
                <span className="block text-[17px] font-medium leading-tight">{title}</span>
                <span className="mt-1 block text-[15px] leading-snug text-muted-foreground">{hint}</span>
            </span>
        </button>
    );
}

/**
 * The last step: the consent, as a question with two answers of the same
 * weight. "Not now" finishes the flow as well: a consent the reader cannot
 * refuse is not a consent.
 */
export function ConsentStep({
    choice,
    error,
    onChoice,
}: {
    choice: ConsentChoice | null;
    error: boolean;
    onChoice: (choice: ConsentChoice) => void;
}) {
    const t = useTranslations('personJoin');
    return (
        <div>
            <StepHeading eyebrow={t('consent.eyebrow')} title={t('consent.title')} lead={t('consent.lead')} />
            <p className="mt-5 text-[16px] leading-[1.5]">{t('consent.explain')}</p>
            <div role="radiogroup" aria-label={t('consent.title')} className="mt-5 flex flex-col gap-3">
                <ChoiceCard selected={choice === 'yes'} title={t('consent.yes')} hint={t('consent.yesHint')} onSelect={() => onChoice('yes')} />
                <ChoiceCard selected={choice === 'no'} title={t('consent.no')} hint={t('consent.noHint')} onSelect={() => onChoice('no')} />
            </div>
            {error && <ErrorLine>{t('consent.error')}</ErrorLine>}
        </div>
    );
}
