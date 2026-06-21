"use client";
import { useState } from "react";
import Image from "next/image";
import {
    Building2,
    FileText,
    Smartphone,
    Mic,
    MessageCircle,
    Code,
    Mail,
    Phone,
    Copy,
    Check,
    Database,
    Eraser,
    Rocket,
    Package,
    Clock,
    Calendar,
    Receipt,
} from "lucide-react";

import { formatCurrency, monthsBetween, formatDate } from "@/lib/utils";
import { calculateOfferTotals, PHYSICAL_PRESENCE } from "@/lib/pricing";
import type { Offer } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadPdfButton } from "./download-pdf-button";

const isRegionFor = (offer: Offer) => offer.recipientName.startsWith("Περιφέρεια");

const grammar = (offer: Offer) => {
    const isRegion = isRegionFor(offer);
    return {
        accusative: isRegion ? "την" : "το",
        def: isRegion ? "την περιφέρεια" : "τον δήμο",
        possessive: isRegion ? "της περιφέρειας" : "του δήμου",
        possessivePronoun: isRegion ? "της" : "του",
        demonym: isRegion ? "πολίτες" : "δημότες",
        bodyAdj: isRegion ? "περιφερειακού" : "δημοτικού",
    };
};

export default function OfferLetter({ offer }: { offer: Offer }) {
    const totals = calculateOfferTotals(offer);
    const G = grammar(offer);

    const hasEquipment = !!(offer.equipmentRentalName || offer.equipmentRentalDescription);
    const hasPresence = !!(offer.physicalPresenceHours && offer.physicalPresenceHours > 0);

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Sticky action bar */}
            <ActionBar offer={offer} />

            <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 space-y-12">
                {/* Header */}
                <header className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="OpenCouncil" width={36} height={36} />
                        <span className="text-base font-semibold tracking-tight">OpenCouncil</span>
                    </div>
                    <div className="space-y-3">
                        <p className="text-sm uppercase tracking-wider text-muted-foreground">
                            Οικονομική προσφορά
                        </p>
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900">
                            {offer.recipientName}
                        </h1>
                        <p className="text-lg text-neutral-600 max-w-2xl">
                            Για την πλατφόρμα OpenCouncil και τη ψηφιοποίηση των δημόσιων
                            συνεδριάσεων του {G.bodyAdj} συμβουλίου.
                        </p>
                    </div>
                </header>

                {/* Hero summary */}
                <HeroSummary offer={offer} />

                {/* Cost table */}
                <Section title="Κόστος">
                    <CostTable offer={offer} hasEquipment={hasEquipment} hasPresence={hasPresence} />
                </Section>

                {/* Payment plan */}
                <Section title="Πλάνο πληρωμών">
                    <PaymentPlan offer={offer} />
                </Section>

                {/* What's included */}
                <Section
                    title="Τι περιλαμβάνει"
                    intro={
                        <>
                            Δύο βασικές υπηρεσίες: η <strong>ψηφιοποίηση δημόσιων συνεδριάσεων</strong> και η
                            ελεύθερη χρήση της <strong>πλατφόρμας OpenCouncil</strong> από {G.def} και τους {G.demonym}{" "}
                            {G.possessive}.
                        </>
                    }
                >
                    <div className="grid md:grid-cols-2 gap-6">
                        <FeatureCard
                            icon={<FileText className="w-5 h-5" />}
                            title="Ψηφιοποίηση συνεδριάσεων"
                            restriction={`Έως ${offer.hoursToIngest} ώρες δημόσιων συνεδριάσεων`}
                            items={[
                                "Απομαγνητοφώνηση και αναγνώριση ομιλητών",
                                "Συνόψεις κάθε τοποθέτησης",
                                "Αναγνώριση θεμάτων και σύνδεση με την ημερήσια διάταξη",
                                "Μετατροπή σε MP4, MP3 και adaptive bitrate streaming",
                                offer.correctnessGuarantee
                                    ? "Ανθρώπινος έλεγχος εντός 36 ωρών"
                                    : "Αυτόματη διαδικασία· διορθώσεις κατόπιν αιτήματος",
                                "Ολοκλήρωση εντός 24 ωρών από τη διαθεσιμότητα του βίντεο",
                            ]}
                        />
                        <FeatureCard
                            icon={<Building2 className="w-5 h-5" />}
                            title="Πλατφόρμα OpenCouncil"
                            restriction="Απεριόριστη χρήση για όλους"
                            items={[
                                <>
                                    Σελίδα {G.possessive} στο{" "}
                                    <a href={`/${offer.cityId}`} className="underline decoration-neutral-300 underline-offset-2">
                                        opencouncil.gr/{offer.cityId}
                                    </a>
                                </>,
                                "Πρόσβαση σε απομαγνητοφωνήσεις, θέματα και συνόψεις",
                                "Στατιστικά παρατάξεων, ομιλητών και θεμάτων",
                                "Εξαγωγή απομαγνητοφωνήσεων σε PDF",
                                "Σελίδες παρατάξεων και ομιλητών",
                                "Αναζήτηση σε θέματα και απομαγνητοφωνήσεις",
                                "Ανοιχτά δεδομένα μέσω API",
                            ]}
                        />
                    </div>
                </Section>

                {/* Extras */}
                {(hasEquipment || hasPresence) && (
                    <Section title="Επιπλέον υπηρεσίες">
                        <div className="grid gap-4">
                            {hasEquipment && (
                                <ExtraCard
                                    icon={<Package className="w-5 h-5" />}
                                    title={offer.equipmentRentalName || "Παροχή εξοπλισμού συνεδριάσεων"}
                                    description={
                                        offer.equipmentRentalDescription ||
                                        "Παροχή εξοπλισμού για τη καταγραφή συνεδριάσεων"
                                    }
                                />
                            )}
                            {hasPresence && (
                                <ExtraCard
                                    icon={<Clock className="w-5 h-5" />}
                                    title="Φυσική παρουσία σε συνεδριάσεις"
                                    description="Εξειδικευμένο προσωπικό για τεχνική υποστήριξη του εξοπλισμού καταγραφής κατά τις συνεδριάσεις."
                                />
                            )}
                        </div>
                    </Section>
                )}

                {/* Pilot features */}
                <Section
                    title="Πιλοτικές λειτουργίες"
                    intro={
                        <>
                            Δωρεάν διαθέσιμες κατόπιν συνεννόησης. Δεν είναι εγγυημένες, αλλά
                            θα αναπτυχθούν σε συνεργασία με {G.def}.
                        </>
                    }
                >
                    <div className="grid md:grid-cols-3 gap-4">
                        <PilotCard
                            icon={<MessageCircle className="w-5 h-5" />}
                            title="Άμεση ενημέρωση"
                            description={`Προσωποποιημένα μηνύματα σε ${G.demonym} ανά συνεδρίαση.`}
                            limit="Έως 1.000 ενεργοί λογαριασμοί"
                        />
                        <PilotCard
                            icon={<Mic className="w-5 h-5" />}
                            title="Podcast"
                            description="Αυτόματη παραγωγή και δημοσίευση σε Spotify, Apple Podcasts κ.ά."
                            limit="Έως 2 ώρες/μήνα"
                        />
                        <PilotCard
                            icon={<Smartphone className="w-5 h-5" />}
                            title="Υλικό για social media"
                            description="Σύντομα βίντεο και κείμενα ανά συνεδρίαση."
                            limit="Έως 20 δημοσιεύσεις/μήνα"
                        />
                    </div>
                </Section>

                {/* Bonus benefits */}
                <Section title="Δωρεάν προνόμια">
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-neutral-700">
                        <Perk icon={<Phone className="w-4 h-4" />}>
                            Άμεση τηλεφωνική υποστήριξη
                        </Perk>
                        <Perk icon={<Mail className="w-4 h-4" />}>
                            Τεχνική υποστήριξη μέσω email
                        </Perk>
                        <Perk icon={<Database className="w-4 h-4" />}>
                            Ανοιχτά δεδομένα μέσω <a href="/docs" className="underline decoration-neutral-300 underline-offset-2">API</a>
                        </Perk>
                        <Perk icon={<Code className="w-4 h-4" />}>
                            Ανοιχτός κώδικας υπό GPL v3
                        </Perk>
                        <Perk icon={<Eraser className="w-4 h-4" />}>
                            <a href="/corrections" className="underline decoration-neutral-300 underline-offset-2">Πολιτική διορθώσεων</a>
                        </Perk>
                        <Perk icon={<Rocket className="w-4 h-4" />}>
                            Συνεχής ανάπτυξη και βελτίωση
                        </Perk>
                        <Perk icon={<Package className="w-4 h-4" />}>
                            Μηδενικό κόστος ενσωμάτωσης
                        </Perk>
                        <Perk icon={<Clock className="w-4 h-4" />}>
                            Δωρεάν δοκιμαστική περίοδος
                        </Perk>
                    </div>
                </Section>

                {/* Tech specs (collapsed by default) */}
                <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900 select-none">
                        Τεχνικές προδιαγραφές
                        <span className="ml-2 text-neutral-400 group-open:hidden">+</span>
                        <span className="ml-2 text-neutral-400 hidden group-open:inline">−</span>
                    </summary>
                    <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                        <li>• Cloud στη Digital Ocean (servers στην ΕΕ)</li>
                        <li>• Whisper (OpenAI) + PyAnnote για απομαγνητοφώνηση</li>
                        <li>• Claude (Anthropic) για συνόψεις και εξαγωγή θεμάτων</li>
                        <li>• Adaptive bitrate streaming μέσω mux.com έως 720p</li>
                        <li>• Διαθέσιμη σε όλους τους σύγχρονους περιηγητές</li>
                        <li>
                            • <a href="/privacy" className="underline decoration-neutral-300 underline-offset-2">Πολιτική απορρήτου</a> ·{" "}
                            <a href="/terms" className="underline decoration-neutral-300 underline-offset-2">Όροι χρήσης</a>
                        </li>
                    </ul>
                </details>

                {/* CTA */}
                <CTABox offer={offer} />

                {/* Signature + company */}
                <footer className="pt-8 border-t border-neutral-200 grid sm:grid-cols-2 gap-8 text-sm">
                    <div className="text-neutral-600 space-y-1">
                        <p className="font-medium text-neutral-900">OpenCouncil Μονοπρόσωπη Ι.Κ.Ε.</p>
                        <p>Λαλέχου 1, Νέο Ψυχικό 15451</p>
                        <p>ΑΦΜ 802666391 · ΓΕΜΗ 180529301000</p>
                        <p className="pt-2">
                            Ανήκει στην{" "}
                            <a href="https://schemalabs.gr" className="underline decoration-neutral-300 underline-offset-2">
                                Schema Labs ΑΜΚΕ
                            </a>
                            .
                        </p>
                    </div>
                    <div className="sm:text-right text-neutral-600">
                        <p>Με εκτίμηση,</p>
                        <p className="font-medium text-neutral-900 mt-2">{offer.respondToName}</p>
                        <p>{offer.respondToEmail}</p>
                        <p>{offer.respondToPhone}</p>
                    </div>
                </footer>
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ActionBar({ offer }: { offer: Offer }) {
    return (
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-end gap-2">
                <CopyLinkButton offer={offer} />
                <DownloadPdfButton offer={offer} />
            </div>
        </div>
    );
}

