"use client"

import { Link } from "@/i18n/routing"
import Logo from "./Logo"
import { Phone, Twitter, Instagram, Facebook, BookOpen, Mail } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function Footer() {
    return (
        <footer className="w-full bg-background border-t print:hidden">
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <Logo className="w-32 h-auto" />
                        <p className="text-xs text-muted-foreground md:text-left text-center max-w-sm">
                            Φτιαγμένο με σεβασμό και εκτίμηση για την τοπική αυτοδιοίκηση.
                        </p>
                        <p className="text-xs text-muted-foreground md:text-left text-center max-w-sm">
                            Η OpenCouncil είναι εταιρεία της{" "}
                            <Link
                                href="https://schemalabs.gr"
                                className="underline hover:text-primary transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Schema Labs
                            </Link>
                            , μιας μη-κερδοσκοπικής εταιρείας που αναπτύσσει τεχνολογία για την ενίσχυση της δημοκρατίας.
                        </p>
                    </div>
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <h3 className="font-semibold text-foreground text-base">Σύνδεσμοι</h3>
                        <nav className="flex flex-col items-center md:items-start space-y-2">
                            {[
                                { href: "/", label: "Αρχική" },
                                { href: "/about", label: "Για δήμους" },
                                { href: "/search", label: "Αναζήτηση" },
                                { href: "/docs", label: "API" },
                                { href: "https://status.opencouncil.gr", label: "Status", external: true },
                            ].map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <h3 className="font-semibold text-foreground text-base">Πολιτικές και Όροι</h3>
                        <nav className="flex flex-col items-center md:items-start space-y-2">
                            {[
                                { href: "/corrections", label: "Διορθώσεις" },
                                { href: "/privacy", label: "Πολιτική Απορρήτου" },
                                { href: "/terms", label: "Όροι Χρήσης" },
                            ].map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <h3 className="font-semibold text-foreground text-base">Επικοιvωνία</h3>
                        <a
                            href="tel:+302111980212"
                            className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Phone className="w-4 h-4 mr-2" />
                            +30 2111980212
                        </a>
                        <a
                            href="mailto:hello@opencouncil.gr"
                            className="flex items-center text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Mail className="w-4 h-4 mr-2" />
                            hello@opencouncil.gr
                        </a>
                        <div className="flex items-center gap-4">
                            <TooltipProvider>
                                {[
                                    { href: "https://twitter.com/opencouncil_gr", icon: Twitter, label: "@opencouncil_gr" },
                                    { href: "https://instagram.com/opencouncil_gr", icon: Instagram, label: "@opencouncil_gr" },
                                    {
                                        href: "https://www.facebook.com/profile.php?id=61570217107676",
                                        icon: Facebook,
                                        label: "OpenCouncil",
                                    },
                                    { href: "https://schemalabs.substack.com", icon: BookOpen, label: "Substack" },
                                ].map((social) => (
                                    <Tooltip key={social.href}>
                                        <TooltipTrigger asChild>
                                            <a
                                                href={social.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-primary transition-colors"
                                            >
                                                <social.icon className="w-5 h-5" />
                                            </a>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="text-xs">{social.label}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </TooltipProvider>
                        </div>
                    </div>
                </div>
                <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} OpenCouncil
                </div>
            </div>
        </footer>
    )
}