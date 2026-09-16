'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { Github, Linkedin, Mail, MapPin, Rocket, Twitter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import type { GitHubStats } from '@/lib/github'
import { GITHUB_REPO_URL, OFFICE, ROADMAP_ITEM_IDS, ROADMAP_ITEM_REALMS, ROADMAP_URL, TEAM_MEMBERS } from './config'
import { ArrowLink, Container, SectionHeading, revealDelayed } from './primitives'

// Deterministic fallback for daily commits (84 days = 12 weeks × 7 days)
const FALLBACK_DAILY_COMMITS = [
    0, 2, 0, 0, 3, 1, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 3, 0, 2, 1, 0,
    0, 0, 1, 2, 0, 1, 0, 0, 4, 0, 1, 0, 0, 2, 0, 0, 1, 0, 3, 2, 0,
    1, 0, 0, 0, 2, 0, 0, 1, 3, 0, 0, 2, 0, 1, 0, 0, 4, 1, 0, 0, 2,
    0, 1, 0, 3, 0, 0, 2, 0, 1, 3, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 2,
]

interface TeamSectionProps {
    githubStats?: GitHubStats | null
    realm: Realm
}

const card = 'flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card'
const cardTitle = 'flex items-center gap-2 text-base font-semibold leading-tight text-foreground'
const cardIcon = 'h-[18px] w-[18px] shrink-0 text-[hsl(var(--orange-deep))]'

