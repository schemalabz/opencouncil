'use client'

import { useState, FormEvent, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { FileInput, LayoutTemplate, UsersIcon, PhoneIcon, PrinterIcon, ShieldCheckIcon, Users2Icon, ClockIcon, RocketIcon, CheckCircle2Icon, Cuboid, ChevronDownIcon, LayoutTemplateIcon, RotateCcw, Gem, FileBadge2, Megaphone, DollarSignIcon, BadgeEuro } from "lucide-react"
import { inter } from '@/lib/fonts'
import ContactFormPopup from './ContactFormPopup'
import React from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { formatCurrency } from '@/lib/utils'
import {
    estimateYearlyPricing,
    PLATFORM_PRICING_TIERS,
    SESSION_PROCESSING,
    getCurrentCorrectnessGuaranteePrice,
    getCombinedProcessingPrice
} from '@/lib/pricing'

const EXTRAS_ICONS = [ClockIcon, RocketIcon, PhoneIcon, RotateCcw, PrinterIcon, Cuboid, BadgeEuro, Megaphone]

const fadeInUp: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 }
}

export default function Pricing() {
    const t = useTranslations('about.pricing')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [councilCount, setCouncilCount] = useState(20)
    const [averageDuration, setAverageDuration] = useState(3)
    const [population, setPopulation] = useState(50000)
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
            true
        )

        setCalculatedPrice(estimate.totalYearlyCost)
        setIsContactFormOpen(true)
    }

    const extrasItems = useMemo(() => t.raw('extras.items') as string[], [t])
    const additionalItems = useMemo(() => t.raw('extras.additionalItems') as string[], [t])

    return (
        <div className={`py-16 ${inter.className}`}>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">{t('title')}</h2>
            <p className="text-base md:text-lg text-center text-muted-foreground mb-2 max-w-xl mx-auto">
                {t('subtitle')}
            </p>

            <PricingCards setIsDialogOpen={setIsDialogOpen} t={t} />

            <div className="mt-16">
                <h2 className="text-2xl font-semibold mb-2 text-center">{t('extras.title')}</h2>
                <p className="text-center text-muted-foreground mb-8">{t('extras.subtitle')}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {extrasItems.map((text, i) => {
                        const Icon = EXTRAS_ICONS[i]
                        return (
                            <div key={i} className="flex items-start gap-3 rounded-xl border border-border/50 bg-card p-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                    <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <span className="text-sm leading-snug text-muted-foreground">{text}</span>
                            </div>
                        )
                    })}
                </div>

                <div className="mt-6 rounded-xl border border-dashed border-border/60 bg-muted/30 p-5">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('extras.additionalCharges')}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {additionalItems.map((text, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 mt-0.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                </div>
                                <span className="text-sm text-muted-foreground">{text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden">
                    <div className="p-6 sm:p-8">
                        <DialogHeader className="text-center space-y-2 pb-4">
                            <DialogTitle className="text-xl font-semibold">{t('calculator.title')}</DialogTitle>
                            <DialogDescription className="text-sm">
                                {t('calculator.subtitle')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                            <div className="space-y-3">
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="councilCount" className="text-sm font-medium">{t('calculator.councilsPerYear')}</Label>
                                    <span className="text-sm font-semibold text-primary tabular-nums">{councilCount}</span>
                                </div>
                                <Slider
                                    id="councilCount"
                                    min={10}
                                    max={50}
                                    step={1}
                                    value={[councilCount]}
                                    onValueChange={(value) => setCouncilCount(value[0])}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="averageDuration" className="text-sm font-medium">{t('calculator.averageDuration')}</Label>
                                    <span className="text-sm font-semibold text-primary tabular-nums">{averageDuration}</span>
                                </div>
                                <Slider
                                    id="averageDuration"
                                    min={1}
                                    max={8}
                                    step={1}
                                    value={[averageDuration]}
                                    onValueChange={(value) => setAverageDuration(value[0])}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="population" className="text-sm font-medium">{t('calculator.population')}</Label>
                                    <span className="text-sm font-semibold text-primary tabular-nums">
                                        {population <= 2000 ? t('calculator.populationUpTo') : population >= 200000 ? t('calculator.populationOver') : population.toLocaleString('el-GR')}
                                    </span>
                                </div>
                                <Slider
                                    id="population"
                                    min={2000}
                                    max={200000}
                                    step={1000}
                                    value={[population]}
                                    onValueChange={(value) => setPopulation(value[0])}
                                />
                            </div>
                        </div>
                        <div className="pt-4">
                            <Button
                                onClick={calculatePrice}
                                className="w-full h-11 rounded-xl text-base font-medium shadow-md hover:shadow-lg transition-all duration-200"
                            >
                                {t('calculator.calculate')}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ContactFormPopup
                isOpen={isContactFormOpen}
                onClose={() => setIsContactFormOpen(false)}
                calculatedPrice={calculatedPrice}
            />
        </div>
    )
}
export function PricingCards({ setIsDialogOpen, t }: { setIsDialogOpen: (open: boolean) => void; t: ReturnType<typeof useTranslations> }) {
    const [card1Open, setCard1Open] = React.useState(false)
    const [card2Open, setCard2Open] = React.useState(true)

    const processingPrice = getCombinedProcessingPrice()
    const tierLabels = useMemo(() => t.raw('tiers') as string[], [t])
    const sessionChecklist = useMemo(() => t.raw('sessionChecklist') as string[], [t])
    const sessionChecklistExtra = useMemo(() => t.raw('sessionChecklistExtra') as string[], [t])
    const platformChecklist = useMemo(() => t.raw('platformChecklist') as string[], [t])

    return (
        <div className="mt-10">
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Card 1: Session Processing */}
                <div className="relative rounded-2xl border border-border/60 bg-card p-6 sm:p-8 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <FileInput className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">{t('sessionProcessing')}</h3>
                            <p className="text-sm text-muted-foreground">{t('sessionProcessingDesc')}</p>
                        </div>
                    </div>

                    <div className="mb-5">
                        <span className="text-4xl font-bold tracking-tight">{formatCurrency(processingPrice.pricePerHour)}</span>
                        <span className="text-muted-foreground ml-1">{t('perHour')}</span>
                    </div>

                    <Collapsible open={card1Open}>
                        <CheckList items={sessionChecklist} />
                        <CollapsibleContent>
                            <CheckList items={sessionChecklistExtra} className="mt-2.5" />
                        </CollapsibleContent>
                        <CollapsibleTrigger asChild>
                            <button
                                onClick={() => setCard1Open(prev => !prev)}
                                className="mt-3 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                            >
                                {card1Open ? t('showLess') : t('showMore')}
                                <ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${card1Open ? 'rotate-180' : ''}`} />
                            </button>
                        </CollapsibleTrigger>
                    </Collapsible>

                    <div className="mt-5 pt-4 border-t border-border/40">
                        <p className="text-xs text-muted-foreground">
                            {t('archiveNote', { price: formatCurrency(SESSION_PROCESSING.pricePerHour) })}
                        </p>
                    </div>
                </div>

                {/* Card 2: Platform Usage */}
                <div className="relative rounded-2xl border border-border/60 bg-card p-6 sm:p-8 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <LayoutTemplateIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">{t('platformUsage')}</h3>
                            <p className="text-sm text-muted-foreground">{t('platformUsageDesc')}</p>
                        </div>
                    </div>

                    <div className="space-y-2 mb-5 flex-grow">
                        {PLATFORM_PRICING_TIERS.map((tier, index) => (
                            <div key={index} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Users2Icon className="h-3.5 w-3.5 text-primary/60" />
                                    {tierLabels[index] ?? tier.label}
                                </span>
                                <span className="text-sm font-semibold">
                                    {tier.monthlyPrice === 0 ? t('free') : `${formatCurrency(tier.monthlyPrice)} ${t('perMonth')}`}
                                </span>
                            </div>
                        ))}
                    </div>

                    <Collapsible open={card2Open}>
                        <CollapsibleContent>
                            <CheckList items={platformChecklist} className="mb-3" />
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
                {t('vatNote')}
            </p>

            <div className="mt-8 text-center">
                <Button
                    size="lg"
                    className="rounded-xl px-8 py-6 text-base shadow-md hover:shadow-lg transition-all duration-300"
                    onClick={() => setIsDialogOpen(true)}
                >
                    {t('calculateContract')}
                </Button>
            </div>
        </div>
    )
}

function CheckList({ items, className }: { items: string[]; className?: string }) {
    return (
        <ul className={`space-y-2.5 text-sm text-muted-foreground ${className ?? ''}`}>
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                    <CheckCircle2Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    )
}
