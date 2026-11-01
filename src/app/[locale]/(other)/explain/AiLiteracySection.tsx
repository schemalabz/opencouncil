import { Link } from "@/i18n/routing";
import { HeadingAnchor } from "@/components/explain/HeadingAnchor";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { ACTOR_ICON } from "@/components/explain/actorIcons";
import { formatDate } from "@/lib/formatters/time";
import {
    ACTOR_LABEL,
    AI_ACT_URL,
    AI_FEATURE_ROWS,
    CHANGELOG,
    NOT_DONE,
    STAFF_RULES,
    type Actor,
} from "@/lib/explain/aiLiteracy";

/**
 * The AI-literacy sub-section of /explain#opencouncil: what the AI does and
 * who checks it, what it never does, how the
 * label looks, who is responsible for what, how municipal staff should use
 * it, which models and data, where to report errors, and a change log.
 */

/** Who answers for what. The AI is a tool, so it is not a column here. */
const RESPONSIBILITIES: { actor: Actor; items: string[] }[] = [
    {
        actor: "opencouncil",
        items: [
            "Για το σύστημα και για κάθε κείμενο που παράγεται από το OpenCouncil, με ή χωρίς σήμανση.",
            "Για τον έλεγχο κάθε απομαγνητοφώνησης, λέξη προς λέξη, και των ομιλητών.",
            "Για τη σήμανση σε κάθε κείμενο από ΤΝ.",
            "Για τη διόρθωση κάθε λάθους που της αναφέρουν.",
        ],
    },
    {
        actor: "municipality",
        items: [
            "Για την ημερήσια διάταξη, το βίντεο και τις αποφάσεις που δημοσιεύει.",
            "Για τα πρακτικά: τα ελέγχει και τα υπογράφει όπως ορίζει η νομοθεσία.",
            "Για τη δήλωση του OpenCouncil στο μητρώο συστημάτων ΤΝ.",
        ],
    },
];

const RESPONSIBLE_LABEL: Record<Actor, string> = {
    ai: ACTOR_LABEL.ai,
    opencouncil: "Η OpenCouncil",
    municipality: "Ο δήμος",
};

function ActorChips({ actors }: { actors: Actor[] }) {
    return (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
            {actors.map((a) => {
                const Icon = ACTOR_ICON[a];
                return (
                    <span key={a} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5 text-orange" aria-hidden="true" />
                        {ACTOR_LABEL[a]}
                    </span>
                );
            })}
        </span>
    );
}

function Sub({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <h4 id={id} className="!text-left mt-10 scroll-mt-24 text-lg font-semibold text-foreground">
            <HeadingAnchor id={id}>{children}</HeadingAnchor>
        </h4>
    );
}

