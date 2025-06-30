'use client'

import { useState, FormEvent, useEffect } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { FileInput, LayoutTemplate, UsersIcon, PhoneIcon, PrinterIcon, ShieldCheckIcon, Users2Icon, ClockIcon, RocketIcon, CheckCircle2Icon, Cuboid, ChevronDownIcon, LayoutTemplateIcon, RotateCcw, Gem, FileBadge2 } from "lucide-react"
import { Inter } from 'next/font/google'
import ContactFormPopup from './ContactFormPopup'
import React from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { useTranslations } from 'next-intl';

const inter = Inter({ subsets: ['greek', 'latin'] })

const fadeInUp: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 }
}

export default function Pricing() {
    const t = useTranslations('Pricing');
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
        let monthlyFee = 0
        if (population <= 2000) {
            monthlyFee = 0
        } else if (population <= 10000) {
            monthlyFee = 200
        } else if (population <= 30000) {
            monthlyFee = 400
        } else if (population <= 50000) {
            monthlyFee = 600
        } else if (population <= 100000) {
            monthlyFee = 1200
        } else {
            monthlyFee = 2000
        }

        const yearlyHostingFee = monthlyFee * 12
        const yearlySessionFee = councilCount * averageDuration * 9
        const yearlyAccuracyGuaranteeFee = needsAccuracyGuarantee ? councilCount * 80 : 0
        const totalYearlyPrice = yearlyHostingFee + yearlySessionFee + yearlyAccuracyGuaranteeFee

        setCalculatedPrice(totalYearlyPrice)
        setIsContactFormOpen(true)
    }

    return (
        <motion.div
            initial="initial"
            animate="animate"
            className={`container mx-auto px-4 py-16 ${inter.className}`}
        >
            <motion.h1 variants={fadeInUp} className="text-4xl font-bold text-center mb-4">{t('title')}</motion.h1>
            <motion.p variants={fadeInUp} className="text-xl text-center text-muted-foreground mb-12">{t('subtitle')}</motion.p>

            <PricingCards setIsDialogOpen={setIsDialogOpen} />



            <motion.div variants={fadeInUp} className="mt-12">
                <h2 className="text-2xl font-semibold mb-6 text-center">{t('additionalAdvantages.title')}</h2>
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <ul className="space-y-4">
                                <li className="flex items-start">
                                    <ClockIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.freeTrial')}</span>
                                </li>
                                <li className="flex items-start">
                                    <RocketIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.allFeatures')}</span>
                                </li>
                                <li className="flex items-start">
                                    <PhoneIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.phoneSupport')}</span>
                                </li>
                                <li className="flex items-start">
                                    <RotateCcw className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.pastMeetings')}</span>
                                </li>
                            </ul>
                            <ul className="space-y-4 flex flex-col justify-between h-full">
                                <li className="flex items-start">
                                    <PrinterIcon className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.printOrCd')}</span>
                                </li>
                                <li className="flex items-start">
                                    <FileBadge2 className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.accuracyGuarantee')}</span>
                                </li>
                                <li className="flex items-start">
                                    <Cuboid className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.suggestFeatures')}</span>
                                </li>
                                <li className="flex items-start">
                                    <Gem className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span>{t('additionalAdvantages.pilotPrice')}</span>
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
                                    <DialogTitle>{t('calculator.title')}</DialogTitle>
                                    <DialogDescription>
                                        {t('calculator.description')}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-6 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="councilCount">
                                            {t('calculator.councilCountLabel')}
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
                                            {t('calculator.averageDurationLabel')}
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
                                            {t('calculator.populationLabel')}
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
                                            {population <= 2000 ? t('calculator.populationUpTo2000') : population >= 200000 ? t('calculator.population200000AndUp') : population}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="accuracy-guarantee"
                                            checked={needsAccuracyGuarantee}
                                            onCheckedChange={setNeedsAccuracyGuarantee}
                                        />
                                        <Label htmlFor="accuracy-guarantee">
                                            {t('calculator.accuracyGuaranteeLabel')}
                                        </Label>
                                    </div>
                                </div>
                                <DialogFooter className="sm:justify-center">
                                    <Button onClick={calculatePrice}>{t('calculator.calculateButton')}</Button>
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
    const t = useTranslations('Pricing.cards');
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
                        title={t('digitization.title')}
                        description={t('digitization.description')}
                        price={t('digitization.price')}
                        subtext={t('digitization.subtext')}
                        includedItems={[
                            t('digitization.item1'),
                            t('digitization.item2'),
                            t('digitization.item3'),
                            t('digitization.item4'),
                        ]}
                        isOpen={isOpen}
                        toggleOpen={toggleOpen}
                        content={null}
                    />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 py-1 text-sm font-semibold rounded-full shadow-md z-10 hidden lg:block">
                    {t('or')}
                </div>
                <div className="flex-1">
                    <PricingCard
                        icon={<LayoutTemplateIcon className="h-10 w-10 text-primary stroke-[1.5]" />}
                        title={t('hosting.title')}
                        description={t('hosting.description')}
                        price={t('hosting.price')}
                        subtext={t('hosting.subtext')}
                        includedItems={[
                            t('hosting.item1'),
                            t('hosting.item2'),
                            t('hosting.item3'),
                            t('hosting.item4'),
                        ]}
                        isOpen={isOpen}
                        toggleOpen={toggleOpen}
                    >
                        <div className="space-y-4">
                            <PricingTier
                                icon={<Users2Icon className="h-6 w-6 text-primary" />}
                                population={t('hosting.tier1.population')}
                                price={t('hosting.tier1.price')}
                            />
                            <PricingTier
                                icon={<UsersIcon className="h-6 w-6 text-primary" />}
                                population={t('hosting.tier2.population')}
                                price={t('hosting.tier2.price')}
                            />
                            <PricingTier
                                icon={<UsersIcon className="h-6 w-6 text-primary" />}
                                population={t('hosting.tier3.population')}
                                price={t('hosting.tier3.price')}
                            />
                            <PricingTier
                                icon={<UsersIcon className="h-6 w-6 text-primary" />}
                                population={t('hosting.tier4.population')}
                                price={t('hosting.tier4.price')}
                            />
                            <PricingTier
                                icon={<UsersIcon className="h-6 w-6 text-primary" />}
                                population={t('hosting.tier5.population')}
                                price={t('hosting.tier5.price')}
                            />
                        </div>
                    </PricingCard>
                </div>
            </motion.div>
            <motion.div variants={fadeInUp} className="text-center mt-8">
                <Button onClick={() => setIsDialogOpen(true)}>{t('calculateCostButton')}</Button>
            </motion.div>
        </motion.div>
    )
}

