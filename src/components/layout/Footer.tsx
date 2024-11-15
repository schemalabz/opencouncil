'use client'

import { Link } from '@/i18n/routing'
import { cn } from "@/lib/utils"
import Logo from './Logo'
import { Phone, Twitter } from 'lucide-react'

export default function Footer() {
    return (
        <footer className="w-full bg-background border-t">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="flex flex-col items-center md:items-start">
                        <Logo />
                        <p className="mt-2 text-xs text-muted-foreground text-center md:text-left text-justify max-w-sm">
                            Αυτόματη απομαγνητοφώνηση και οργάνωση δημοτικών συμβουλίων. Οι πληροφορίες που παρουσιάζονται ενδέχεται να περιέχουν λάθη.
                        </p>
                    </div>
                    <nav className="flex flex-col items-center md:items-start space-y-2">
                        <h3 className="font-semibold text-foreground">Σύνδεσμοι</h3>
                        <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Αρχική
                        </Link>
                        <Link href="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Για δήμους
                        </Link>
                        <Link href="/search" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Αναζήτηση
                        </Link>
                        <Link href="/docs" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            API
                        </Link>
                        <Link href="https://status.opencouncil.gr" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Status
                        </Link>
                    </nav>
                    <nav className="flex flex-col items-center md:items-start space-y-2">
                        <h3 className="font-semibold text-foreground">Πολιτικές και Όροι</h3>
                        <Link href="/corrections" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Διορθώσεις
                        </Link>
                        <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Πολιτική Απορρήτου
                        </Link>
                        <Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            Όροι Χρήσης
                        </Link>
                    </nav>
                    <div className="flex flex-col items-center md:items-end">
                        <h3 className="font-semibold text-foreground">Επικοιvωνία</h3>
                        <a
                            href="https://onair.io/opencouncil"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Phone className="w-4 h-4 mr-2" />
                            Καλέστε μας τώρα
                        </a>
                        <a
                            href="https://twitter.com/christosporios"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Twitter className="w-4 h-4 mr-2" />
                            @christosporios
                        </a>
                        <a
                            href="mailto:hello@opencouncil.gr"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            hello@opencouncil.gr
                        </a>
                    </div>
                </div>
                <div className="mt-8 pt-4 border-t border-border text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} OpenCouncil.
                </div>
            </div>
        </footer>
    )
}