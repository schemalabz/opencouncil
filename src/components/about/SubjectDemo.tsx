import { FileText, ScrollText, Landmark, Play, BookOpen, ArrowRight, Clock, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ColorPercentageRing } from '@/components/ui/color-percentage-ring'
import BrowserFrame from './BrowserFrame'
import { Link } from '@/i18n/routing'

// ─── Mock Data (non-translatable) ───────────────────────────────────────

const PARTY_COLORS = ['#2563eb', '#dc2626', '#6b7280']
const PARTY_PERCENTAGES = [45, 30, 25]
const PARTY_KEYS = ['dimotikiKinisi', 'laikiSyspirosi', 'anexartitoi'] as const
const TOTAL_MINUTES = 23
const SPEAKER_COUNT = 6
const INTRODUCER_COLOR = '#2563eb'
const CONTRIBUTION_COLORS = ['#2563eb', '#dc2626']
const CONTRIBUTION_TIMESTAMPS = ['1:23:45', '1:28:12']
const DECISION_ADA = '9ΚΛΜ46ΜΔΨΟ-ΞΑΒ'
const DECISION_PROTOCOL = '145/2026'

// ─── Subcomponents ──────────────────────────────────────────

function MockPersonBadge({ name, initials, color, role }: {
    name: string; initials: string; color: string; role?: string
}) {
    return (
        <div className="flex items-center gap-2.5">
            <div
                className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ backgroundColor: color }}
            >
                {initials}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium leading-tight truncate">{name}</p>
                {role && <p className="text-[11px] text-muted-foreground leading-tight truncate">{role}</p>}
            </div>
        </div>
    )
}

function AnnotationBox({ label, labelRight, children }: {
    label: string
    labelRight?: boolean
    children: React.ReactNode
}) {
    return (
        <div className="group/anno relative rounded-lg border-2 border-dashed border-gray-300 hover:border-orange pt-5 p-3 md:pt-6 md:p-4 transition-colors">
            <span
                className={`absolute top-[-1px] -translate-y-1/2 z-10 text-[10px] md:text-[11px] font-medium leading-none bg-white px-1.5 text-gray-400 group-hover/anno:text-orange transition-colors ${labelRight ? 'right-3' : 'left-3'}`}
            >
                {label}
            </span>
            {children}
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────

export default function SubjectDemo() {
    const t = useTranslations('about.demos.subject')

    const parties = PARTY_KEYS.map((key, i) => ({
        name: t(`parties.${key}`),
        color: PARTY_COLORS[i],
        percentage: PARTY_PERCENTAGES[i],
    }))

    return (
        <BrowserFrame url="opencouncil.gr/chania/mar26_2026/subjects/..." className="w-full">
            <div className="p-4 md:p-6 space-y-5 bg-white">
                {/* Section 1: Header */}
                <AnnotationBox label={t('callouts.header')}>
                    <p className="text-[11px] text-muted-foreground mb-1">
                        {t('meetingLabel')} · {t('subjectLabel')} #3
                    </p>
                    <h3 className="text-base md:text-lg font-semibold leading-snug">
                        {t('subjectName')}
                    </h3>
                </AnnotationBox>

                {/* Section 2: Stats */}
                <AnnotationBox label={t('callouts.stats')} labelRight>
                    <div className="flex flex-wrap gap-4 items-start">
                        <div className="flex items-center gap-3">
                            <ColorPercentageRing
                                data={parties.map(p => ({ color: p.color, percentage: p.percentage }))}
                                size={56}
                                thickness={7}
                            >
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                    {TOTAL_MINUTES}΄
                                </span>
                            </ColorPercentageRing>
                            <div className="space-y-0.5">
                                {parties.map(p => (
                                    <div key={p.name} className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                                        <span className="text-[11px] text-muted-foreground">{p.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Users className="h-3.5 w-3.5" />
                                <span>{t('speakers', { count: SPEAKER_COUNT })}</span>
                                <span className="text-border">·</span>
                                <Clock className="h-3.5 w-3.5" />
                                <span>{t('minutes', { count: TOTAL_MINUTES })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{t('introducer')}</span>
                                <MockPersonBadge
                                    name={t('people.georgiou.name')}
                                    initials={t('people.georgiou.initials')}
                                    color={INTRODUCER_COLOR}
                                />
                            </div>
                        </div>
                    </div>
                </AnnotationBox>

                {/* Section 3: Summary */}
                <AnnotationBox label={t('callouts.summary')}>
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">{t('summary')}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t('summaryText').split('. ').map((sentence, i, arr) => (
                            <span key={i}>
                                {sentence}{i < arr.length - 1 ? '. ' : ''}
                                {i < arr.length - 1 && (
                                    <sup className="text-[9px] text-blue-600 font-semibold ml-0.5">
                                        [{i + 1}]
                                    </sup>
                                )}
                            </span>
                        ))}
                    </p>
                    <div className="mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">
                            AI
                        </span>
                    </div>
                </AnnotationBox>

                {/* Section 4: Contributions */}
                <AnnotationBox label={t('callouts.contributions')} labelRight>
                    <div className="flex items-center gap-2 mb-3">
                        <ScrollText className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">{t('contributions')}</h4>
                        <span className="text-[11px] text-muted-foreground">(2)</span>
                    </div>
                    <div className="space-y-3">
                        {(['georgiou', 'papadakis'] as const).map((key, i) => (
                            <div key={key} className="rounded-lg border border-border/50 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <MockPersonBadge
                                        name={t(`people.${key}.name`)}
                                        initials={t(`people.${key}.initials`)}
                                        color={CONTRIBUTION_COLORS[i]}
                                        role={t.has(`people.${key}.roleShort`) ? t(`people.${key}.roleShort`) : t(`people.${key}.role`)}
                                    />
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-gray-50">
                                            <Play className="h-2.5 w-2.5" />
                                            {CONTRIBUTION_TIMESTAMPS[i]}
                                        </span>
                                        <span className="flex items-center text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-gray-50">
                                            <BookOpen className="h-2.5 w-2.5" />
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[13px] text-muted-foreground leading-relaxed pl-[42px]">
                                    {t(`contributionTexts.${key}`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </AnnotationBox>

                {/* Section 5: Decision */}
                <AnnotationBox label={t('callouts.decision')}>
                    <div className="flex items-center gap-2 mb-2">
                        <Landmark className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">{t('decision')}</h4>
                    </div>
                    <div className="rounded-lg border border-border/50 p-3 text-[12px] space-y-1.5">
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">{t('decisionTitle')}</span>
                            <span className="font-medium">{t('decisionTitleText')}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">{t('decisionAda')}</span>
                            <span className="font-mono text-blue-600">{DECISION_ADA}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">{t('decisionProtocol')}</span>
                            <span>{DECISION_PROTOCOL}</span>
                        </div>
                    </div>
                </AnnotationBox>

                {/* CTA */}
                <div className="pt-2">
                    <Link
                        href="/chania/mar26_2026/subjects/cmmywhibg07ud139hav10soag"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-orange hover:text-orange/80 transition-colors group"
                    >
                        {t('viewRealSubject')}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </BrowserFrame>
    )
}