function HeroSummary({ offer }: { offer: Offer }) {
    const totals = calculateOfferTotals(offer);
    return (
        <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
                <div className="p-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        Συνολικό κόστος
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">
                        {formatCurrency(totals.total)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">χωρίς ΦΠΑ</p>
                </div>
                <div className="p-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        Διάρκεια
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">
                        {totals.months} μήνες
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(offer.startDate)} → {formatDate(offer.endDate)}
                    </p>
                </div>
                <div className="p-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        Ημερομηνία προσφοράς
                    </p>
                    <p className="text-base font-medium text-neutral-900">
                        {formatDate(offer.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Δωρεάν δοκιμαστική μέχρι την έναρξη
                    </p>
                </div>
            </div>
        </div>
    );
}

function Section({
    title,
    intro,
    children,
}: {
    title: string;
    intro?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
                    {title}
                </h2>
                {intro && (
                    <p className="mt-2 text-neutral-600 max-w-2xl">{intro}</p>
                )}
            </div>
            {children}
        </section>
    );
}

function CostTable({
    offer,
    hasEquipment,
    hasPresence,
}: {
    offer: Offer;
    hasEquipment: boolean;
    hasPresence: boolean;
}) {
    const t = calculateOfferTotals(offer);
    const G = grammar(offer);

    return (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left font-medium px-5 py-3">Υπηρεσία</th>
                        <th className="text-right font-medium px-3 py-3 hidden sm:table-cell">Μονάδα</th>
                        <th className="text-right font-medium px-3 py-3 hidden sm:table-cell">Τιμή</th>
                        <th className="text-right font-medium px-5 py-3">Σύνολο</th>
                    </tr>
                </thead>
                <tbody>
                    <CostRow
                        label="Πλατφόρμα OpenCouncil"
                        qty={`${t.months} μήνες`}
                        rate={`${formatCurrency(offer.platformPrice)}/μήνα`}
                        amount={formatCurrency(t.platformTotal)}
                    />
                    <CostRow
                        label="Ψηφιοποίηση συνεδριάσεων"
                        qty={`${offer.hoursToIngest} ώρες`}
                        rate={`${formatCurrency(offer.ingestionPerHourPrice)}/ώρα`}
                        amount={formatCurrency(t.ingestionTotal)}
                    />
                    {hasEquipment && (
                        <CostRow
                            label={offer.equipmentRentalName || "Παροχή εξοπλισμού"}
                            qty={`${t.months} μήνες`}
                            rate={`${formatCurrency(offer.equipmentRentalPrice || 0)}/μήνα`}
                            amount={formatCurrency(t.equipmentRentalTotal)}
                        />
                    )}
                    {hasPresence && (
                        <CostRow
                            label="Φυσική παρουσία σε συνεδριάσεις"
                            qty={`${offer.physicalPresenceHours} ώρες`}
                            rate={`${formatCurrency(PHYSICAL_PRESENCE.pricePerHour)}/ώρα`}
                            amount={formatCurrency(t.physicalPresenceTotal)}
                        />
                    )}
                    {offer.correctnessGuarantee && t.hoursToGuarantee > 0 && (
                        <CostRow
                            label="Έλεγχος απομαγνητοφωνήσεων από άνθρωπο"
                            qty={
                                offer.version && offer.version > 1
                                    ? `${t.hoursToGuarantee} ώρες`
                                    : `${t.hoursToGuarantee} συνεδριάσεις`
                            }
                            rate={
                                offer.version && offer.version > 1
                                    ? `${formatCurrency(offer.version === 2 ? 20 : 11)}/ώρα`
                                    : `${formatCurrency(80)}/συνεδρίαση`
                            }
                            amount={formatCurrency(t.correctnessGuaranteeCost)}
                        />
                    )}
                    <CostRow
                        label="Πιλοτικές λειτουργίες"
                        qty="∞"
                        rate="δωρεάν"
                        amount="—"
                        muted
                    />

                    {/* Subtotal */}
                    <tr className="border-t border-neutral-200">
                        <td className="px-5 py-3 text-right text-neutral-600" colSpan={3}>
                            Μερικό σύνολο
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                            {formatCurrency(t.subtotal)}
                        </td>
                    </tr>

                    {t.discount > 0 && (
                        <tr>
                            <td className="px-5 py-3 text-right text-blue-600" colSpan={3}>
                                Έκπτωση για {G.accusative} {offer.recipientName}{" "}
                                ({offer.discountPercentage}%)
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-blue-600">
                                −{formatCurrency(t.discount)}
                            </td>
                        </tr>
                    )}

                    {/* Total */}
                    <tr className="border-t-2 border-neutral-900 bg-neutral-50">
                        <td className="px-5 py-4 text-right font-semibold text-neutral-900" colSpan={3}>
                            Σύνολο
                        </td>
                        <td className="px-5 py-4 text-right text-xl font-bold text-neutral-900">
                            {formatCurrency(t.total)}
                        </td>
                    </tr>
                </tbody>
            </table>
            <p className="px-5 py-3 text-xs text-muted-foreground italic border-t border-neutral-200">
                Οι τιμές δεν περιλαμβάνουν ΦΠΑ.
            </p>
        </div>
    );
}

function CostRow({
    label,
    qty,
    rate,
    amount,
    muted,
}: {
    label: string;
    qty: string;
    rate: string;
    amount: string;
    muted?: boolean;
}) {
    const txt = muted ? "text-neutral-400" : "text-neutral-700";
    return (
        <tr className="border-t border-neutral-100">
            <td className={`px-5 py-3 ${muted ? "text-neutral-500" : "text-neutral-900"}`}>
                {label}
                <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                    {qty} · {rate}
                </div>
            </td>
            <td className={`px-3 py-3 text-right hidden sm:table-cell ${txt}`}>{qty}</td>
            <td className={`px-3 py-3 text-right hidden sm:table-cell ${txt}`}>{rate}</td>
            <td className={`px-5 py-3 text-right font-medium ${muted ? "text-neutral-500" : "text-neutral-900"}`}>
                {amount}
            </td>
        </tr>
    );
}

function PaymentPlan({ offer }: { offer: Offer }) {
    const t = calculateOfferTotals(offer);
    return (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left font-medium px-5 py-3">Ημερομηνία</th>
                        <th className="text-right font-medium px-5 py-3">Ποσό</th>
                    </tr>
                </thead>
                <tbody>
                    {t.paymentPlan.map((p, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                            <td className="px-5 py-3 inline-flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-neutral-400" />
                                {formatDate(p.dueDate)}
                            </td>
                            <td className="px-5 py-3 text-right font-medium">
                                {formatCurrency(p.amount)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function FeatureCard({
    icon,
    title,
    restriction,
    items,
}: {
    icon: React.ReactNode;
    title: string;
    restriction: string;
    items: React.ReactNode[];
}) {
    return (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 flex flex-col">
            <div className="flex items-center gap-2 text-neutral-900">
                <span className="text-blue-600">{icon}</span>
                <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{restriction}</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                {items.map((it, i) => (
                    <li key={i} className="flex gap-2">
                        <span className="text-blue-500 mt-1.5 leading-none">·</span>
                        <span>{it}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ExtraCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 flex gap-4">
            <span className="text-blue-600 mt-0.5">{icon}</span>
            <div>
                <h4 className="font-semibold text-neutral-900">{title}</h4>
                <p className="text-sm text-neutral-600 mt-1">{description}</p>
            </div>
        </div>
    );
}

function PilotCard({
    icon,
    title,
    description,
    limit,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    limit: string;
}) {
    return (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <span className="text-blue-600 inline-flex">{icon}</span>
            <h4 className="font-semibold text-neutral-900 mt-2">{title}</h4>
            <p className="text-sm text-neutral-600 mt-1">{description}</p>
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-neutral-100">
                {limit}
            </p>
        </div>
    );
}

function Perk({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">{icon}</span>
            <span>{children}</span>
        </div>
    );
}

function CTABox({ offer }: { offer: Offer }) {
    return (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-6 sm:p-8 text-center space-y-3">
            <h3 className="text-lg font-semibold text-neutral-900">
                Για να απαντήσετε σε αυτή τη προσφορά
            </h3>
            <p className="text-neutral-700">
                Στείλτε email στο{" "}
                <a href={`mailto:${offer.respondToEmail}`} className="text-blue-700 font-medium underline decoration-blue-200 underline-offset-2">
                    {offer.respondToEmail}
                </a>{" "}
                ή καλέστε στο{" "}
                <a href={`tel:${offer.respondToPhone}`} className="text-blue-700 font-medium underline decoration-blue-200 underline-offset-2">
                    {offer.respondToPhone}
                </a>
                .
            </p>
        </div>
    );
}

function CopyLinkButton({ offer }: { offer: Offer }) {
    const [copied, setCopied] = useState(false);
    const handleClick = async () => {
        const url = `${window.location.origin}/offer-letter/${offer.id}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };
    return (
        <Button variant="outline" onClick={handleClick}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Αντιγράφηκε" : "Αντιγραφή link"}
        </Button>
    );
}

