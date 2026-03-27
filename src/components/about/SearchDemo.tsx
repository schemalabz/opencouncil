import { Search, MapPin, Clock, User } from 'lucide-react'
import BrowserFrame from './BrowserFrame'

const MOCK_RESULTS = [
    {
        subject: 'Ανάπλαση πλατείας Δημοτικής Αγοράς',
        city: 'Δήμος Χανίων',
        date: '15/01/2026',
        speaker: 'Γεωργίου Μαρία',
        highlight: '...ο προϋπολογισμός καλύπτεται από το <mark>ΕΣΠΑ</mark> και ο διαγωνισμός θα προκηρυχθεί εντός τριμήνου...',
        location: 'Πλ. Δημοτικής Αγοράς',
    },
    {
        subject: 'Χρηματοδότηση αθλητικών εγκαταστάσεων',
        city: 'Δήμος Χαλανδρίου',
        date: '22/01/2026',
        speaker: 'Κωνσταντίνου Δημήτρης',
        highlight: '...η ένταξη στο <mark>ΕΣΠΑ</mark> εγκρίθηκε για το κολυμβητήριο και τις αίθουσες πολλαπλών χρήσεων...',
        location: 'Αθλητικό κέντρο Ν. Χαλανδρίου',
    },
    {
        subject: 'Ενεργειακή αναβάθμιση σχολείων',
        city: 'Δήμος Αθηναίων',
        date: '10/02/2026',
        speaker: 'Παπανδρέου Ελένη',
        highlight: '...υποβλήθηκε πρόταση στο <mark>ΕΣΠΑ</mark> 2021-2027 για φωτοβολταϊκά σε 12 σχολικά κτίρια...',
        location: 'Κεντρικός τομέας',
    },
]

export default function SearchDemo() {
    return (
        <BrowserFrame url="opencouncil.gr/search" className="w-full">
            <div className="bg-white p-3 md:p-4">
                {/* Search bar */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-gray-50/80 px-3 py-2 mb-4">
                    <Search className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                    <span className="text-sm text-foreground">ΕΣΠΑ</span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground bg-white border border-border/60 rounded px-1.5 py-0.5">Όλοι οι δήμοι</span>
                    </div>
                </div>

                {/* Results count */}
                <p className="text-[11px] text-muted-foreground mb-3">
                    {MOCK_RESULTS.length} αποτελέσματα σε 3 δήμους
                </p>

                {/* Result cards */}
                <div className="space-y-3">
                    {MOCK_RESULTS.map((r, i) => (
                        <div key={i} className="rounded-lg border border-border/50 p-3 hover:border-border transition-colors">
                            {/* Subject title */}
                            <p className="text-[13px] font-medium leading-snug">{r.subject}</p>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
                                <span>{r.city}</span>
                                <span className="flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {r.date}
                                </span>
                                <span className="flex items-center gap-0.5">
                                    <User className="h-2.5 w-2.5" />
                                    {r.speaker}
                                </span>
                                {r.location && (
                                    <span className="flex items-center gap-0.5">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {r.location}
                                    </span>
                                )}
                            </div>

                            {/* Highlighted transcript excerpt */}
                            <p
                                className="text-[12px] text-muted-foreground leading-relaxed mt-2 [&_mark]:bg-yellow-200/70 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                                dangerouslySetInnerHTML={{ __html: r.highlight }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </BrowserFrame>
    )
}
