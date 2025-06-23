"use client"

import { Link } from "@/i18n/routing"
import Logo from "./Logo"
import { Phone, Mail, ExternalLink } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SiX, SiInstagram, SiFacebook, SiGithub, SiDiscord, SiSubstack } from 'react-icons/si';

interface FooterProps {
    className?: string;
}

export default function Footer({ className }: FooterProps = {}) {
    return (
        <footer className={cn("w-full bg-background border-t print:hidden", className)}>
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <Logo
                            className="flex-shrink-0"
                            imageClassName="w-20 h-14"
                            textClassName="text-lg"
                        />
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
                                { href: "/chat", label: "OpenCouncil AI" },
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
                                    { href: "https://twitter.com/opencouncil_gr", icon: SiX, label: "@opencouncil_gr" },
                                    { href: "https://instagram.com/opencouncil_gr", icon: SiInstagram, label: "@opencouncil_gr" },
                                    { href: "https://github.com/schemalabz/opencouncil", icon: SiGithub, label: "opencouncil" },
                                    { href: "https://discord.gg/VdwtVG43WB", icon: SiDiscord, label: "Discord" },
                                    {
                                        href: "https://www.facebook.com/profile.php?id=61570217107676",
                                        icon: SiFacebook,
                                        label: "OpenCouncil",
                                    },
                                    { href: "https://schemalabs.substack.com", icon: SiSubstack, label: "Substack" },
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
                <div className="mt-8 pt-6 flex flex-col items-center">
                    <Button
                        variant="gradient"
                        className="group"
                        asChild
                    >
                        <a
                            href="https://github.com/schemalabz/opencouncil"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2"
                        >
                            <span>Συνεισφέρετε στο GitHub</span>
                            <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </a>
                    </Button>
                </div>
                <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} OpenCouncil
                </div>
            </div>
        </footer>
    )
}