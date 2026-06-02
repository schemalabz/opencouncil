import { Video, ListTree, Search } from 'lucide-react';

/**
 * "Πώς λειτουργεί;" — a numbered show-don't-tell explainer, borrowing the
 * "/01 /02 /03" list rhythm from the GoDesign reference, in our palette.
 */
const STEPS = [
    {
        icon: <Video className="h-5 w-5" />,
        title: 'Καταγράφουμε τη συνεδρίαση',
        body: 'Παίρνουμε το επίσημο βίντεο του δημοτικού συμβουλίου και το απομαγνητοφωνούμε με ακρίβεια.',
    },
    {
        icon: <ListTree className="h-5 w-5" />,
        title: 'Τη δομούμε σε θέματα',
        body: 'Κάθε σημείο της ημερήσιας διάταξης γίνεται ξεχωριστό θέμα, με ομιλητές, χρόνο και κατηγορία.',
    },
    {
        icon: <Search className="h-5 w-5" />,
        title: 'Ψάχνεις & ενημερώνεσαι',
        body: 'Βρίσκεις τι ειπώθηκε για το θέμα σου σε δευτερόλεπτα — ή λαμβάνεις ειδοποίηση όταν συζητηθεί.',
    },
];

export function HowItWorks() {
    return (
        <section className="rounded-3xl bg-muted/50 p-6 sm:p-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Πώς λειτουργεί το OpenCouncil;</h2>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
                {STEPS.map((step, i) => (
                    <div key={i} className="space-y-3 border-t border-border pt-5">
                        <div className="flex items-center justify-between">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground">
                                {step.icon}
                            </span>
                            <span className="text-sm font-medium tabular-nums text-muted-foreground">
                                /0{i + 1}
                            </span>
                        </div>
                        <h3 className="text-xl font-semibold">{step.title}</h3>
                        <p className="text-muted-foreground">{step.body}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
