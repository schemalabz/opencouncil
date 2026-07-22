/**
 * Client-side PDF generation for offer letters using @react-pdf/renderer.
 *
 * A tight two-page document: cover + costs on page 1, features + signature on
 * page 2. Vector QR code links back to the live offer page.
 *
 * Fonts, colors, Greek typography, the QR code and lucide icons come from
 * the shared PDF primitives in @/components/pdf/shared (see the react-pdf
 * lineHeight gotcha documented there).
 *
 * Renders both in the browser (lazy-loaded by DownloadPdfButton) and in Node
 * (scripts/tests via renderToFile) — asset URLs resolve accordingly.
 */
import { Document, Page, View, Text, Image, Link } from "@react-pdf/renderer";
import type { Offer } from "@prisma/client";
import {
    offerGrammar,
    offerHasEquipment,
    offerHasPhysicalPresence,
    getOfferCostBreakdown,
} from "@/lib/offers/display";
import { ASSET_BASE, Brand, C, greekUpper, LucideIcon, QRCode } from "@/components/pdf/shared";

const MARGIN_X = 48;

// ─── Formatting ─────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
    new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
    }).format(n);

const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long", year: "numeric" }).format(d);

// ─── Text styles (fontSize + lineHeight always paired) ──────────────────────
const T = {
    micro: { fontSize: 6.5, color: C.light, letterSpacing: 0.8 },
    small: { fontSize: 8, color: C.mid, lineHeight: 1.4 },
    body: { fontSize: 9, color: C.body, lineHeight: 1.5 },
    para: { fontSize: 9.5, color: C.mid, lineHeight: 1.55 },
    h2: { fontSize: 13, fontWeight: 600 as const, color: C.ink },
    h3: { fontSize: 9.5, fontWeight: 600 as const, color: C.ink },
} as const;

const pageStyle = {
    backgroundColor: "#ffffff",
    color: C.body,
    fontFamily: "Inter",
    fontSize: 9,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: MARGIN_X,
    display: "flex" as const,
    flexDirection: "column" as const,
};

// ─── Shared blocks ──────────────────────────────────────────────────────────
function MicroLabel({ children }: { children: string }) {
    return <Text style={{ ...T.micro, marginBottom: 4 }}>{greekUpper(children)}</Text>;
}

function PageFooter({ offerUrl }: { offerUrl: string }) {
    return (
        <View
            fixed
            style={{
                position: "absolute",
                bottom: 26,
                left: MARGIN_X,
                right: MARGIN_X,
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 0.5,
                borderTopColor: C.line,
                paddingTop: 8,
            }}
        >
            <Text style={{ fontSize: 7, color: C.light }}>
                OpenCouncil · {offerUrl.replace(/^https?:\/\//, "")}
            </Text>
            <Text
                style={{ fontSize: 7, color: C.light }}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            />
        </View>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <View style={{ flexDirection: "row", marginBottom: 3.5 }}>
            <Text style={{ width: 10, fontSize: 8.5, color: C.accent }}>·</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: C.body, lineHeight: 1.45 }}>
                {children}
            </Text>
        </View>
    );
}

// Table row: 4 columns (label stretches, others fixed-ish right-aligned)
function CostHeaderRow() {
    const th = { fontSize: 6.5, color: C.light, letterSpacing: 0.8 } as const;
    return (
        <View
            style={{
                flexDirection: "row",
                paddingBottom: 5,
                borderBottomWidth: 1,
                borderBottomColor: C.ink,
            }}
        >
            <Text style={{ ...th, flex: 3 }}>{greekUpper("Υπηρεσία")}</Text>
            <Text style={{ ...th, flex: 1.1, textAlign: "right" }}>{greekUpper("Μονάδα")}</Text>
            <Text style={{ ...th, flex: 1.3, textAlign: "right" }}>{greekUpper("Τιμή")}</Text>
            <Text style={{ ...th, flex: 1.3, textAlign: "right" }}>{greekUpper("Σύνολο")}</Text>
        </View>
    );
}

