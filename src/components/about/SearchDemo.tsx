import { Search, MapPin, Clock, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import BrowserFrame from './BrowserFrame'

const RESULT_DATES = ['15/01/2026', '22/01/2026', '10/02/2026']

export default function SearchDemo() {
    const t = useTranslations('about.demos.search')

    return (
        <BrowserFrame url="opencouncil.gr/search" className="w-full">
            <div className="bg-white p-3 md:p-4">
                {/* Search bar */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-gray-50/80 px-3 py-2 mb-4">
                    <Search className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                    <span className="text-sm text-foreground">ESPA</span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground bg-white border border-border/60 rounded px-1.5 py-0.5">{t('allMunicipalities')}</span>
                    </div>
                </div>

                {/* Results count */}
                <p className="text-[11px] text-muted-foreground mb-3">
                    {t('resultsCount', { count: RESULT_DATES.length })}
                </p>

                {/* Result cards */}
                <div className="space-y-3">
                    {RESULT_DATES.map((date, i) => (
                        <div key={i} className="rounded-lg border border-border/50 p-3 hover:border-border transition-colors">
                            {/* Subject title */}
                            <p className="text-[13px] font-medium leading-snug">{t(`results.${i}.subject`)}</p>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
                                <span>{t(`results.${i}.city`)}</span>
                                <span className="flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {date}
                                </span>
                                <span className="flex items-center gap-0.5">
                                    <User className="h-2.5 w-2.5" />
                                    {t(`results.${i}.speaker`)}
                                </span>
                                <span className="flex items-center gap-0.5">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {t(`results.${i}.location`)}
                                </span>
                            </div>

                            {/* Highlighted transcript excerpt */}
                            <p
                                className="text-[12px] text-muted-foreground leading-relaxed mt-2 [&_mark]:bg-yellow-200/70 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                                dangerouslySetInnerHTML={{ __html: t.raw(`results.${i}.highlight`) as string }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </BrowserFrame>
    )
}
