import { FileText, ScrollText, Landmark, Play, BookOpen, ArrowRight, Clock, Users } from 'lucide-react'
import { ColorPercentageRing } from '@/components/ui/color-percentage-ring'
import BrowserFrame from './BrowserFrame'
import { Link } from '@/i18n/routing'

// ─── Mock Data ───────────────────────────────────────────────

const DEMO_SUBJECT = {
    name: 'Ανάπλαση πλατείας Δημοτικής Αγοράς',
    agendaIndex: 3,
    meeting: 'Συνεδρίαση Δημοτικού Συμβουλίου 15/01/26',

    stats: {
        totalMinutes: 23,
        parties: [
            { name: 'Δημοτική Κίνηση', color: '#2563eb', percentage: 45 },
            { name: 'Λαϊκή Συσπείρωση', color: '#dc2626', percentage: 30 },
            { name: 'Ανεξάρτητοι', color: '#6b7280', percentage: 25 },
        ],
        speakerCount: 6,
    },

    introducer: {
        name: 'Γεωργίου Μαρία',
        initials: 'ΓΜ',
        role: 'Αντιδήμαρχος Τεχνικών Έργων',
        color: '#2563eb',
    },

    summary: 'Συζητήθηκε η πρόταση ανάπλασης της πλατείας Δημοτικής Αγοράς, με προϋπολογισμό €1.2 εκ. Η πλειοψηφία τάχθηκε υπέρ, με επιφυλάξεις για τη χρηματοδότηση. Αποφασίστηκε η προκήρυξη αρχιτεκτονικού διαγωνισμού εντός τριμήνου.',

    contributions: [
        {
            name: 'Γεωργίου Μαρία',
            initials: 'ΓΜ',
            color: '#2563eb',
            role: 'Αντιδήμαρχος',
            text: 'Η ανάπλαση της πλατείας αποτελεί προτεραιότητα. Ο προϋπολογισμός καλύπτεται από το ΕΣΠΑ και ο διαγωνισμός θα προκηρυχθεί εντός τριμήνου.',
            timestamp: '1:23:45',
        },
        {
            name: 'Παπαδάκης Νίκος',
            initials: 'ΠΝ',
            color: '#dc2626',
            role: 'Δημοτικός Σύμβουλος',
            text: 'Θέτουμε επιφύλαξη ως προς τον τρόπο χρηματοδότησης. Ζητούμε διαβούλευση με τους κατοίκους πριν οριστικοποιηθεί το σχέδιο.',
            timestamp: '1:28:12',
        },
    ],

    decision: {
        ada: '9ΚΛΜ46ΜΔΨΟ-ΞΑΒ',
        protocolNumber: '145/2026',
        title: 'Έγκριση αρχιτεκτονικού διαγωνισμού ανάπλασης πλατείας',
    },
}

// ─── Annotation labels ──────────────────────────────────────

const CALLOUTS: Record<string, string> = {
    header: 'Αναγνώριση όλων των προ, εκτός και εντός ημερησίας διάταξης θεμάτων',
    stats: 'Στατιστικά ανά παράταξη',
    summary: 'Περίληψη, με πηγές κατευθείαν από την απομαγνητοφώνηση',
    contributions: 'Σύνοψη τοποθέτησης κάθε ομιλητή',
    decision: 'Σύνδεση με την απόφαση στη Διαύγεια',
}

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

function AnnotationBox({ calloutId, labelRight, children }: {
    calloutId: string
    labelRight?: boolean
    children: React.ReactNode
}) {
    const label = CALLOUTS[calloutId]

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
    const d = DEMO_SUBJECT

    return (
        <BrowserFrame url="opencouncil.gr/chania/jan15_2026/subjects/3" className="w-full">
            <div className="p-4 md:p-6 space-y-5 bg-white">
                {/* Section 1: Header — label left */}
                <AnnotationBox calloutId="header">
                    <p className="text-[11px] text-muted-foreground mb-1">
                        {d.meeting} · Θέμα #{d.agendaIndex}
                    </p>
                    <h3 className="text-base md:text-lg font-semibold leading-snug">
                        {d.name}
                    </h3>
                </AnnotationBox>

                {/* Section 2: Stats — label right */}
                <AnnotationBox calloutId="stats" labelRight>
                    <div className="flex flex-wrap gap-4 items-start">
                        <div className="flex items-center gap-3">
                            <ColorPercentageRing
                                data={d.stats.parties.map(p => ({ color: p.color, percentage: p.percentage }))}
                                size={56}
                                thickness={7}
                            >
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                    {d.stats.totalMinutes}΄
                                </span>
                            </ColorPercentageRing>
                            <div className="space-y-0.5">
                                {d.stats.parties.map(p => (
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
                                <span>{d.stats.speakerCount} ομιλητές</span>
                                <span className="text-border">·</span>
                                <Clock className="h-3.5 w-3.5" />
                                <span>{d.stats.totalMinutes} λεπτά</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>Εισηγήτρια:</span>
                                <MockPersonBadge name={d.introducer.name} initials={d.introducer.initials} color={d.introducer.color} />
                            </div>
                        </div>
                    </div>
                </AnnotationBox>

                {/* Section 3: Summary — label left */}
                <AnnotationBox calloutId="summary">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">Περίληψη</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {d.summary.split('. ').map((sentence, i, arr) => (
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

                {/* Section 4: Contributions — label right */}
                <AnnotationBox calloutId="contributions" labelRight>
                    <div className="flex items-center gap-2 mb-3">
                        <ScrollText className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">Τοποθετήσεις</h4>
                        <span className="text-[11px] text-muted-foreground">({d.contributions.length})</span>
                    </div>
                    <div className="space-y-3">
                        {d.contributions.map((c, i) => (
                            <div key={i} className="rounded-lg border border-border/50 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <MockPersonBadge name={c.name} initials={c.initials} color={c.color} role={c.role} />
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-gray-50">
                                            <Play className="h-2.5 w-2.5" />
                                            {c.timestamp}
                                        </span>
                                        <span className="flex items-center text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-gray-50">
                                            <BookOpen className="h-2.5 w-2.5" />
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[13px] text-muted-foreground leading-relaxed pl-[42px]">
                                    {c.text}
                                </p>
                            </div>
                        ))}
                    </div>
                </AnnotationBox>

                {/* Section 5: Decision — label left */}
                <AnnotationBox calloutId="decision">
                    <div className="flex items-center gap-2 mb-2">
                        <Landmark className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-sm font-medium">Απόφαση</h4>
                    </div>
                    <div className="rounded-lg border border-border/50 p-3 text-[12px] space-y-1.5">
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">Τίτλος</span>
                            <span className="font-medium">{d.decision.title}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">ΑΔΑ</span>
                            <span className="font-mono text-blue-600">{d.decision.ada}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">Πρωτόκολλο</span>
                            <span>{d.decision.protocolNumber}</span>
                        </div>
                    </div>
                </AnnotationBox>

                {/* CTA */}
                <div className="pt-2">
                    <Link
                        href="/chania/subjects"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-orange hover:text-orange/80 transition-colors group"
                    >
                        Δείτε ολόκληρη τη σελίδα
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </BrowserFrame>
    )
}
