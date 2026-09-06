'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eyebrow } from './SignupChrome';

/**
 * The account a signed-out reader makes on the way: a name and the email
 * that signs them in, magic link and no password. Both flows end with it;
 * each says in its own words why it wants it (the hint).
 */
export function AccountFields({
    name,
    email,
    hint,
    onChange,
    children,
}: {
    name: string;
    email: string;
    hint: string;
    onChange: (patch: { name?: string; email?: string }) => void;
    /** Extra fields of the flow's own, after the email. */
    children?: React.ReactNode;
}) {
    const t = useTranslations('signup');
    return (
        <section className="mt-7 flex flex-col gap-1">
            <Eyebrow>{t('account.eyebrow')}</Eyebrow>
            <span className="text-xs text-muted-foreground">{hint}</span>

            <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor="signup-name" className="text-[13px] font-medium">
                    {t('account.nameLabel')}
                </Label>
                <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder={t('account.namePlaceholder')}
                    className="h-11 text-base md:text-sm"
                />
            </div>

            <div className="mt-3.5 flex flex-col gap-1.5">
                <Label htmlFor="signup-email" className="text-[13px] font-medium">
                    {t('account.emailLabel')}
                </Label>
                <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => onChange({ email: e.target.value })}
                    placeholder={t('account.emailPlaceholder')}
                    className="h-11 text-base md:text-sm"
                />
                <p className="text-xs leading-[1.4] text-muted-foreground">{t('account.emailHint')}</p>
            </div>

            {children}
        </section>
    );
}
