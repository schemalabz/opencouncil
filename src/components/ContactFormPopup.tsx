import { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2Icon, AlertTriangleIcon } from "lucide-react"
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
                            <DialogHeader>
                                <DialogTitle>Επικοινωνήστε μαζί μας</DialogTitle>
                                <DialogDescription>
                                    Συμπληρώστε τα παρακάτω στοιχεία και θα επικοινωνήσουμε μαζί σας σύντομα.
                                </DialogDescription>
                            </DialogHeader>
                            {calculatedPrice !== undefined && calculatedPrice !== null && (
                                <div className="bg-primary/10 p-4 rounded-md mb-4 flex flex-col items-center justify-center">
                                    <p className="text-center text-primary text-sm mb-1">Εκτιμώμενο <span className="underline">ετήσιο</span> κόστος</p>
                                    <p className="text-center text-primary font-semibold text-2xl">
                                        <strong>{calculatedPrice}€ + ΦΠΑ</strong>
                                    </p>
                                </div>
                            )}
                            <form onSubmit={handleContactRequest}>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Όνομα</Label>
                                        <Input
                                            id="name"
                                            value={contactName}
                                            onChange={(e) => setContactName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="position">Θέση</Label>
                                        <Input
                                            id="position"
                                            value={contactPosition}
                                            onChange={(e) => setContactPosition(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="municipality">Δήμος</Label>
                                        <Input
                                            id="municipality"
                                            value={contactMunicipality}
                                            onChange={(e) => setContactMunicipality(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <DialogFooter className="sm:justify-center">
                                    <Button type="submit">Επικοινωνήστε μαζί μου</Button>
                                </DialogFooter>
                            </form>
                        </>
                    ) : showConfirmation ? (
                        <div className="bg-green-100 p-6 rounded-md text-center">
                            <CheckCircle2Icon className="mx-auto h-12 w-12 text-green-500 mb-4" />
                            <p className="text-green-800 font-semibold text-lg mb-2">
                                Θα επικοινωνήσουμε μαζί σας στο {contactEmail}
                            </p>
                            <Button onClick={onClose} className="mt-4">
                                Κλείσιμο
                            </Button>
                        </div>
                    ) : (
                        <div className="bg-yellow-100 p-6 rounded-md text-center">
                            <AlertTriangleIcon className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
                            <p className="text-yellow-800 font-semibold text-lg mb-2">
                                Ωχ! Κάτι δεν πήγε καλά. Μπορείτε να δοκιμάσετε ξανά ή να επικοινωνήσετε μαζί μας στο sales@touvlo.co.
                            </p>
                            <Button onClick={onClose} className="mt-4">
                                Κλείσιμο
                            </Button>
                        </div>
                    )}
                </motion.div>
            </DialogContent>
        </Dialog>
    )
}