'use client'

import { useState, FormEvent, useEffect } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { FileInput, LayoutTemplate, UsersIcon, PhoneIcon, PrinterIcon, ShieldCheckIcon, Users2Icon, ClockIcon, RocketIcon, CheckCircle2Icon, Cuboid, ChevronDownIcon, LayoutTemplateIcon, RotateCcw, Gem, FileBadge2, Megaphone } from "lucide-react"
import { Inter } from 'next/font/google'
import ContactFormPopup from './ContactFormPopup'
import React from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { formatCurrency } from '@/lib/utils'
import {
    estimateYearlyPricing,
    PLATFORM_PRICING_TIERS,
    SESSION_PROCESSING,
    getCurrentCorrectnessGuaranteePrice
} from '@/lib/pricing'

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
    const [isContactFormOpen, setIsContactFormOpen] = useState(false)
    const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)

    useEffect(() => {
        if (isDialogOpen) {
            setIsContactFormOpen(false)
            setCalculatedPrice(null)
        }
    }, [isDialogOpen])

    const calculatePrice = () => {
        const estimate = estimateYearlyPricing(
            population,
            councilCount,
            averageDuration,
            needsAccuracyGuarantee
        )

        setCalculatedPrice(estimate.totalYearlyCost)
        setIsContactFormOpen(true)
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            className={`container mx-auto px-4 py-16 ${inter.className}`}
        >
            <motion.h1 variants={fadeInUp} className="text-4xl font-bold text-center mb-4">Διαφανής τιμολόγηση</motion.h1>
            <motion.p variants={fadeInUp} className="text-xl text-center text-muted-foreground mb-12">Απλή και δίκαιη τιμολόγηση για δήμους κάθε μεγέθους</motion.p>

            <PricingCards setIsDialogOpen={setIsDialogOpen} />



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
                                <li className="flex items-start">
                                    <RotateCcw className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Δυνατότητα συμπερίληψης παλαιότερων συνεδριάσεων</span>
                                </li>
                            </ul>
                            <ul className="space-y-4 flex flex-col justify-between h-full">
                                <li className="flex items-start">
                                    <PrinterIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Παράδοση αρχείου σε έντυπη μορφή ή και CD, μία φορά το χρόνο</span>
                                </li>
                                <li className="flex items-start">
                                    <Cuboid className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Προτείνετε νέες λειτουργίες και διαμορφώστε μαζί μας το OpenCouncil</span>
                                </li>
                                <li className="flex items-start">
                                    <Gem className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Πιλοτική τιμή που ισχύει για τους πρώτους 8 δήμους</span>
                                </li>
                                <li className="flex items-start">
                                    <Megaphone className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>Προώθηση του OpenCouncil στους δημότες, online αλλά και δια ζώσης</span>
                                </li>
                            </ul>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-200">
                            <h3 className="text-lg font-semibold mb-4 text-gray-600">Με επιπλέον χρέωση:</h3>
                            <ul className="space-y-4">
                                <li className="flex items-start">
                                    <div className="mr-2 h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5 rounded-full border-2 border-orange-500 flex items-center justify-center">
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                    </div>
                                    <span>Παροχή εξοπλισμού για τη μαγνητοσκόπηση συνεδριάσεων (π.χ. Δημοτικής Επιτροπής, Δημοτικών Συμβουλίων ή Κοινοτήτων)</span>
                                </li>
                                <li className="flex items-start">
                                    <div className="mr-2 h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5 rounded-full border-2 border-orange-500 flex items-center justify-center">
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                    </div>
                                    <span>Τεχνική υποστήριξη με φυσική παρουσία σε κάθε συνεδρίαση</span>
                                </li>
                                <li className="flex items-start">
                                    <div className="mr-2 h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5 rounded-full border-2 border-orange-500 flex items-center justify-center">
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                    </div>
                                    <span>Διόρθωση των αυτόματων απομαγνητοφωνήσεων από άνθρωπο, ώστε να είναι κατάλληλα για τα επίσημα πρακτικά του δήμου.</span>
                                </li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
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
                                            {population <= 2000 ? 'μέχρι 2.000' : population >= 200000 ? '200.000 και πάνω' : population}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="accuracy-guarantee"
                                            checked={needsAccuracyGuarantee}
                                            onCheckedChange={setNeedsAccuracyGuarantee}
                                        />
                                        <Label htmlFor="accuracy-guarantee">
                                            Χρειάζεστε εγγύηση ορθότητας απομαγνητοφωνήσεων;
                                        </Label>
                                    </div>
                                </div>
                                <DialogFooter className="sm:justify-center">
                                    <Button onClick={calculatePrice}>Υπολογισμός</Button>
                                </DialogFooter>
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                )}
            </AnimatePresence>

            <ContactFormPopup
                isOpen={isContactFormOpen}
                onClose={() => setIsContactFormOpen(false)}
                calculatedPrice={calculatedPrice}
            />
        </motion.div>
    )
}
export function PricingCards({ setIsDialogOpen }: { setIsDialogOpen: (open: boolean) => void }) {
    const [isOpen, setIsOpen] = React.useState(false)

    const toggleOpen = () => {
        setIsOpen(!isOpen)
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            className="container mx-auto px-4 py-16"
        >
            <motion.div variants={fadeInUp} className="flex flex-col lg:flex-row items-stretch gap-8 relative">
                <div className="flex-1">
                    <PricingCard
                        icon={<FileInput className="h-10 w-10 text-primary stroke-[1.5]" />}
                        title={SESSION_PROCESSING.label}
                        description={SESSION_PROCESSING.description}
                        price={`${formatCurrency(SESSION_PROCESSING.pricePerHour)} / ώρα συνεδρίασης`}
                        subtext="Χρέωση ανά συνεδρίαση"
                        includedItems={[
                            "Αυτόματη απομαγνητοφώνηση και αναγνώριση ομιλιτή.",
                            "Δημιουργία embeddings για κάθε τοποθέτηση ομιλητή",
                            "Αυτόματες συνόψεις ανά τοποθέτηση.",
                            "Εξαγωγή στατιστικών"
                        ]}
                        isOpen={isOpen}
                        toggleOpen={toggleOpen}
                        content={null}
                    />
                </div>

                <div className="flex-shrink-0 self-center">
                    <div className="bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold">
                        και
                    </div>
                </div>

                <div className="flex-1">
                    <PricingCard
                        icon={<LayoutTemplateIcon className="h-10 w-10 text-primary stroke-[1.5]" />}
                        title="Χρήση Πλατφόρμας"
                        description="Τιμολόγηση βάσει μεγέθους δήμου"
                        price=""  // Add an empty string or appropriate price
                        subtext=""  // Add an empty string or appropriate subtext
                        content={
                            <ul className="space-y-2">
                                {PLATFORM_PRICING_TIERS.map((tier, index) => (
                                    <PricingTier
                                        key={index}
                                        icon={<UsersIcon />}
                                        population={tier.label}
                                        price={tier.monthlyPrice === 0 ? "Δωρεάν" : `${formatCurrency(tier.monthlyPrice)} / μήνα`}
                                    />
                                ))}
                            </ul>
                        }
                        includedItems={[
                            "Ελεύθερη χρήση για όλους τους δημότες.",
                            "Όλες τις λειτουργίες της πλατφόρμας",
                            "1000 μηνύματα με το AI Chat ανά ημέρα.",
                            "Τεχνική υποστήριξη"
                        ]}
                        isOpen={isOpen}
                        toggleOpen={toggleOpen}
                    />
                </div>
            </motion.div>
            <motion.p variants={fadeInUp} className="text-center text-sm text-muted-foreground mt-4">
                Στις τιμές δε συμπεριλαμβάνεται ΦΠΑ
            </motion.p>

            <motion.div variants={fadeInUp} className="mt-12 text-center">
                <Button size="lg" onClick={() => setIsDialogOpen(true)}>Υπολογίστε το συμβόλαιό σας</Button>
            </motion.div>
        </motion.div>
    )
}

