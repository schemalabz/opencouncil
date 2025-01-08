import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export function Hero() {
    return (
        <section className="text-center py-8 sm:py-16 space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold font-light">
                Κάνουμε την αυτοδιοίκηση <span className="italic">απλή</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-4xl mx-auto px-2">
                To OpenCouncil χρησιμοποιεί <em>🤖 τεχνητή νοημοσύνη</em> για να <em>👀 παρακολουθεί</em> τα <em>🏛️ δημοτικά συμβούλια</em> και να τα κάνει <em>💡 απλά και κατανοητά</em>.
            </p>
            <div className="space-y-2 sm:space-y-4">
                <Button asChild size="lg" className="text-base sm:text-lg px-6 sm:px-8">
                    <Link href="/explain">
                        📖 Μάθε πώς δουλεύει
                    </Link>
                </Button>
                <div>
                    <Button asChild variant="link" size="sm">
                        <Link href="/about">
                            Πληροφορίες για δήμους και περιφέρειες
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
} 