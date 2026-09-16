'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { estimateYearlyPricing } from '@/lib/pricing'
import { PillButton } from './primitives'

interface PricingCalculatorDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The yearly estimate the visitor asked for; the page carries it into the contact form. */
    onEstimate: (yearlyCost: number) => void
}

/** Three sliders and an estimate: how much a year of OpenCouncil costs a municipality of this size. */
export default function PricingCalculatorDialog({ open, onOpenChange, onEstimate }: PricingCalculatorDialogProps) {
    const t = useTranslations('about.pricing.calculator')
    const [councilCount, setCouncilCount] = useState(20)
    const [averageDuration, setAverageDuration] = useState(3)
    const [population, setPopulation] = useState(50000)

    const populationLabel =
        population <= 2000 ? t('populationUpTo') : population >= 200000 ? t('populationOver') : population.toLocaleString('el-GR')

    const calculate = () => {
        const estimate = estimateYearlyPricing(population, councilCount, averageDuration, true)
        onEstimate(estimate.totalYearlyCost)
    }

    const slider = (id: string, label: string, value: number, display: string, min: number, max: number, step: number, onChange: (v: number) => void) => (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between">
                <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
                <span className="text-sm font-semibold tabular-nums text-foreground">{display}</span>
            </div>
            <Slider id={id} min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
        </div>
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="overflow-hidden p-0 sm:max-w-[460px]">
                <div className="p-6 sm:p-8">
                    <DialogHeader className="space-y-2 pb-4 text-center">
                        <DialogTitle className="text-xl font-semibold">{t('title')}</DialogTitle>
                        <DialogDescription className="text-sm">{t('subtitle')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        {slider('councilCount', t('councilsPerYear'), councilCount, String(councilCount), 10, 50, 1, setCouncilCount)}
                        {slider('averageDuration', t('averageDuration'), averageDuration, String(averageDuration), 1, 8, 1, setAverageDuration)}
                        {slider('population', t('population'), population, populationLabel, 2000, 200000, 1000, setPopulation)}
                    </div>
                    <div className="pt-4">
                        <PillButton onClick={calculate} className="w-full">{t('calculate')}</PillButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
