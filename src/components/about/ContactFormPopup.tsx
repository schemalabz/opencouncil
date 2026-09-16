'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Briefcase, Building2, CheckCircle2, Mail, User, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/routing'
import { sendContactEmail } from '@/lib/email/contact'
import { getRealmDomain } from '@/lib/realm'
import { formatCurrency } from '@/lib/utils'
import { PillButton, recordFont } from './primitives'

interface ContactFormPopupProps {
    isOpen: boolean
    onClose: () => void
    /** A yearly estimate from the calculator, shown above the form and sent along. */
    calculatedPrice?: number | null
    /** The realm names the petition page a resident should use instead of this form. */
    realm: Realm
}

type Status = 'form' | 'sending' | 'sent' | 'failed'

const EMPTY = { name: '', position: '', email: '', municipality: '' }

const inputClass =
    'h-11 rounded-xl border-border bg-card px-3.5 text-[15px] placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-0'

function Field({
    id,
    label,
    icon: Icon,
    ...input
}: { id: string; label: string; icon: LucideIcon } & React.ComponentProps<typeof Input>) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {label}
            </Label>
            <Input id={id} className={inputClass} required {...input} />
        </div>
    )
}

const pop = {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
}

/** The one form on the page: who you are, where, and how to reach you. Residents are sent to the petition instead. */
export default function ContactFormPopup({ isOpen, onClose, calculatedPrice, realm }: ContactFormPopupProps) {
    const t = useTranslations('about.contactForm')
    const [status, setStatus] = useState<Status>('form')
    const [form, setForm] = useState(EMPTY)

    // A reopened dialog starts on the form, not on the last outcome.
    useEffect(() => {
        if (isOpen) setStatus('form')
    }, [isOpen])

    const update = (key: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, [key]: e.target.value }))

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setStatus('sending')
        const result = await sendContactEmail({
            contactName: form.name,
            contactPosition: form.position,
            contactEmail: form.email,
            contactMunicipality: form.municipality,
            calculatedPrice,
        })
        setStatus(result.success ? 'sent' : 'failed')
    }

    const outcome = (icon: React.ReactNode, title: string, body: React.ReactNode, action: React.ReactNode) => (
        <motion.div {...pop} className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
            {icon}
            <h3 className="text-[22px] font-normal leading-tight tracking-[-0.01em] text-foreground">{title}</h3>
            <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground">{body}</p>
            <div className="pt-3">{action}</div>
        </motion.div>
    )

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="overflow-hidden p-0 sm:max-w-[480px] sm:rounded-2xl">
                {status === 'form' || status === 'sending' ? (
                    <div className="p-6 sm:p-8">
                        <DialogHeader className="space-y-1.5 text-left">
                            {/* Radix renders the title as an h2, which the global h2 rule centres and shrinks: override all three. */}
                            <DialogTitle className="!text-left !text-[22px] !font-normal leading-tight tracking-[-0.01em] text-foreground">{t('title')}</DialogTitle>
                            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</DialogDescription>
                        </DialogHeader>

                        {calculatedPrice != null && (
                            <div className="mt-5 flex items-baseline justify-between gap-4 rounded-xl bg-[hsl(24,100%,96%)] px-4 py-3.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[hsl(var(--orange-deep))]">{t('estimatedCost')}</span>
                                <span className="whitespace-nowrap">
                                    <span className="text-[24px] font-semibold tabular-nums text-foreground" style={recordFont}>{formatCurrency(calculatedPrice)}</span>{' '}
                                    <span className="text-sm text-muted-foreground">{t('vatSuffix')}</span>
                                </span>
                            </div>
                        )}

                        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
                            <Field id="name" label={t('name')} icon={User} value={form.name} onChange={update('name')} placeholder={t('namePlaceholder')} autoComplete="name" />
                            <Field id="position" label={t('position')} icon={Briefcase} value={form.position} onChange={update('position')} placeholder={t('positionPlaceholder')} autoComplete="organization-title" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field id="municipality" label={t('municipality')} icon={Building2} value={form.municipality} onChange={update('municipality')} placeholder={t('municipalityPlaceholder')} autoComplete="organization" />
                                <Field id="email" label="Email" icon={Mail} type="email" value={form.email} onChange={update('email')} placeholder="email@example.com" autoComplete="email" />
                            </div>
                            <PillButton type="submit" className="mt-1 w-full" disabled={status === 'sending'}>
                                {t('submit')}
                            </PillButton>
                        </form>

                        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-muted-foreground">
                            {t.rich('citizenNote', {
                                domain: getRealmDomain(realm),
                                link: (chunks) => (
                                    <Link href="/petition" className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                                        {chunks}
                                    </Link>
                                ),
                            })}
                        </p>
                    </div>
                ) : status === 'sent' ? (
                    outcome(
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 16 }}
                            className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(24,100%,96%)] text-[hsl(var(--orange-deep))]"
                        >
                            <CheckCircle2 className="h-7 w-7" strokeWidth={1.8} aria-hidden />
                        </motion.span>,
                        t('thankYou'),
                        t.rich('thankYouMessage', {
                            email: form.email,
                            strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                        }),
                        <PillButton onClick={onClose}>{t('close')}</PillButton>,
                    )
                ) : (
                    outcome(
                        <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-7 w-7" strokeWidth={1.8} aria-hidden />
                        </span>,
                        t('errorTitle'),
                        t.rich('errorMessage', {
                            email: (chunks) => <a href="mailto:sales@touvlo.co" className="font-medium text-foreground underline decoration-border underline-offset-4">{chunks}</a>,
                        }),
                        <PillButton variant="outline" onClick={onClose}>{t('errorClose')}</PillButton>,
                    )
                )}
            </DialogContent>
        </Dialog>
    )
}