export function AiLiteracySection() {
    return (
        <div id="oc-ai" className="scroll-mt-24">
            <h3 className="!text-left text-xl font-normal !leading-none text-foreground sm:text-2xl">
                <HeadingAnchor id="oc-ai">Η τεχνητή νοημοσύνη στο OpenCouncil</HeadingAnchor>
            </h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη (ΤΝ) για να μετατρέπει ένα βίντεο πολλών ωρών σε κείμενο
                που διαβάζεται και αναζητείται. Η ΤΝ κάνει λάθη. Γι’ αυτό, ένα μέρος της δουλειάς της το ελέγχει άνθρωπος,
                και το υπόλοιπο έχει πάντα σήμανση. Εδώ λέμε τι ακριβώς κάνει η ΤΝ, ποιος το ελέγχει, πού μπορεί να
                κάνει λάθος και πώς να το διαβάζετε.
            </p>

            <Sub id="oc-ai-what">Τι κάνει η τεχνητή νοημοσύνη, και ποιος το ελέγχει</Sub>
            {/* wide screens: a table; narrow screens: the same rows as cards */}
            <div className="not-prose mt-4 hidden overflow-hidden rounded-xl border border-border sm:block">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                            <th scope="col" className="px-4 py-2.5 font-semibold">Λειτουργία</th>
                            <th scope="col" className="px-4 py-2.5 font-semibold">Ποιος το κάνει</th>
                            <th scope="col" className="px-4 py-2.5 font-semibold">Τι μπορεί να πάει στραβά</th>
                        </tr>
                    </thead>
                    <tbody>
                        {AI_FEATURE_ROWS.map((row) => (
                            <tr key={row.feature} className="border-t border-border align-top">
                                <th scope="row" className="px-4 py-3 text-left font-semibold text-foreground">
                                    {row.feature}
                                    <div className="mt-1.5">
                                        <ActorChips actors={row.actors} />
                                    </div>
                                    {row.labelled && <AIGeneratedBadge className="mt-1.5" />}
                                </th>
                                <td className="px-4 py-3 leading-relaxed text-muted-foreground">{row.who}</td>
                                <td className="px-4 py-3 leading-relaxed text-muted-foreground">{row.errors}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ul className="not-prose mt-4 space-y-3 sm:hidden">
                {AI_FEATURE_ROWS.map((row) => (
                    <li key={row.feature} className="rounded-xl border border-border p-4">
                        <p className="font-semibold text-foreground">{row.feature}</p>
                        <div className="mt-1.5">
                            <ActorChips actors={row.actors} />
                        </div>
                        {row.labelled && <AIGeneratedBadge className="mt-1.5" />}
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">Ποιος το κάνει: </span>
                            {row.who}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">Τι μπορεί να πάει στραβά: </span>
                            {row.errors}
                        </p>
                    </li>
                ))}
            </ul>

            <Sub id="oc-ai-not">Τι δεν κάνει</Sub>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-orange">
                {NOT_DONE.map((t) => (
                    <li key={t}>{t}</li>
                ))}
            </ul>

            <Sub id="oc-ai-label">Πώς θα το αναγνωρίσετε: η σήμανση</Sub>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Κάθε κείμενο που έγραψε η ΤΝ χωρίς να το ελέγξει άνθρωπος έχει δίπλα του την ένδειξη «Κείμενο από ΤΝ».
                Έτσι φαίνεται σε μια σύνοψη θέματος:
            </p>
            <figure className="not-prose mt-4 max-w-md rounded-xl border border-border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Σύνοψη</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Το συμβούλιο ενέκρινε τη μελέτη για τον πεζόδρομο της οδού Ερμού, με αντίρρηση της μειοψηφίας
                    για το κόστος.
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">παράδειγμα</span>
                    <AIGeneratedBadge />
                </div>
            </figure>
            <p className="mt-4 leading-relaxed text-muted-foreground">
                Θα τη δείτε στις συνόψεις των θεμάτων, στις τοποθετήσεις ανά ομιλητή, στις εικόνες και σε άλλα
                σημεία. Η ελεγμένη απομαγνητοφώνηση δεν την έχει, επειδή την έχει διαβάσει άνθρωπος. Τα μηνύματα ενημέρωσης στο
                WhatsApp κλείνουν με τη φράση «Μήνυμα με τεχνητή νοημοσύνη».
            </p>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Αυτή είναι η υποχρέωση διαφάνειας του άρθρου 50 του Κανονισμού, και την εφαρμόζουμε σε κάθε δήμο με τον
                ίδιο τρόπο.
            </p>

            <Sub id="oc-ai-who">Ποιος ευθύνεται για τι</Sub>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Η τεχνητή νοημοσύνη είναι εργαλείο. Δεν ευθύνεται για τίποτα: ευθύνονται όσοι τη χρησιμοποιούν.
            </p>
            <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
                {RESPONSIBILITIES.map(({ actor, items }) => {
                    const Icon = ACTOR_ICON[actor];
                    return (
                        <div key={actor} className="rounded-xl border border-border p-4">
                            <p className="flex items-center gap-2 font-semibold text-foreground">
                                <Icon className="h-4 w-4 text-orange" aria-hidden="true" />
                                {RESPONSIBLE_LABEL[actor]}
                            </p>
                            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                                {items.map((t) => (
                                    <li key={t} className="flex gap-2">
                                        <span aria-hidden="true" className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-orange" />
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>

            <Sub id="oc-ai-staff">Αν δουλεύετε σε δήμο: πέντε κανόνες</Sub>
            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-muted-foreground marker:font-semibold marker:text-orange">
                {STAFF_RULES.map((t) => (
                    <li key={t}>{t}</li>
                ))}
            </ol>

            <Sub id="oc-ai-models">Μοντέλα και δεδομένα</Sub>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Η απομαγνητοφώνηση γίνεται με την υπηρεσία ElevenLabs Scribe και η ταυτοποίηση των ομιλητών από την
                φωνή τους (μόνο όταν οι ίδιοι οι ομιλητές έχουν δώσει ρητή συγκατάθεση στην OpenCouncil) με την
                Pyannote. Τα θέματα, οι συνόψεις και τα μηνύματα γράφονται με μοντέλα Claude της Anthropic. Το υλικό
                που επεξεργαζόμαστε είναι το δημόσιο βίντεο της συνεδρίασης, η ημερήσια διάταξη και οι αποφάσεις της
                Δι@ύγειας. Η <Link href="/privacy" className="text-orange underline underline-offset-2">πολιτική απορρήτου</Link>{" "}
                αναφέρει αναλυτικά ποιες υπηρεσίες επεξεργάζονται τι, και σε ποια τοποθεσία.
            </p>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Το OpenCouncil εφαρμόζει τις υποχρεώσεις διαφάνειας του άρθρου 50 του{" "}
                <a href={AI_ACT_URL} target="_blank" rel="noopener noreferrer" className="text-orange underline underline-offset-2">
                    Κανονισμού (ΕΕ) 2024/1689
                </a>
                : σήμανση του κειμένου από ΤΝ, και από τον Δεκέμβριο του 2026 μηχαναγνώσιμη σήμανση στα βίντεο που
                παράγει. Δεν παίρνει αποφάσεις για πρόσωπα και δεν τα αξιολογεί.
            </p>

            <Sub id="oc-ai-errors">Πού αναφέρετε ένα λάθος</Sub>
            <p className="mt-3 leading-relaxed text-muted-foreground">
                Στείλτε τον σύνδεσμο της σελίδας, το απόσπασμα που είναι λάθος και, αν μπορείτε, το σωστό, στο{" "}
                <a href="mailto:corrections@opencouncil.gr" className="text-orange underline underline-offset-2">corrections@opencouncil.gr</a>. Το εξετάζουμε και το διορθώνουμε, και
                το κείμενο αλλάζει για όλους. Περισσότερα στη σελίδα <Link href="/corrections" className="text-orange underline underline-offset-2">διορθώσεων</Link>. Οι υπάλληλοι του
                δήμου με πρόσβαση διαχείρισης μπορούν να διορθώσουν το κείμενο και μόνοι τους.
            </p>

            <Sub id="oc-ai-changes">Ιστορικό αλλαγών αυτής της ενότητας</Sub>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Η ενότητα αλλάζει όποτε αλλάζει ο τρόπος που δουλεύει το OpenCouncil. Κάθε αλλαγή καταγράφεται εδώ.
            </p>
            <ul className="not-prose mt-3 space-y-1.5 text-sm text-muted-foreground">
                {CHANGELOG.map((c) => (
                    <li key={c.date} className="flex gap-3">
                        <time dateTime={c.date} className="shrink-0 font-mono text-xs text-foreground/70">
                            {formatDate(new Date(c.date))}
                        </time>
                        <span>{c.text}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
