'use client'

import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

const bubble = (delay: number) => ({
    initial: { opacity: 0, y: 10, scale: 0.98 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: true, margin: '-40px 0px' },
    transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
})

/**
 * The notification a resident gets on WhatsApp, drawn rather than captured:
 * the one visual on the page that is not a screenshot, because a chat with a
 * real resident is not ours to screenshot. Copy comes from the demo strings the
 * /explain mockup also uses.
 */
export default function WhatsAppMessage() {
    const t = useTranslations('about.demos.notification')
    const items = [
        { title: t('item1Title'), location: t('item1Location') },
        { title: t('item2Title'), location: t('item2Location') },
    ]

    return (
        <div className="flex h-full flex-col bg-[#efeae2] text-[#111b21]">
            <div className="flex items-center gap-2.5 bg-[#008069] px-3 py-2.5 text-white">
                <Image src="/white-logo.png" alt="" width={26} height={22} className="h-[22px] w-auto" />
                <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[13px] font-semibold">{t('senderName')}</span>
                    <span className="text-[10.5px] opacity-80">WhatsApp Business</span>
                </div>
            </div>
            <div className="flex flex-col gap-2 px-2.5 py-3">
                <motion.div
                    {...bubble(0.1)}
                    className="max-w-[88%] self-start rounded-[2px_12px_12px_12px] bg-white px-2.5 pb-1.5 pt-2 text-[12.5px] leading-[1.4] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
                >
                    <p>{t('messageBody')}</p>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                        {items.map((item) => (
                            <div key={item.title} className="flex items-start gap-1.5">
                                <MapPin className="mt-[3px] h-3 w-3 shrink-0 text-[hsl(var(--orange-deep))]" strokeWidth={2} aria-hidden />
                                <p>
                                    <span className="font-semibold">{item.title}</span>
                                    <br />
                                    <span className="text-[11.5px] text-[#667781]">{item.location}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 font-semibold text-[#027eb5]">{t('viewSummaries')}</p>
                    <p className="mt-0.5 text-right text-[10px] text-[#667781]">09:41</p>
                </motion.div>
                <motion.div
                    {...bubble(0.5)}
                    className="max-w-[70%] self-end rounded-[12px_2px_12px_12px] bg-[#d9fdd3] px-2.5 pb-1.5 pt-2 text-[12.5px] leading-[1.4] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
                >
                    <p>{t('reply')}</p>
                    <p className="mt-0.5 text-right text-[10px] text-[#667781]">09:41</p>
                </motion.div>
            </div>
        </div>
    )
}
