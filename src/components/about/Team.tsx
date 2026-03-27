import { motion } from 'framer-motion'
import { Github, Linkedin, Twitter, Mail, ArrowRight, MapPin, Rocket } from 'lucide-react'
import Image from 'next/image'
import { Link } from '@/i18n/routing'
import { TEAM_MEMBERS, ROADMAP_ITEMS } from './config'
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
                        Η ομάδα πίσω από το OpenCouncil
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        6 άνθρωποι, χτίζουμε τεχνολογία για την τοπική δημοκρατία. Η OpenCouncil ΙΚΕ ανήκει εξ&apos; ολοκλήρου στη{' '}
                        <a href="https://schemalabs.gr" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                            Schema Labs
                        </a>
                        , μη-κερδοσκοπική εταιρεία.
                    </p>
                </motion.div>

                {/* Team grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 md:gap-8 mb-16">
                    {TEAM_MEMBERS.map((person, index) => (
                        <motion.div
                            key={person.name}
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
                                        alt={person.name}
                                        width={96}
                                        height={96}
                                        className="w-full h-full object-cover filter grayscale hover:grayscale-0 transition-all duration-300"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300" />
                                )}
                            </div>
                            <h3 className="text-sm sm:text-base font-medium">{person.name}</h3>
                            <div className="flex gap-2.5 mt-2">
                                {person.socials.twitter && (
                                    <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Twitter className="w-3.5 h-3.5" />
                                    </a>
                                )}
                                {person.socials.linkedin && (
                                    <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Linkedin className="w-3.5 h-3.5" />
                                    </a>
                                )}
                                {person.socials.email && (
                                    <a href={person.socials.email} className="text-muted-foreground/50 hover:text-primary transition-colors">
                                        <Mail className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Office + Roadmap + Open Source — 3-column grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {/* Ο χώρος μας */}
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
                                <h3 className="text-base font-medium">Ο χώρος μας</h3>
                            </div>
                        </div>
                        <a href="https://maps.app.goo.gl/o1k1gqz9uiqw9FmW9" target="_blank" rel="noopener noreferrer">
                            <div className="aspect-[16/9] relative overflow-hidden mx-4 rounded-lg">
                                <Image
                                    src="/about/office.jpg"
                                    alt="Ο χώρος μας — Σμολένσκι 22, Αθήνα"
                                    fill
                                    className="object-cover hover:scale-105 transition-transform duration-500"
                                />
                            </div>
                        </a>
                        <div className="p-6 pt-4 flex flex-col flex-1">
                            <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                                Ένας ανοιχτός χώρος για συζήτηση και δημιουργία στο κέντρο της Αθήνας. Ελάτε να γνωριστούμε, ή στείλτε μας ένα email στο{' '}
                                <a href="mailto:space@opencouncil.gr" className="text-primary hover:underline">space@opencouncil.gr</a>
                                {' '}για να συνδιοργανώσουμε κάποιο event.
                            </p>
                            <a
                                href="https://maps.app.goo.gl/o1k1gqz9uiqw9FmW9"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                            >
                                Σμολένσκι 22, Αθήνα
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
                            <h3 className="text-base font-medium">Χτίζουμε συνεχώς</h3>
                        </div>
                        <div className="relative pl-6 flex-1">
                            {/* Continuous vertical line */}
                            <div className="absolute left-[4px] top-1 bottom-1 w-px bg-border" />

                            <div className="space-y-4">
                                {ROADMAP_ITEMS.map((item) => (
                                    <div key={item.title} className="relative">
                                        {/* Dot on the line */}
                                        <div className="absolute -left-6 top-1 h-[9px] w-[9px] rounded-full border-2 border-primary bg-white" />
                                        <p className="text-sm font-medium">{item.title}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.timeframe}</p>
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
                            Δείτε το roadmap
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
                            <h3 className="text-base font-medium">Ο κώδικάς μας είναι ανοιχτός</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                            Διαφανής ανάπτυξη με άδεια GPL v3. Κάθε γραμμή κώδικα είναι δημόσια.
                        </p>
                        {/* GitHub commit activity grid — last 12 weeks */}
                        <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-border/30">
                            <div className="grid grid-cols-12 gap-0.5">
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
                                {contributorCount} contributors · Τελευταίες 12 εβδομάδες
                            </p>
                        </div>
                        <a
                            href="https://github.com/schemalabz/opencouncil"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                        >
                            Δείτε στο GitHub
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
