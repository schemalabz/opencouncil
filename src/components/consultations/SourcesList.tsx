import { ExternalLink, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Source } from "./types";

interface SourcesListProps {
    sources: Source[];
    contactEmail: string;
}

export default function SourcesList({ sources, contactEmail }: SourcesListProps) {
    if (sources.length === 0) return null;

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Πηγές & Επικοινωνία
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Sources */}
                <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Πηγές κανονισμού</h4>
                    <p className="text-xs text-muted-foreground">
                        Αυτή η εφαρμογή βασίζεται στις παρακάτω πρωτότυπες πηγές, επίσημα έγγραφα και αναρτήσεις του Δήμου, τα οποία παρουσιάζονται εδώ με διαδραστικό
                        τρόπο, σε χάρτη και με δυνατότητες σχολιασμού.
                    </p>
                    <div className="space-y-2">
                        {sources.map((source, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-sm hover:underline text-blue-600"
                                    >
                                        {source.title}
                                    </a>
                                    {source.description && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {source.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Contact Email */}
                <div className="pt-3 border-t">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Επικοινωνία με το Δήμο</h4>
                    <p className="text-xs text-muted-foreground">
                        Μπορείτε να συμμετέχετε στη διαβούλευση είτε μέσω αυτής της εφαρμογής, είτε στέλνοντας απευθείας email στην παρακάτω διεύθυνση. Αυτή η εφαρμογή προωθεί αυτόματα όλα τα σχόλια που υποβάλλονται σε αυτό το email.
                    </p>
                    <a
                        href={`mailto:${contactEmail}`}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        {contactEmail}
                    </a>
                </div>
                <div className="pt-3 border-t">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Σχετικά με την εφαρμογή</h4>
                    <p className="text-xs text-muted-foreground">
                        Αυτή η εφαρμογή αναπτύχθηκε από την <a href="/about" className="text-blue-600 hover:underline">OpenCouncil</a> και δεν σχετίζεται ούτε υποστηρίζεται από το Δήμο Αθηναίων.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Για τεχνική υποστήριξη ή απορίες σχετικά με την εφαρμογή, μπορείτε να επικοινωνήσετε απευθείας μαζί μας:
                    </p>
                    <div className="mt-1 space-y-1">
                        <a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`} className="text-sm text-blue-600 hover:underline block">
                            {process.env.NEXT_PUBLIC_CONTACT_EMAIL}
                        </a>
                        <p className="text-sm text-blue-600">
                            {process.env.NEXT_PUBLIC_CONTACT_PHONE}
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Μπορείτε επίσης να μας βρείτε στο <a href="https://instagram.com/opencouncil_gr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Instagram</a>, στο <a href="https://discord.gg/VdwtVG43WB" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Discord</a>, καθώς και να προτείνετε αλλαγές και να συνεισφέρετε στο <a href="https://github.com/schemalabz/opencouncil" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">GitHub</a>.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
} 