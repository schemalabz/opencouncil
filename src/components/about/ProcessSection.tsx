'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { PROCESS_STEPS } from './config'
import { Container, SectionHeading, recordFont, revealDelayed } from './primitives'

/** From the session to the resident in three beats. */
export default function ProcessSection() {
    const t = useTranslations('about.process')

    return (
        <section id="process" className="scroll-mt-20 md:scroll-mt-36 border-t border-border py-14 md:py-[88px]">
            <Container>
                <SectionHeading kicker={t('kicker')} title={t('title')} />

                <div className="mt-7 grid grid-cols-1 gap-6 md:mt-11 md:grid-cols-3 md:gap-10">
                    {PROCESS_STEPS.map((step, index) => {
                        const Icon = step.icon
                        return (
                            <motion.div key={step.id} {...revealDelayed(index * 0.12)} className="flex flex-col gap-3 border-t border-border pt-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-semibold tracking-[0.08em] text-[hsl(var(--orange-deep))]" style={recordFont}>
                                        0{index + 1}
                                    </span>
                                    <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} aria-hidden />
                                </div>
                                <h3 className="text-[19px] font-normal leading-tight tracking-[-0.01em] text-foreground md:text-[22px]">
                                    {t(`steps.${step.id}.title`)}
                                </h3>
                                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{t(`steps.${step.id}.description`)}</p>
                            </motion.div>
                        )
                    })}
                </div>
            </Container>
        </section>
    )
}