/** Who is behind it, who owns it, and where to find us: what a public buyer asks before signing. */
export default function TeamSection({ githubStats, realm }: TeamSectionProps) {
    const t = useTranslations('about.team')
    const dailyCommits = githubStats?.dailyCommits?.length ? githubStats.dailyCommits : FALLBACK_DAILY_COMMITS
    const maxDaily = Math.max(...dailyCommits, 1)
    const contributorCount = githubStats?.contributorCount ?? 6
    const roadmap = ROADMAP_ITEM_IDS.filter((id) => !ROADMAP_ITEM_REALMS[id] || ROADMAP_ITEM_REALMS[id]?.includes(realm))

    return (
        <section id="team" className="scroll-mt-20 md:scroll-mt-36 border-t border-border bg-[#fafaf9] py-14 md:py-[88px]">
            <Container>
                <SectionHeading
                    kicker={t('kicker')}
                    title={t('title')}
                    align="center"
                    className="max-w-[680px]"
                    subtitle={t.rich('subtitle', {
                        link: (chunks) => (
                            <a href="https://schemalabs.gr" target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
                                {chunks}
                            </a>
                        ),
                    })}
                />

                <ul className="mt-8 flex justify-between gap-1 md:mt-11 md:flex-wrap md:justify-center md:gap-6">
                    {TEAM_MEMBERS.map((person, index) => (
                        <motion.li key={person.id} {...revealDelayed(index * 0.06)} className="flex w-[64px] flex-col items-center gap-2 text-center md:w-[176px] md:gap-3">
                            <Image
                                src={person.image}
                                alt={t(`members.${person.id}`)}
                                width={96}
                                height={96}
                                className="h-14 w-14 rounded-full object-cover grayscale transition-[filter] duration-500 hover:grayscale-0 md:h-24 md:w-24"
                            />
                            <span className="text-[11px] leading-tight text-foreground md:text-[15px]">{t(`members.${person.id}`)}</span>
                            <span className="hidden gap-2.5 md:flex">
                                {person.socials.twitter && (
                                    <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" aria-label="X" className="text-muted-foreground/50 transition-colors hover:text-foreground">
                                        <Twitter className="h-3.5 w-3.5" />
                                    </a>
                                )}
                                {person.socials.linkedin && (
                                    <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-muted-foreground/50 transition-colors hover:text-foreground">
                                        <Linkedin className="h-3.5 w-3.5" />
                                    </a>
                                )}
                                {person.socials.email && (
                                    <a href={person.socials.email} aria-label="Email" className="text-muted-foreground/50 transition-colors hover:text-foreground">
                                        <Mail className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </span>
                        </motion.li>
                    ))}
                </ul>

                <div className="mt-9 grid grid-cols-1 gap-4 md:mt-14 md:grid-cols-3 md:gap-5">
                    <motion.div {...revealDelayed(0)} className={card}>
                        <div className="flex flex-1 flex-col gap-2 p-[22px]">
                            <h3 className={cardTitle}>
                                <Github className={cardIcon} strokeWidth={1.9} aria-hidden />
                                {t('openSource.title')}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">{t('openSource.description')}</p>
                            {/* Commits per day over the last twelve weeks, straight from GitHub. */}
                            <div className="mt-2 rounded-xl border border-border bg-muted/60 p-3">
                                <div className="grid grid-flow-col grid-rows-7 gap-0.5">
                                    {dailyCommits.map((commits, i) => {
                                        const intensity = commits > 0 ? Math.min(commits / maxDaily, 1) : 0
                                        return (
                                            <div
                                                key={i}
                                                className="aspect-square rounded-[2px]"
                                                style={{ backgroundColor: commits > 0 ? `hsl(24, 100%, ${75 - intensity * 30}%)` : 'hsl(24, 6%, 90%)' }}
                                                title={`${commits} commits`}
                                            />
                                        )
                                    })}
                                </div>
                                <p className="mt-2 text-[10.5px] text-muted-foreground">{t('openSource.contributorsLastWeeks', { count: contributorCount })}</p>
                            </div>
                            <ArrowLink href={GITHUB_REPO_URL} external className="mt-auto pt-2">{t('openSource.viewOnGithub')}</ArrowLink>
                        </div>
                    </motion.div>

                    <motion.div {...revealDelayed(0.08)} className={card}>
                        <div className="flex flex-1 flex-col gap-2 p-[22px]">
                            <h3 className={cardTitle}>
                                <Rocket className={cardIcon} strokeWidth={1.9} aria-hidden />
                                {t('roadmap.title')}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">{t('roadmap.description')}</p>
                            <ul className="relative mt-2 flex flex-col gap-3 pl-5">
                                <span aria-hidden className="absolute bottom-1.5 left-[3px] top-1.5 w-px bg-border" />
                                {roadmap.map((id) => (
                                    <li key={id} className="relative text-sm text-foreground">
                                        <span aria-hidden className="absolute -left-5 top-[5px] h-[9px] w-[9px] rounded-full border-2 border-[hsl(var(--orange))] bg-card" />
                                        {t(`roadmap.items.${id}.title`)}
                                    </li>
                                ))}
                            </ul>
                            <ArrowLink href={ROADMAP_URL} external className="mt-auto pt-2">{t('roadmap.viewRoadmap')}</ArrowLink>
                        </div>
                    </motion.div>

                    <motion.div {...revealDelayed(0.16)} className={card}>
                        <a href={OFFICE.mapsUrl} target="_blank" rel="noopener noreferrer" className="relative block h-[140px] overflow-hidden md:h-[150px]">
                            <Image src={OFFICE.image} alt={t('office.imageAlt')} fill sizes="(min-width: 768px) 380px, 100vw" className="object-cover transition-transform duration-700 hover:scale-[1.03]" />
                        </a>
                        <div className="flex flex-1 flex-col gap-2 p-[22px]">
                            <h3 className={cardTitle}>
                                <MapPin className={cardIcon} strokeWidth={1.9} aria-hidden />
                                {t('office.title')}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {t.rich('office.description', {
                                    email: (chunks) => <a href={`mailto:${OFFICE.email}`} className="text-foreground underline decoration-border underline-offset-4">{chunks}</a>,
                                })}
                            </p>
                            <ArrowLink href={OFFICE.mapsUrl} external className="mt-auto pt-2">{t('office.address')}</ArrowLink>
                        </div>
                    </motion.div>
                </div>
            </Container>
        </section>
    )
}
