"use client"

import { Link } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import Logo from "./Logo"
import CountrySwitcher from "./CountrySwitcher"
import ScriptSwitcher from "./ScriptSwitcher"
import { Phone, Mail, ExternalLink } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SiX, SiInstagram, SiFacebook, SiGithub, SiDiscord, SiSubstack } from 'react-icons/si';
import { REOPEN_CONSENT_EVENT } from "@/lib/utils/analyticsConsent";
import { hasExplainPage } from "@/lib/explain/availability";
import { Realm } from "@prisma/client";
import { getRealmContactPhone, telHref } from "@/lib/realm";

interface FooterProps {
    className?: string;
    /**
     * Resolved server-side by the layout rather than read from the browser: it
     * gates the /explain link, and it picks the contact number, which must be
     * right in the first painted HTML — a visitor on opencouncil.rs must never
     * see the Greek number flash.
     */
    realm: Realm;
}

/** Column headings: small, tracked and quiet, the same eyebrow the cards use. */
const HEADING = "text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground";
/** A link in a column. `py-0.5` is hit area, not rhythm — the gap sets the rhythm. */
const LINK = "py-0.5 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-primary";

export default function Footer({ className, realm }: FooterProps) {
    const t = useTranslations("Footer")
    const contactPhone = getRealmContactPhone(realm)

    const links = [
        { href: "/", label: t("linkHome") },
        // /explain is written in Greek, about Greek municipalities — only link it where it exists
        ...(hasExplainPage(realm) ? [{ href: "/explain", label: t("linkLearnMore") }] : []),
        { href: "/about", label: t("linkForMunicipalities") },
        { href: "/search", label: t("linkSearch") },
        { href: "/mcp", label: "OpenCouncil MCP" },
        { href: "/docs", label: "API" },
        { href: "https://schemalabs.gr/jobs", label: t("linkJobs"), external: true },
        { href: "https://status.opencouncil.gr", label: "Status", external: true },
    ]

    const socials = [
        { href: "https://twitter.com/opencouncil_gr", icon: SiX, label: "X (Twitter): @opencouncil_gr" },
        { href: "https://instagram.com/opencouncil_gr", icon: SiInstagram, label: "Instagram: @opencouncil_gr" },
        { href: "https://github.com/schemalabz/opencouncil", icon: SiGithub, label: "GitHub: opencouncil" },
        { href: "https://discord.gg/VdwtVG43WB", icon: SiDiscord, label: "Discord" },
        { href: "https://www.facebook.com/profile.php?id=61570217107676", icon: SiFacebook, label: "Facebook: OpenCouncil" },
        { href: "https://schemalabs.substack.com", icon: SiSubstack, label: "Substack" },
    ]

    return (
        // The flame rule is the footer's whole top border. It reads as the end of
        // the page rather than as one more hairline among the many the content
        // above already draws.
        <footer className={cn("w-full border-t-[3px] border-[hsl(var(--orange))] bg-background print:hidden", className)}>
            <div className="px-4 pt-10 sm:px-8 sm:pt-11">
                {/* The masthead. The tagline is set as a statement rather than as
                    fine print: it is the only sentence here that says what the
                    project is for, and at 12px nobody read it. */}
                <div className="flex flex-col items-start gap-6 pb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
                    <Logo
                        className="flex-shrink-0"
                        imageClassName="w-[57px] h-12 sm:w-[76px] sm:h-16"
                        textClassName="text-[22px] sm:text-[29px]"
                    />
                    {/* Sizes pinned rather than `text-base`/`text-lg`: those carry
                        a line-height of their own, which silently outranked the
                        1.4 here and set the statement 28px apart at `sm`. */}
                    <p className="max-w-[480px] text-pretty text-[16px] leading-[1.4] text-foreground sm:text-[18px]">
                        {t("tagline")}
                    </p>
                </div>

                <div className="h-px bg-border" />

                {/* Two columns from the narrowest width: the link lists are short
                    and stacking all four ran the footer past a thousand pixels on
                    a phone. The two that hold prose keep the full row. */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-8 pb-10 pt-9 lg:grid-cols-4 lg:gap-10">
                    <nav className="flex flex-col gap-3.5">
                        <h3 className={HEADING}>{t("linksHeading")}</h3>
                        <div className="flex flex-col gap-1.5">
                            {links.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={LINK}
                                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </nav>

                    <nav className="flex flex-col gap-3.5">
                        <h3 className={HEADING}>{t("policiesHeading")}</h3>
                        <div className="flex flex-col items-start gap-1.5">
                            {[
                                { href: "/corrections", label: t("corrections") },
                                { href: "/privacy", label: t("privacy") },
                                { href: "/terms", label: t("terms") },
                            ].map((link) => (
                                <Link key={link.href} href={link.href} className={LINK}>
                                    {link.label}
                                </Link>
                            ))}
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new Event(REOPEN_CONSENT_EVENT))}
                                className={cn(LINK, "text-left")}
                            >
                                {t("cookiePreferences")}
                            </button>
                        </div>
                    </nav>

                    <div className="col-span-2 flex flex-col gap-3.5 lg:col-span-1">
                        <h3 className={HEADING}>{t("contact")}</h3>
                        <div className="flex flex-col items-start gap-1.5">
                            <a href={telHref(contactPhone)} className={cn(LINK, "flex items-center gap-2")}>
                                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {contactPhone}
                            </a>
                            <a href="mailto:hello@opencouncil.gr" className={cn(LINK, "flex items-center gap-2")}>
                                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                hello@opencouncil.gr
                            </a>
                        </div>
                        {/* Pulled out by the row's own left padding, so the first
                            icon's ink lines up with the heading above it while the
                            touch targets stay full size. */}
                        <div className="-ml-2.5 flex flex-wrap items-center">
                            <TooltipProvider>
                                {socials.map((social) => (
                                    <Tooltip key={social.href}>
                                        <TooltipTrigger asChild>
                                            <a
                                                href={social.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                                                aria-label={social.label}
                                            >
                                                <social.icon className="h-[18px] w-[18px]" />
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

                    <div className="col-span-2 flex flex-col gap-3.5 lg:col-span-1">
                        <h3 className={HEADING}>{t("aboutHeading")}</h3>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">
                            {t.rich("companyDescription", {
                                link: (chunks) => (
                                    <Link
                                        href="https://schemalabs.gr"
                                        className="underline transition-colors hover:text-primary"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {chunks}
                                    </Link>
                                ),
                            })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Full width and edge to edge: one invitation across the foot of the
                page, where the old centred pill sat in the middle of a row of
                nothing. */}
            <a
                href="https://github.com/schemalabz/opencouncil"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-14 items-center justify-center gap-2.5 bg-primary px-4 text-center text-[15px] text-primary-foreground transition-colors hover:bg-foreground"
            >
                <span>{t("contribute")}</span>
                <ExternalLink className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>

            <div className="flex flex-col items-center gap-2 px-4 py-4 text-[13px] text-muted-foreground sm:flex-row sm:justify-between sm:px-8 sm:py-[18px]">
                <span>© {new Date().getFullYear()} OpenCouncil</span>
                <div className="flex items-center gap-4">
                    <CountrySwitcher realm={realm} />
                    <ScriptSwitcher />
                </div>
            </div>
        </footer>
    )
}
