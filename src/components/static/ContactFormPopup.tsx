import { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
                            <DialogTitle className="text-xl font-semibold">Επικοινωνήστε μαζί μας</DialogTitle>
                            <DialogDescription className="text-sm leading-relaxed">
                                Συμπληρώστε τα στοιχεία σας και θα επικοινωνήσουμε μαζί σας άμεσα.
                            </DialogDescription>
                        </DialogHeader>

                        {calculatedPrice !== undefined && calculatedPrice !== null && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl bg-primary/[0.06] border border-primary/15 p-4 my-4 text-center"
                            >
                                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Εκτιμώμενο ετήσιο κόστος</p>
                                <p className="text-primary font-bold text-2xl">
                                    {calculatedPrice != null ? formatCurrency(calculatedPrice) : ''} <span className="text-sm font-medium text-muted-foreground">+ ΦΠΑ</span>
                                </p>
                            </motion.div>
                        )}

                        <form onSubmit={handleContactRequest} className="space-y-4 pt-2">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                        Όνομα
                                    </Label>
                                    <Input
                                        id="name"
                                        value={contactName}
                                        onChange={(e) => setContactName(e.target.value)}
                                        className="h-10 rounded-lg"
                                        placeholder="Το όνομά σας"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="position" className="text-sm font-medium flex items-center gap-2">
                                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                        Θέση στον δήμο
                                    </Label>
                                    <Input
                                        id="position"
                                        value={contactPosition}
                                        onChange={(e) => setContactPosition(e.target.value)}
                                        className="h-10 rounded-lg"
                                        placeholder="π.χ. Διευθυντής Υποστήριξης Συλλογικών Οργάνων"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="municipality" className="text-sm font-medium flex items-center gap-2">
                                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                            Δήμος
                                        </Label>
                                        <Input
                                            id="municipality"
                                            value={contactMunicipality}
                                            onChange={(e) => setContactMunicipality(e.target.value)}
                                            className="h-10 rounded-lg"
                                            placeholder="Όνομα δήμου"
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
                                Ζητήστε μια παρουσίαση
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
                        <h3 className="font-semibold text-xl mb-2">Ευχαριστούμε!</h3>
                        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                            Θα επικοινωνήσουμε μαζί σας στο <span className="font-medium text-foreground">{contactEmail}</span> άμεσα.
                        </p>
                        <Button onClick={onClose} className="rounded-xl px-8">
                            Κλείσιμο
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
                        <h3 className="font-semibold text-xl mb-2">Κάτι δεν πήγε καλά</h3>
                        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                            Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας στο{' '}
                            <a href="mailto:sales@touvlo.co" className="underline font-medium text-foreground hover:text-primary">sales@touvlo.co</a>
                        </p>
                        <Button onClick={onClose} variant="outline" className="rounded-xl px-8">
                            Κλείσιμο
                        </Button>
                    </motion.div>
                )}
            </DialogContent>
        </Dialog>
    )
}