'use client'

import { useState, FormEvent, useEffect } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { FileInput, LayoutTemplate, UsersIcon, PhoneIcon, PrinterIcon, ShieldCheckIcon, Users2Icon, ClockIcon, RocketIcon, CheckCircle2Icon, Cuboid } from "lucide-react"
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['greek', 'latin'] })

const fadeInUp: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 }
}

export default function Pricing() {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [councilCount, setCouncilCount] = useState(20)
    const [averageDuration, setAverageDuration] = useState(3)
    const [population, setPopulation] = useState(50000)
    const [needsAccuracyGuarantee, setNeedsAccuracyGuarantee] = useState(false)
    const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)
    const [showContactForm, setShowContactForm] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)
    const [contactName, setContactName] = useState('')
    const [contactPosition, setContactPosition] = useState('')
    const [contactEmail, setContactEmail] = useState('')
    const [contactMunicipality, setContactMunicipality] = useState('')

    useEffect(() => {
        if (isDialogOpen) {
            setShowContactForm(false)
            setShowConfirmation(false)
            setCalculatedPrice(null)
        }
    }, [isDialogOpen])

    const calculatePrice = () => {
        let monthlyFee = 0
        if (population <= 2000) {
            monthlyFee = 0
        } else if (population <= 10000) {
            monthlyFee = 100
        } else if (population <= 50000) {
            monthlyFee = 500
        } else if (population <= 100000) {
            monthlyFee = 1000
        } else {
            monthlyFee = 2000
        }

        const yearlyHostingFee = monthlyFee * 12
        const yearlySessionFee = councilCount * averageDuration * 6
        const yearlyAccuracyGuaranteeFee = needsAccuracyGuarantee ? councilCount * 80 : 0
        const totalYearlyPrice = yearlyHostingFee + yearlySessionFee + yearlyAccuracyGuaranteeFee

        setCalculatedPrice(totalYearlyPrice)
        setShowContactForm(true)
    }

    const handleContactRequest = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        // Here you would typically send the contact information to your backend
        console.log('Contact request:', { contactName, contactPosition, contactEmail, contactMunicipality, calculatedPrice })
        setShowConfirmation(true)
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            className={`container mx-auto px-4 py-16 ${inter.className}`}
        >
            <motion.h1 variants={fadeInUp} className="text-4xl font-bold text-center mb-4">Διαφανής τιμολόγηση</motion.h1>
            <motion.p variants={fadeInUp} className="text-xl text-center text-muted-foreground mb-12">Απλή και δίκαιη τιμολόγηση για δήμους κάθε μεγέθους</motion.p>

            <motion.div variants={fadeInUp} className="grid gap-8 md:grid-cols-2">
                <Card className="flex flex-col">
                    <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                        <div className="p-2">
                            <FileInput className="h-10 w-10 text-primary stroke-[1.5]" />
                        </div>
                        <div>
                            <CardTitle>Ψηφιοποίηση συνεδρίασης</CardTitle>
                            <CardDescription>Πληρώνεται μία φορά</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col justify-center flex-grow pt-2">
                        <p className="text-3xl font-bold">6€ / <span className="text-2xl">ώρα συνεδρίασης</span></p>
                        <p className="text-sm text-muted-foreground">Ίδια τιμή, ανεξαρτήτως μεγέθους δήμου</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                        <div className="p-2">
                            <LayoutTemplate className="h-10 w-10 text-primary stroke-[1.5]" />
                        </div>
                        <div>
                            <CardTitle>Χρήση Πλατφόρμας</CardTitle>
                            <CardDescription>Μηνιαία χρέωση βάσει πληθυσμού</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <ul className="space-y-2">
                            <li className="flex items-center">
                                <UsersIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span>Έως 2.000 κάτοικοι: <strong>Δωρεάν</strong></span>
                            </li>
                            <li className="flex items-center">
                                <UsersIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span>2.001 - 10.000 κάτοικοι: <strong>100€ / μήνα</strong></span>
                            </li>
                            <li className="flex items-center">
                                <UsersIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span>10.001 - 50.000 κάτοικοι: <strong>500€ / μήνα</strong></span>
                            </li>
                            <li className="flex items-center">
                                <UsersIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span>50.001 - 100.000 κάτοικοι: <strong>1.000€ / μήνα</strong></span>
                            </li>
                            <li className="flex items-center">
                                <UsersIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span>100.001+ κάτοικοι: <strong>2.000€ / μήνα</strong></span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.p variants={fadeInUp} className="text-center text-sm text-muted-foreground mt-4">
                Στις τιμές δε συμπεριλαμβάνεται ΦΠΑ
            </motion.p>

            <motion.div variants={fadeInUp} className="mt-12">
                <h2 className="text-2xl font-semibold mb-6 text-center">Επιπλέον πλεονεκτήματα</h2>
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <ul className="space-y-4">
                                <li className="flex items-start">
                                    <ClockIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Δωρεάν δοκιμαστική περίοδος, για όσο χρόνο χρειάζεστε</span>
                                </li>
                                <li className="flex items-start">
                                    <RocketIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Συμπεριλαμβάνονται όλες οι τωρινές και μελλοντικές λειτουργίες του OpenCouncil</span>
                                </li>
                                <li className="flex items-start">
                                    <PhoneIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Τηλεφωνική υποστήριξη, καθημερινά 09:00 - 21:00</span>
                                </li>
                            </ul>
                            <ul className="space-y-4 flex flex-col justify-between h-full">
                                <li className="flex items-start">
                                    <PrinterIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Παράδοση αρχείου σε έντυπη μορφή και σε CD, δύο φορές το χρόνο</span>
                                </li>
                                <li className="flex items-start">
                                    <ShieldCheckIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Προαιρετικά, εγγύηση ορθότητας πρακτικών με <strong>80€</strong> ανά συνεδρίαση</span>
                                </li>
                                <li className="flex items-start">
                                    <Cuboid className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Προτείνετε νέες λειτουργίες και διαμορφώστε μαζί μας το OpenCouncil</span>
                                </li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div variants={fadeInUp} className="mt-12 text-center">
                <Button size="lg" onClick={() => setIsDialogOpen(true)}>Υπολογίστε το συμβόλαιό σας</Button>
            </motion.div>

            <AnimatePresence>
                {isDialogOpen && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="sm:max-w-[425px]">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                            >
                                {!showContactForm && !showConfirmation ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle>Υπολογίστε το ετήσιο κόστος</DialogTitle>
                                            <DialogDescription>
                                                Συμπληρώστε τα παρακάτω στοιχεία για να υπολογίσετε το ετήσιο κόστος του συμβολαίου σας.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="grid gap-6 py-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="councilCount">
                                                    Αριθμός συμβουλίων ανά έτος
                                                </Label>
                                                <Slider
                                                    id="councilCount"
                                                    min={10}
                                                    max={50}
                                                    step={1}
                                                    value={[councilCount]}
                                                    onValueChange={(value) => setCouncilCount(value[0])}
                                                />
                                                <div className="text-right text-sm text-muted-foreground">
                                                    {councilCount}
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="averageDuration">
                                                    Μέση διάρκεια συνεδρίασης (ώρες)
                                                </Label>
                                                <Slider
                                                    id="averageDuration"
                                                    min={1}
                                                    max={8}
                                                    step={1}
                                                    value={[averageDuration]}
                                                    onValueChange={(value) => setAverageDuration(value[0])}
                                                />
                                                <div className="text-right text-sm text-muted-foreground">
                                                    {averageDuration}
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="population">
                                                    Πληθυσμός
                                                </Label>
                                                <Slider
                                                    id="population"
                                                    min={2000}
                                                    max={200000}
                                                    step={1000}
                                                    value={[population]}
                                                    onValueChange={(value) => setPopulation(value[0])}
                                                />
                                                <div className="text-right text-sm text-muted-foreground">
                                                    {population <= 2000 ? '2000 or fewer' : population >= 200000 ? '200000 or more' : population}
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <Switch
                                                    id="accuracy-guarantee"
                                                    checked={needsAccuracyGuarantee}
                                                    onCheckedChange={setNeedsAccuracyGuarantee}
                                                />
                                                <Label htmlFor="accuracy-guarantee">
                                                    Χρειάζεστε εγγύηση ορθότητας πρακτικών;
                                                </Label>
                                            </div>
                                        </div>
                                        <DialogFooter className="sm:justify-center">
                                            <Button onClick={calculatePrice}>Υπολογισμός</Button>
                                        </DialogFooter>
                                    </>
                                ) : showContactForm && !showConfirmation ? (
                                    <>
                                        <div className="bg-primary/10 p-4 rounded-md mb-4 flex flex-col items-center justify-center">
                                            <p className="text-center text-primary text-sm mb-1">Εκτιμώμενο <span className="underline">ετήσιο</span> κόστος</p>
                                            <p className="text-center text-primary font-semibold text-2xl">
                                                <strong>{calculatedPrice}€ + ΦΠΑ</strong>
                                            </p>
                                        </div>
                                        <p className="text-center mb-4">Μπορούμε να επικοινωνήσουμε μαζί σας;</p>
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
                                ) : (
                                    <div className="bg-green-100 p-6 rounded-md text-center">
                                        <CheckCircle2Icon className="mx-auto h-12 w-12 text-green-500 mb-4" />
                                        <p className="text-green-800 font-semibold text-lg mb-2">
                                            Θα επικοινωνήσουμε μαζί σας στο {contactEmail}
                                        </p>
                                        <Button onClick={() => {
                                            setIsDialogOpen(false)
                                            setShowContactForm(false)
                                            setShowConfirmation(false)
                                        }} className="mt-4">
                                            Κλείσιμο
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                )}
            </AnimatePresence>
        </motion.div>
    )
}