function PricingCard(
    { icon, title, description, price, subtext, content, children, includedItems, isOpen, toggleOpen }
        : { icon: React.ReactElement, title: string, description: string, price: string, subtext: string, content?: React.ReactNode, children?: React.ReactNode, includedItems: string[], isOpen: boolean, toggleOpen: () => void }
) {
    const t = useTranslations('Pricing.cards.card');
    return (
        <Card className={`flex flex-col h-full transition-all duration-300 ${isOpen ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
                <div className="p-2 flex-shrink-0">
                    {icon}
                </div>
                <div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                <p className="text-3xl font-bold">{price}</p>
                <p className="text-sm text-muted-foreground mb-6">{subtext}</p>

                <Collapsible open={isOpen} onOpenChange={toggleOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                            {t('includedServices')}
                            <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        {content}
                        {children}
                        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                            {includedItems.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </CollapsibleContent>
                </Collapsible>
            </CardContent>
            <CardFooter>
                <Button className="w-full">{t('contactSales')}</Button>
            </CardFooter>
        </Card>
    )
}

function PricingTier({ icon, population, price }: { icon: React.ReactElement, population: string, price: string }) {
    const t = useTranslations('Pricing.cards.tier');
    return (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
                {icon}
                <div>
                    <p className="font-semibold">{t('population')}</p>
                    <p className="text-sm text-muted-foreground">{population}</p>
                </div>
            </div>
            <p className="font-semibold">{price}</p>
        </div>
    )
}