function CostRow({
    label,
    qty,
    rate,
    total,
    variant = "normal",
}: {
    label: string;
    qty?: string;
    rate?: string;
    total: string;
    variant?: "normal" | "subtotal" | "discount" | "total";
}) {
    const isTotal = variant === "total";
    const labelStyle = {
        flex: 3,
        fontSize: 9,
        lineHeight: 1.35,
        color: variant === "discount" ? C.accent : isTotal ? C.ink : C.body,
        fontWeight: (isTotal || variant === "subtotal" ? 600 : 400) as 400 | 600,
    };
    const numStyle = {
        fontSize: isTotal ? 10.5 : 9,
        color: variant === "discount" ? C.accent : isTotal ? C.ink : C.body,
        fontWeight: (isTotal || variant === "subtotal" ? 600 : 400) as 400 | 600,
    };
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: isTotal ? 7 : 5.5,
                borderTopWidth: isTotal ? 1.2 : 0.5,
                borderTopColor: isTotal ? C.ink : C.line,
                backgroundColor: isTotal ? C.surface : undefined,
            }}
        >
            <Text style={labelStyle}>{label}</Text>
            <Text style={{ flex: 1.1, textAlign: "right", fontSize: 8, color: C.mid }}>
                {qty ?? ""}
            </Text>
            <Text style={{ flex: 1.3, textAlign: "right", fontSize: 8, color: C.mid }}>
                {rate ?? ""}
            </Text>
            <Text style={{ ...numStyle, flex: 1.3, textAlign: "right" }}>{total}</Text>
        </View>
    );
}

