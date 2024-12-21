'use client'

import { Link } from '@/i18n/routing'
import { cn } from "@/lib/utils"
import Logo from './Logo'
import { Phone, Twitter, Instagram, Facebook, BookOpen } from 'lucide-react'

export default function Footer() {
    return (
        <footer className="w-full bg-background border-t print:hidden">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="flex flex-col items-center">
                        <Logo />
                        <p className="mt-2 text-xs text-muted-foreground md:text-left text-justify max-w-sm">
                            Φτιαγμένο με σεβασμό και εκτίμηση για την τοπική αυτοδιοίκηση.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground md:text-left text-justify max-w-sm">
                            Η OpenCouncil είναι εταιρεία της <Link href="https://schemalabs.gr" className="underline" target="_blank" rel="noopener noreferrer">Schema Labs</Link>,
                            μιας μη-κερδοσκοπικής εταιρείας που αναπτύσσει τεχνολογία για την ενίσχυση της δημοκρατίας.
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
                            href="tel:+302111980212"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Phone className="w-4 h-4 mr-2" />
                            +30 2111980212
                        </a>
                        <a
                            href="https://twitter.com/opencouncil_gr"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Twitter className="w-4 h-4 mr-2" />
                            @opencouncil_gr
                        </a>
                        <a
                            href="https://instagram.com/opencouncil_gr"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Instagram className="w-4 h-4 mr-2" />
                            @opencouncil_gr
                        </a>
                        <a
                            href="https://www.facebook.com/profile.php?id=61570217107676"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Facebook className="w-4 h-4 mr-2" />
                            OpenCouncil
                        </a>
                        <a
                            href="https://schemalabs.substack.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <BookOpen className="w-4 h-4 mr-2" />
                            Substack
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
                    © {new Date().getFullYear()} OpenCouncil
                </div>
            </div>
        </footer>
    )
}