import { motion } from 'framer-motion'
import { Github, Linkedin, Twitter, Mail, ArrowRight, MapPin, Rocket } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { TEAM_MEMBERS, ROADMAP_ITEM_IDS, ROADMAP_TIMEFRAMES } from './config'
import type { GitHubStats } from '@/lib/github'

// Deterministic fallback for daily commits (84 days = 12 weeks × 7 days)
const FALLBACK_DAILY_COMMITS = [
    0, 2, 0, 0, 3, 1, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 3, 0, 2, 1, 0,
    0, 0, 1, 2, 0, 1, 0, 0, 4, 0, 1, 0, 0, 2, 0, 0, 1, 0, 3, 2, 0,
    1, 0, 0, 0, 2, 0, 0, 1, 3, 0, 0, 2, 0, 1, 0, 0, 4, 1, 0, 0, 2,
    0, 1, 0, 3, 0, 0, 2, 0, 1, 3, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 2,
]

interface TeamProps {
    githubStats?: GitHubStats | null
}

export default function Team({ githubStats }: TeamProps) {
    const t = useTranslations('about.team')
    const dailyCommits = githubStats?.dailyCommits?.length ? githubStats.dailyCommits : FALLBACK_DAILY_COMMITS
    const maxDaily = Math.max(...dailyCommits, 1)
    const contributorCount = githubStats?.contributorCount ?? 6
    return (
        <div className="bg-gray-50/80">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                {/* Team header */}
                <motion.div
                    className="text-center mb-10 md:mb-14"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                        {t('title')}
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        {t.rich('subtitle', {
                            link: (chunks) => (
                                <a href="https://schemalabs.gr" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                                    {chunks}
                                </a>
                            ),
                        })}
                    </p>
                </motion.div>

                {/* Team grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 md:gap-8 mb-16">
                    {TEAM_MEMBERS.map((person, index) => (
                        <motion.div
                            key={person.id}
                            className="flex flex-col items-center text-center"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: index * 0.06 }}
                            viewport={{ once: true }}
                        >
                            <div className="w-20 h-20 sm:w-24 sm:h-24 mb-3 overflow-hidden rounded-full bg-gray-200">
                                {person.image && !person.image.includes('placeholder') ? (
                                    <Image
                                        src={person.image}
                                        alt={t(`members.${person.id}`)}
                                        width={96}
                                        height={96}
                                        className="w-full h-full object-cover filter grayscale hover:grayscale-0 transition-all duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300" />
                                )}
                            </div>
                            <h3 className="text-sm sm:text-base font-medium h-10 flex items-center justify-center text-center leading-tight">{t(`members.${person.id}`)}</h3>
                            <div className="flex gap-2.5 mt-2">
                                {person.socials.twitter && (
                                    <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" className="no-underline text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Twitter className="w-3.5 h-3.5" />
                                    </a>
                                )}
                                {person.socials.linkedin && (
                                    <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" className="no-underline text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Linkedin className="w-3.5 h-3.5" />
                                    </a>
                                )}
                                {person.socials.email && (
                                    <a href={person.socials.email} className="no-underline text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Mail className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Office + Roadmap + Open Source — 3-column grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {/* Office */}
                    <motion.div
                        className="rounded-xl border border-border/40 bg-white/60 overflow-hidden flex flex-col"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        viewport={{ once: true }}
                    >
                        <div className="p-6 pb-4">
                            <div className="flex items-center gap-3 mb-4">
                                <MapPin className="h-5 w-5 text-foreground/80" />
                                <h3 className="text-base font-medium">{t('office.title')}</h3>
                            </div>
                        </div>
                        <a href="https://maps.app.goo.gl/o1k1gqz9uiqw9FmW9" target="_blank" rel="noopener noreferrer">
                            <div className="aspect-[16/9] relative overflow-hidden mx-4 rounded-lg">
                                <Image
                                    src="/about/office.jpg"
                                    alt={t('office.imageAlt')}
                                    fill
                                    className="object-cover hover:scale-105 transition-transform duration-500"
                                />
                            </div>
                        </a>
                        <div className="p-6 pt-4 flex flex-col flex-1">
                            <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                                {t.rich('office.description', {
                                    email: (chunks) => (
                                        <a href="mailto:space@opencouncil.gr" className="text-primary hover:underline">{chunks}</a>
                                    ),
                                })}
                            </p>
                            <a
                                href="https://maps.app.goo.gl/o1k1gqz9uiqw9FmW9"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                            >
                                {t('office.address')}
                                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                            </a>
                        </div>
                    </motion.div>

                    {/* Roadmap teaser */}
                    <motion.div
                        className="rounded-xl border border-border/40 bg-white/60 p-6 flex flex-col"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <Rocket className="h-5 w-5 text-foreground/80" />
                            <h3 className="text-base font-medium">{t('roadmap.title')}</h3>
                        </div>
                        <div className="relative pl-6 flex-1">
                            {/* Continuous vertical line */}
                            <div className="absolute left-[4px] top-1 bottom-1 w-px bg-border" />

                            <div className="space-y-4">
                                {ROADMAP_ITEM_IDS.map((id) => (
                                    <div key={id} className="relative">
                                        {/* Dot on the line */}
                                        <div className="absolute -left-6 top-1 h-[9px] w-[9px] rounded-full border-2 border-primary bg-white" />
                                        <p className="text-sm font-medium">{t(`roadmap.items.${id}.title`)}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{ROADMAP_TIMEFRAMES[id]}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <a
                            href="https://github.com/orgs/schemalabz/projects/1"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-5 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                        >
                            {t('roadmap.viewRoadmap')}
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </motion.div>

                    {/* Open source */}
                    <motion.div
                        className="rounded-xl border border-border/40 bg-white/60 p-6 flex flex-col"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        viewport={{ once: true }}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <Github className="h-5 w-5 text-foreground/80" />
                            <h3 className="text-base font-medium">{t('openSource.title')}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                            {t('openSource.description')}
                        </p>
                        {/* GitHub commit activity grid — last 12 weeks */}
                        <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-border/30">
                            <div className="grid grid-rows-7 grid-flow-col gap-0.5">
                                {dailyCommits.map((commits, i) => {
                                    const intensity = commits > 0 ? Math.min(commits / maxDaily, 1) : 0
                                    return (
                                        <div
                                            key={i}
                                            className="aspect-square rounded-[2px]"
                                            style={{
                                                backgroundColor: commits > 0
                                                    ? `hsl(24, 100%, ${75 - intensity * 30}%)`
                                                    : 'hsl(24, 0%, 92%)',
                                            }}
                                            title={`${commits} commits`}
                                        />
                                    )
                                })}
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 mt-2">
                                {t('openSource.contributorsLastWeeks', { count: contributorCount })}
                            </p>
                        </div>
                        <a
                            href="https://github.com/schemalabz/opencouncil"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                        >
                            {t('openSource.viewOnGithub')}
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