function PricingCard(
    { icon, title, description, price, subtext, content, includedItems, isOpen, toggleOpen }
        : { icon: React.ReactElement, title: string, description: string, price: string, subtext: string, content: React.ReactNode, includedItems: string[], isOpen: boolean, toggleOpen: () => void }
) {
    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-start space-x-4 pb-2">
                <div className="p-2 flex-shrink-0">
                    {icon}
                </div>
                <div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col justify-start flex-grow pt-2">
                {price && (
                    <>
                        <p className="text-3xl font-bold">{price}</p>
                        {subtext && <p className="text-sm text-muted-foreground">{subtext}</p>}
                    </>
                )}
                {content}
            </CardContent>
            <CardFooter className="pt-2 mt-auto">
                <Collapsible className="w-full" open={isOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full" onClick={toggleOpen}>
                            Τι περιλαμβάνει <ChevronDownIcon className={`h-4 w-4 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                        <ul className="list-disc pl-5 space-y-1">
                            {includedItems.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </CollapsibleContent>
                </Collapsible>
            </CardFooter>
        </Card>
    )
}

function PricingTier({ icon, population, price }: { icon: React.ReactElement, population: string, price: string }) {
    return (
        <li className="flex items-center">
            {React.cloneElement(icon, { className: "mr-2 h-4 w-4 text-primary flex-shrink-0" })}
            <span>{population}: <strong>{price}</strong></span>
        </li>
    )
}