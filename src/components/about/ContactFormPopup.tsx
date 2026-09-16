import { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2Icon, AlertTriangleIcon, User, Briefcase, Building2, Mail } from "lucide-react"
import { sendContactEmail } from '@/lib/email/contact'
import { formatCurrency } from '@/lib/utils'

interface ContactFormPopupProps {
    isOpen: boolean;
    onClose: () => void;
    calculatedPrice?: number | null;
}

export default function ContactFormPopup({ isOpen, onClose, calculatedPrice }: ContactFormPopupProps) {
    const t = useTranslations('about.contactForm')
    const [showConfirmation, setShowConfirmation] = useState(false)
    const [showError, setShowError] = useState(false)
    const [contactName, setContactName] = useState('')
    const [contactPosition, setContactPosition] = useState('')
    const [contactEmail, setContactEmail] = useState('')
    const [contactMunicipality, setContactMunicipality] = useState('')

    const handleContactRequest = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const result = await sendContactEmail({
            contactName,
            contactPosition,
            contactEmail,
            contactMunicipality,
            calculatedPrice
        })
        if (result.success) {
            setShowConfirmation(true)
        } else {
            setShowError(true)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden">
                {!showConfirmation && !showError ? (
                    <div className="p-6 sm:p-8">
                        <DialogHeader className="text-center space-y-2 pb-2">
                            <DialogTitle className="text-xl font-semibold">{t('title')}</DialogTitle>
                            <DialogDescription className="text-sm leading-relaxed">
                                {t('subtitle')}
                            </DialogDescription>
                        </DialogHeader>

                        {calculatedPrice !== undefined && calculatedPrice !== null && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl bg-primary/[0.06] border border-primary/15 p-4 my-4 text-center"
                            >
                                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">{t('estimatedCost')}</p>
                                <p className="text-primary font-bold text-2xl">
                                    {calculatedPrice != null ? formatCurrency(calculatedPrice) : ''} <span className="text-sm font-medium text-muted-foreground">{t('vatSuffix')}</span>
                                </p>
                            </motion.div>
                        )}

                        <form onSubmit={handleContactRequest} className="space-y-4 pt-2">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                        {t('name')}
                                    </Label>
                                    <Input
                                        id="name"
                                        value={contactName}
                                        onChange={(e) => setContactName(e.target.value)}
                                        className="h-10 rounded-lg"
                                        placeholder={t('namePlaceholder')}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="position" className="text-sm font-medium flex items-center gap-2">
                                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                        {t('position')}
                                    </Label>
                                    <Input
                                        id="position"
                                        value={contactPosition}
                                        onChange={(e) => setContactPosition(e.target.value)}
                                        className="h-10 rounded-lg"
                                        placeholder={t('positionPlaceholder')}
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="municipality" className="text-sm font-medium flex items-center gap-2">
                                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                            {t('municipality')}
                                        </Label>
                                        <Input
                                            id="municipality"
                                            value={contactMunicipality}
                                            onChange={(e) => setContactMunicipality(e.target.value)}
                                            className="h-10 rounded-lg"
                                            placeholder={t('municipalityPlaceholder')}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                            Email
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                            className="h-10 rounded-lg"
                                            placeholder="email@example.com"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-11 rounded-xl text-base font-medium shadow-md hover:shadow-lg transition-all duration-200"
                            >
                                {t('submit')}
                            </Button>
                        </form>
                    </div>
                ) : showConfirmation ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-8 sm:p-12 text-center"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                        >
                            <CheckCircle2Icon className="h-8 w-8 text-primary" />
                        </motion.div>
                        <h3 className="font-semibold text-xl mb-2">{t('thankYou')}</h3>
                        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                            {t.rich('thankYouMessage', {
                                email: contactEmail,
                                strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                            })}
                        </p>
                        <Button onClick={onClose} className="rounded-xl px-8">
                            {t('close')}
                        </Button>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-8 sm:p-12 text-center"
                    >
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangleIcon className="h-8 w-8 text-destructive" />
                        </div>
                        <h3 className="font-semibold text-xl mb-2">{t('errorTitle')}</h3>
                        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                            {t.rich('errorMessage', {
                                email: (chunks) => <a href="mailto:sales@touvlo.co" className="underline font-medium text-foreground hover:text-primary">{chunks}</a>,
                            })}
                        </p>
                        <Button onClick={onClose} variant="outline" className="rounded-xl px-8">
                            {t('errorClose')}
                        </Button>
                    </motion.div>
                )}
            </DialogContent>
        </Dialog>
    )
}