// ─── Document ───────────────────────────────────────────────────────────────
export function OfferPdfDocument({
    offer,
    baseUrl,
}: {
    offer: Offer;
    baseUrl: string;
}) {
    const breakdown = getOfferCostBreakdown(offer);
    const totals = breakdown.totals;
    const G = offerGrammar(offer);
    const offerUrl = `${baseUrl.replace(/\/$/, "")}/offer-letter/${offer.id}`;

    const hasEquipment = offerHasEquipment(offer);
    const hasPresence = offerHasPhysicalPresence(offer);

    return (
        <Document
            title={`Οικονομική Προσφορά · ${offer.recipientName}`}
            author="OpenCouncil"
            subject="Οικονομική Προσφορά"
        >
            {/* ════════ Page 1 — cover + costs ════════ */}
            <Page size="A4" style={pageStyle}>
                <Brand />

                {/* Title block */}
                <View style={{ marginTop: 28 }}>
                    <Text style={{ fontSize: 9, color: C.mid, lineHeight: 1.4 }}>
                        Ενημέρωση για οικονομική προσφορά για {G.articleAcc}
                    </Text>
                    <Text
                        style={{
                            fontSize: 22,
                            lineHeight: 1.25,
                            color: C.accent,
                            marginTop: 2,
                        }}
                    >
                        {offer.recipientName}
                    </Text>
                    <Text style={{ ...T.micro, marginTop: 8 }}>
                        {greekUpper(fmtDate(offer.createdAt))}
                    </Text>
                    <Text style={{ ...T.para, marginTop: 10, maxWidth: 400 }}>
                        Για την πλατφόρμα OpenCouncil και τη ψηφιοποίηση των δημόσιων
                        συνεδριάσεων των συλλογικών οργάνων {G.possessive}.
                    </Text>
                </View>

                {/* Hero summary */}
                <View
                    style={{
                        marginTop: 20,
                        borderWidth: 1,
                        borderColor: C.line,
                        borderRadius: 6,
                        flexDirection: "row",
                    }}
                >
                    <View style={{ flex: 1, padding: 14 }}>
                        <MicroLabel>Συνολικό κόστος</MicroLabel>
                        <Text style={{ fontSize: 17, lineHeight: 1.3, fontWeight: 600, color: C.ink }}>
                            {fmtEur(totals.total)}
                        </Text>
                        <Text style={{ ...T.small, marginTop: 1 }}>πλέον ΦΠΑ 24%</Text>
                    </View>
                    <View
                        style={{
                            flex: 1,
                            padding: 14,
                            borderLeftWidth: 1,
                            borderLeftColor: C.line,
                        }}
                    >
                        <MicroLabel>Διάρκεια</MicroLabel>
                        <Text style={{ fontSize: 17, lineHeight: 1.3, fontWeight: 600, color: C.ink }}>
                            {totals.months} μήνες
                        </Text>
                        <Text style={{ ...T.small, marginTop: 1 }}>
                            {fmtDate(offer.startDate)} — {fmtDate(offer.endDate)}
                        </Text>
                    </View>
                </View>

                {/* Costs — line items come from the shared breakdown, same as the web page */}
                <View style={{ marginTop: 26 }}>
                    <Text style={{ ...T.h2, marginBottom: 10 }}>Κόστος</Text>
                    <CostHeaderRow />
                    {breakdown.lines.map((line) => (
                        <CostRow
                            key={line.key}
                            label={line.label}
                            qty={line.qty}
                            rate={line.rate}
                            total={line.amount}
                        />
                    ))}
                    <CostRow
                        label="Μερικό σύνολο"
                        variant="subtotal"
                        total={breakdown.subtotal}
                    />
                    {breakdown.discountAmount && (
                        <CostRow
                            label={breakdown.discountLabel!}
                            variant="discount"
                            // ASCII hyphen — keeps working even with subset fonts (no U+2212)
                            total={`-${breakdown.discountAmount}`}
                        />
                    )}
                    <CostRow label="Σύνολο" variant="total" total={breakdown.total} />
                    <Text style={{ ...T.micro, marginTop: 6, textAlign: "right" }}>
                        {greekUpper("Οι τιμές δεν περιλαμβάνουν ΦΠΑ")}
                    </Text>
                </View>

                {/* Payment plan */}
                <View style={{ marginTop: 22 }}>
                    <Text style={{ ...T.h2, marginBottom: 8 }}>Πλάνο πληρωμών</Text>
                    {totals.paymentPlan.map((p, i) => (
                        <View
                            key={i}
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                                paddingVertical: 5,
                                borderTopWidth: 0.5,
                                borderTopColor: C.line,
                            }}
                        >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <LucideIcon name="receipt" size={9} color={C.light} />
                                <Text style={{ fontSize: 9, color: C.body }}>
                                    {i + 1}η δόση · {fmtDate(p.dueDate)}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 9, color: C.ink, fontWeight: 500 }}>
                                {fmtEur(p.amount)}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Spacer pushes contact + QR to the bottom of the page */}
                <View style={{ flexGrow: 1 }} />

                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                        <MicroLabel>Επικοινωνία</MicroLabel>
                        <Text style={{ fontSize: 9.5, color: C.body }}>
                            {offer.respondToName}
                        </Text>
                        <Text style={{ ...T.small, marginTop: 1 }}>
                            {offer.respondToEmail} · {offer.respondToPhone}
                        </Text>
                    </View>
                    <View style={{ width: 84, alignItems: "center" }}>
                        <View
                            style={{
                                padding: 4,
                                borderWidth: 1,
                                borderColor: C.line,
                                borderRadius: 4,
                                backgroundColor: "#ffffff",
                            }}
                        >
                            <QRCode value={offerUrl} size={62} />
                        </View>
                        <Text style={{ ...T.micro, marginTop: 4, textAlign: "center" }}>
                            {greekUpper("Πιο πρόσφατη έκδοση")}
                        </Text>
                    </View>
                </View>

                <PageFooter offerUrl={offerUrl} />
            </Page>

            {/* ════════ Page 2 — what's included + signature ════════ */}
            <Page size="A4" style={pageStyle}>
                <Text style={{ ...T.h2, marginBottom: 6 }}>Τι περιλαμβάνει</Text>
                <Text style={{ ...T.para, marginBottom: 16, maxWidth: 440 }}>
                    Δύο βασικές υπηρεσίες: η ψηφιοποίηση δημόσιων συνεδριάσεων και η
                    ελεύθερη χρήση της πλατφόρμας OpenCouncil από {G.def} και τους{" "}
                    {G.demonym} {G.possessive}.
                </Text>

                {/* Two columns */}
                <View style={{ flexDirection: "row", gap: 20 }}>
                    <View style={{ flex: 1 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: 7,
                                marginBottom: 7,
                            }}
                        >
                            <LucideIcon name="fileText" size={16} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ ...T.h3, marginBottom: 2 }}>
                                    Ψηφιοποίηση συνεδριάσεων
                                </Text>
                                <Text style={T.micro}>
                                    {greekUpper(`Έως ${offer.hoursToIngest} ώρες συνεδριάσεων`)}
                                </Text>
                            </View>
                        </View>
                        <Bullet>Απομαγνητοφώνηση και αναγνώριση ομιλητών</Bullet>
                        <Bullet>Συνόψεις κάθε τοποθέτησης</Bullet>
                        <Bullet>Αναγνώριση θεμάτων και σύνδεση με την ημερήσια διάταξη</Bullet>
                        <Bullet>Μετατροπή σε MP4, MP3 και adaptive bitrate streaming</Bullet>
                        {offer.correctnessGuarantee ? (
                            <Bullet>Ανθρώπινος έλεγχος της απομαγνητοφώνησης εντός 36 ωρών</Bullet>
                        ) : (
                            <Bullet>Αυτόματη διαδικασία · διορθώσεις κατόπιν αιτήματος</Bullet>
                        )}
                        <Bullet>Ολοκλήρωση εντός 24 ωρών από τη διαθεσιμότητα του βίντεο</Bullet>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: 7,
                                marginBottom: 7,
                            }}
                        >
                            <LucideIcon name="building2" size={16} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ ...T.h3, marginBottom: 2 }}>
                                    Πλατφόρμα OpenCouncil
                                </Text>
                                <Text style={T.micro}>
                                    {greekUpper("Απεριόριστη χρήση για όλους")}
                                </Text>
                            </View>
                        </View>
                        <Bullet>
                            Σελίδα {G.possessive} στο opencouncil.gr/{offer.cityId}
                        </Bullet>
                        <Bullet>Πρόσβαση σε απομαγνητοφωνήσεις, θέματα και συνόψεις</Bullet>
                        <Bullet>Στατιστικά παρατάξεων, ομιλητών και θεμάτων</Bullet>
                        <Bullet>Ενημερώσεις {G.demonym} μέσω SMS, WhatsApp και Email</Bullet>
                        <Bullet>Εξαγωγή βίντεο για τα social media</Bullet>
                        <Bullet>Εξαγωγή απομαγνητοφωνήσεων σε PDF</Bullet>
                        <Bullet>Αναζήτηση σε θέματα και απομαγνητοφωνήσεις</Bullet>
                        <Bullet>Ανοιχτά δεδομένα μέσω API</Bullet>
                    </View>
                </View>

                {(hasEquipment || hasPresence) && (
                    <View style={{ marginTop: 18 }}>
                        <Text style={{ ...T.h3, marginBottom: 6 }}>Επιπλέον υπηρεσίες</Text>
                        {hasEquipment && (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    gap: 7,
                                    marginBottom: 6,
                                }}
                            >
                                <LucideIcon name="package" size={13} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 9, fontWeight: 500, color: C.ink }}>
                                        {offer.equipmentRentalName || "Παροχή εξοπλισμού"}
                                    </Text>
                                    {offer.equipmentRentalDescription && (
                                        <Text style={{ ...T.small, marginTop: 1 }}>
                                            {offer.equipmentRentalDescription}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}
                        {hasPresence && (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    gap: 7,
                                }}
                            >
                                <LucideIcon name="clock" size={13} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 9, fontWeight: 500, color: C.ink }}>
                                        Φυσική παρουσία σε συνεδριάσεις
                                    </Text>
                                    <Text style={{ ...T.small, marginTop: 1 }}>
                                        Εξειδικευμένο προσωπικό για τεχνική υποστήριξη της
                                        καταγραφής κατά τη διάρκεια των συνεδριάσεων.
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                <View style={{ marginTop: 18 }}>
                    <Text style={{ ...T.h3, marginBottom: 7 }}>Τεχνικές προδιαγραφές</Text>
                    <Bullet>Cloud στη Digital Ocean, με servers στην Ευρωπαϊκή Ένωση</Bullet>
                    <Bullet>Whisper (OpenAI) και PyAnnote για την απομαγνητοφώνηση</Bullet>
                    <Bullet>Claude (Anthropic) για συνόψεις και εξαγωγή θεμάτων</Bullet>
                    <Bullet>Adaptive bitrate streaming μέσω mux.com, έως 720p</Bullet>
                    <Bullet>Διαθέσιμη σε όλους τους σύγχρονους περιηγητές</Bullet>
                    <Bullet>
                        Πολιτική απορρήτου: opencouncil.gr/privacy · Όροι χρήσης:
                        opencouncil.gr/terms
                    </Bullet>
                </View>

                {/* Spacer pushes CTA + signature to the bottom */}
                <View style={{ flexGrow: 1 }} />

                {/* CTA + about QR */}
                <View
                    style={{
                        backgroundColor: C.accentSoft,
                        padding: 13,
                        borderRadius: 6,
                        marginBottom: 18,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={{ ...T.h3, marginBottom: 3 }}>
                            Για να απαντήσετε σε αυτή τη προσφορά
                        </Text>
                        <Text style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                            Στείλτε email στο{" "}
                            <Link src={`mailto:${offer.respondToEmail}`} style={{ color: C.body }}>
                                {offer.respondToEmail}
                            </Link>{" "}
                            ή καλέστε στο{" "}
                            <Link src={`tel:${offer.respondToPhone}`} style={{ color: C.body }}>
                                {offer.respondToPhone}
                            </Link>
                            .
                        </Text>
                    </View>
                    <View style={{ width: 84, alignItems: "center" }}>
                        <View
                            style={{
                                padding: 4,
                                borderWidth: 1,
                                borderColor: C.line,
                                borderRadius: 4,
                                backgroundColor: "#ffffff",
                            }}
                        >
                            <QRCode value={`${baseUrl.replace(/\/$/, "")}/about`} size={52} />
                        </View>
                        <Text
                            style={{
                                ...T.micro,
                                marginTop: 4,
                                textAlign: "center",
                                maxWidth: 84,
                            }}
                        >
                            {greekUpper("Μάθετε περισσότερα για το OpenCouncil")}
                        </Text>
                    </View>
                </View>

                {/* Company + signature */}
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                        <MicroLabel>Στοιχεία εταιρείας</MicroLabel>
                        <Text style={{ fontSize: 9, color: C.body }}>
                            OpenCouncil Μονοπρόσωπη Ι.Κ.Ε.
                        </Text>
                        <Text style={T.small}>Λαλέχου 1, Νέο Ψυχικό 15451</Text>
                        <Text style={T.small}>
                            ΑΦΜ 802666391 (ΚΕΦΟΔΕ Αττικής) · ΓΕΜΗ 180529301000
                        </Text>
                        <Text style={{ ...T.small, marginTop: 3 }}>
                            Η OpenCouncil ανήκει στην Schema Labs ΑΜΚΕ (schemalabs.gr).
                        </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ ...T.small, marginBottom: 12 }}>
                            Με εκτίμηση, εκ μέρους της OpenCouncil,
                        </Text>
                        <Text style={{ fontSize: 10, color: C.ink }}>
                            {offer.respondToName}
                        </Text>
                        <Text style={T.small}>{offer.respondToEmail}</Text>
                        <Text style={T.small}>{offer.respondToPhone}</Text>
                    </View>
                </View>

                <PageFooter offerUrl={offerUrl} />
            </Page>
        </Document>
    );
}
