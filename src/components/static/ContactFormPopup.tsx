import { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2Icon, AlertTriangleIcon, User, Briefcase, Building2, Mail } from "lucide-react"
import { sendContactEmail } from '@/lib/email/contact'

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
            <DialogContent className="sm:max-w-[425px]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                >
                    {!showConfirmation && !showError ? (
                        <>
                            <DialogHeader className="text-center space-y-3 pb-2">
                                <DialogTitle className="text-2xl font-semibold">Επικοινωνήστε μαζί μας</DialogTitle>
                                <p className="text-sm text-muted-foreground leading-relaxed px-2">
                                    Για να επικοινωνήσετε μαζί μας ως εκπρόσωπος κάποιου δήμου, συμπληρώστε αυτή την φόρμα και θα επικοινωνήσουμε μαζί σας άμεσα.
                                </p>
                            </DialogHeader>
                            {calculatedPrice !== undefined && calculatedPrice !== null && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-5 rounded-lg my-4 flex flex-col items-center justify-center"
                                >
                                    <p className="text-center text-primary text-xs font-medium mb-1 uppercase tracking-wider">Εκτιμωμενο <span className="underline">ετησιο</span> κοστος</p>
                                    <p className="text-center text-primary font-bold text-3xl mt-1">
                                        {calculatedPrice?.toLocaleString('el-GR')}€ <span className="text-base font-medium">+ ΦΠΑ</span>
                                    </p>
                                </motion.div>
                            )}
                            <form onSubmit={handleContactRequest} className="space-y-1">
                                <div className="grid gap-5 py-2">
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="name" className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            Όνομα
                                        </Label>
                                        <Input
                                            id="name"
                                            value={contactName}
                                            onChange={(e) => setContactName(e.target.value)}
                                            className="h-11 transition-all duration-200 hover:border-primary/50 focus:border-primary"
                                            placeholder="Το όνομά σας"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="position" className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                                            Θέση στον δήμο
                                        </Label>
                                        <Input
                                            id="position"
                                            value={contactPosition}
                                            onChange={(e) => setContactPosition(e.target.value)}
                                            className="h-11 transition-all duration-200 hover:border-primary/50 focus:border-primary"
                                            placeholder="π.χ. Διευθυντής Υποστήριξης Συλλογικών Οργάνων"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="municipality" className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            Δήμος
                                        </Label>
                                        <Input
                                            id="municipality"
                                            value={contactMunicipality}
                                            onChange={(e) => setContactMunicipality(e.target.value)}
                                            className="h-11 transition-all duration-200 hover:border-primary/50 focus:border-primary"
                                            placeholder="Όνομα δήμου"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label htmlFor="email" className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            Email
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                            className="h-11 transition-all duration-200 hover:border-primary/50 focus:border-primary"
                                            placeholder="email@example.com"
                                            required
                                        />
                                    </div>
                                </div>
                                <DialogFooter className="sm:justify-center pt-6 pb-2">
                                    <Button
                                        type="submit"
                                        className="w-full sm:w-auto min-w-[200px] h-11 text-base font-medium shadow-md hover:shadow-lg transition-all duration-200"
                                    >
                                        Ζητήστε μια παρουσίαση
                                    </Button>
                                </DialogFooter>
                            </form>
                        </>
                    ) : showConfirmation ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 p-8 rounded-lg text-center"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            >
                                <CheckCircle2Icon className="mx-auto h-16 w-16 text-green-600 mb-4" />
                            </motion.div>
                            <h3 className="text-green-900 font-semibold text-xl mb-2">
                                Ευχαριστούμε!
                            </h3>
                            <p className="text-green-800 text-sm mb-6 leading-relaxed">
                                Θα επικοινωνήσουμε μαζί σας στο <span className="font-medium">{contactEmail}</span> άμεσα.
                            </p>
                            <Button onClick={onClose} className="bg-green-600 hover:bg-green-700 text-white">
                                Κλείσιμο
                            </Button>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 p-8 rounded-lg text-center"
                        >
                            <AlertTriangleIcon className="mx-auto h-16 w-16 text-yellow-600 mb-4" />
                            <h3 className="text-yellow-900 font-semibold text-xl mb-2">
                                Ωχ! Κάτι δεν πήγε καλά
                            </h3>
                            <p className="text-yellow-800 text-sm mb-6 leading-relaxed">
                                Μπορείτε να δοκιμάσετε ξανά ή να επικοινωνήσετε μαζί μας στο <a href="mailto:sales@touvlo.co" className="underline font-medium hover:text-yellow-900">sales@touvlo.co</a>.
                            </p>
                            <Button onClick={onClose} variant="secondary">
                                Κλείσιμο
                            </Button>
                        </motion.div>
                    )}
                </motion.div>
            </DialogContent>
        </Dialog>
    )
}