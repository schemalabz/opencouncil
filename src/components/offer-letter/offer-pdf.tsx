/**
 * Client-side PDF generation for offer letters using @react-pdf/renderer.
 *
 * Generates a vector PDF (crisp at any zoom, searchable, copyable text) with
 * explicit page break boundaries, embedded Inter font (Greek subset), and an
 * inline-SVG QR code linking back to the live offer page.
 *
 * Trigger via `pdf(<OfferPdfDocument offer={offer} />).toBlob()` from a browser
 * context — never imported into a server bundle.
 */
import {
    Document,
    Page,
    View,
    Text,
    Image,
    Svg,
    Path,
    Link,
    Font,
} from "@react-pdf/renderer";
import qrcode from "qrcode-generator";
import type { Offer } from "@prisma/client";
import { calculateOfferTotals, PHYSICAL_PRESENCE } from "@/lib/pricing";

// ─── Font registration ──────────────────────────────────────────────────────
// Inter (Greek subset) served from our own /public/fonts/pdf/ — same font
// family as the rest of the app, no third-party CDN dependency at PDF time.
const FONT_BASE =
    typeof window !== "undefined" ? `${window.location.origin}/fonts/pdf` : "/fonts/pdf";
Font.register({
    family: "Inter",
    fonts: [
        { src: `${FONT_BASE}/inter-greek-400-normal.woff` },
        { src: `${FONT_BASE}/inter-greek-500-normal.woff`, fontWeight: 500 },
        { src: `${FONT_BASE}/inter-greek-600-normal.woff`, fontWeight: 600 },
        { src: `${FONT_BASE}/inter-greek-700-normal.woff`, fontWeight: 700 },
    ],
});
// Greek shouldn't be hyphenated mid-word.
Font.registerHyphenationCallback((word) => [word]);

// ─── Greek typography helpers ───────────────────────────────────────────────
// Greek convention: ALL CAPS drops the tonos (acute accent). e.g.
// "Φεβρουαρίου" → "ΦΕΒΡΟΥΑΡΙΟΥ" (not "ΦΕΒΡΟΥΑΡΊΟΥ"). textTransform:uppercase
// would keep the accent, so we transform manually.
function greekUpper(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .normalize("NFC")
        .toUpperCase();
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
    ink: "#0a0a0a",
    body: "#262626",
    mid: "#525252",
    light: "#a3a3a3",
    line: "#e5e5e5",
    surface: "#fafafa",
    // Brand orange (matches --orange in globals.css: hsl(24 100% 50%))
    accent: "#ff8000",
    accentSoft: "#fff4eb",
};


const A4 = { w: 595.28, h: 841.89 };
const PAGE_MARGIN = { top: 44, bottom: 44, x: 48 };

// Logo aspect ratio (1606×1354 px → ~1.186:1)
const LOGO_W = 22;
const LOGO_H = (LOGO_W * 1354) / 1606;

// ─── Greek grammar fudge for region vs municipality ─────────────────────────
function genderArticle(offer: Offer): { articleAcc: string; def: string; possessive: string; demonym: string; bodyAdj: string } {
    const isRegion = offer.recipientName.startsWith("Περιφέρεια");
    return isRegion
        ? { articleAcc: "την", def: "την περιφέρεια", possessive: "της περιφέρειας", demonym: "πολίτες", bodyAdj: "περιφερειακό" }
        : { articleAcc: "τον", def: "τον δήμο", possessive: "του δήμου", demonym: "δημότες", bodyAdj: "δημοτικό" };
}

// ─── Formatting helpers (local, locale-aware, no Intl in PDF context issues) ─
const fmtEur = (n: number) =>
    new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Math.round(n));

const fmtEurExact = (n: number) =>
    new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
    }).format(n);

const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long", year: "numeric" }).format(d);

// ─── QR via qrcode-generator → inline <Svg> (vector, perfect scaling) ───────
function QRCode({ value, size, color = C.ink }: { value: string; size: number; color?: string }) {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
        }
    }
    return (
        <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
            <Path d={d} fill={color} />
        </Svg>
    );
}

// ─── Building blocks ────────────────────────────────────────────────────────
const styles = {
    page: {
        backgroundColor: "#ffffff",
        color: C.body,
        fontFamily: "Inter",
        fontSize: 9,
        lineHeight: 1.45,
        paddingTop: PAGE_MARGIN.top,
        paddingBottom: PAGE_MARGIN.bottom,
        paddingHorizontal: PAGE_MARGIN.x,
    },
    h1: { fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.15 },
    h2: { fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 8 },
    h3: { fontSize: 10, fontWeight: 600, color: C.ink, marginBottom: 4 },
    small: { fontSize: 7.5, color: C.mid },
    micro: { fontSize: 7, color: C.light },
    mid: { color: C.mid },
    rule: { height: 1, backgroundColor: C.line, marginVertical: 10 },
} as const;

function PageFooter({ offerUrl, pageLabel }: { offerUrl: string; pageLabel?: string }) {
    return (
        <View
            fixed
            style={{
                position: "absolute",
                bottom: 18,
                left: PAGE_MARGIN.x,
                right: PAGE_MARGIN.x,
                flexDirection: "row",
                justifyContent: "space-between",
                fontSize: 7,
                color: C.light,
            }}
        >
            <Text>OpenCouncil · {offerUrl.replace(/^https?:\/\//, "")}</Text>
            <Text
                render={({ pageNumber, totalPages }) =>
                    pageLabel ?? `${pageNumber} / ${totalPages}`
                }
            />
        </View>
    );
}

// Cost table row
function Row({
    label,
    qty,
    rate,
    total,
    emphasize,
    isTotal,
    isDiscount,
}: {
    label: string;
    qty?: string;
    rate?: string;
    total: string;
    emphasize?: boolean;
    isTotal?: boolean;
    isDiscount?: boolean;
}) {
    const weight = isTotal ? 700 : emphasize ? 600 : 400;
    const color = isTotal ? C.ink : isDiscount ? C.accent : C.body;
    return (
        <View
            style={{
                flexDirection: "row",
                paddingVertical: 5,
                borderTopWidth: isTotal ? 1.2 : 0.5,
                borderTopColor: isTotal ? C.ink : C.line,
            }}
        >
            <Text style={{ flex: 3, fontWeight: weight, color, fontSize: 9 }}>{label}</Text>
            <Text style={{ flex: 1, textAlign: "right", color: C.mid, fontSize: 8 }}>
                {qty ?? ""}
            </Text>
            <Text style={{ flex: 1, textAlign: "right", color: C.mid, fontSize: 8 }}>
                {rate ?? ""}
            </Text>
            <Text style={{ flex: 1.1, textAlign: "right", fontWeight: weight, color, fontSize: 9 }}>
                {total}
            </Text>
        </View>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <View style={{ flexDirection: "row", marginBottom: 3 }}>
            <Text style={{ width: 10, color: C.light, fontSize: 9 }}>·</Text>
            <Text style={{ flex: 1, fontSize: 9 }}>{children}</Text>
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
    const totals = calculateOfferTotals(offer);
    const G = genderArticle(offer);
    const offerUrl = `${baseUrl.replace(/\/$/, "")}/offer-letter/${offer.id}`;

    const hasEquipment =
        !!(offer.equipmentRentalName || offer.equipmentRentalDescription);
    const hasPresence =
        !!(offer.physicalPresenceHours && offer.physicalPresenceHours > 0);

    return (
        <Document
            title={`Οικονομική Προσφορά · ${offer.recipientName}`}
            author="OpenCouncil"
            subject="Οικονομική Προσφορά"
        >
            {/* ─── Cover ──────────────────────────────────────────────── */}
            <Page size="A4" style={styles.page}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 36,
                    }}
                >
                    <Image src="/logo.png" style={{ width: LOGO_W, height: LOGO_H }} />
                    <Text style={{ fontSize: 11, color: C.ink }}>OpenCouncil</Text>
                </View>

                <Text style={{ fontSize: 8.5, color: C.mid, marginBottom: 4 }}>
                    Ενημέρωση για οικονομική προσφορά για {G.articleAcc}
                </Text>
                <Text
                    style={{
                        fontSize: 24,
                        color: C.accent,
                        marginBottom: 4,
                        lineHeight: 1.1,
                    }}
                >
                    {offer.recipientName}
                </Text>
                <Text style={{ ...styles.micro, letterSpacing: 0.6, marginBottom: 14 }}>
                    {greekUpper(fmtDate(offer.createdAt))}
                </Text>
                <Text style={{ color: C.mid, fontSize: 10, marginBottom: 24, lineHeight: 1.5 }}>
                    Για την πλατφόρμα OpenCouncil και τη ψηφιοποίηση των δημόσιων
                    συνεδριάσεων των συλλογικών οργάνων {G.possessive}.
                </Text>

                {/* Hero summary — 2 cols */}
                <View
                    style={{
                        borderWidth: 1,
                        borderColor: C.line,
                        borderRadius: 6,
                        flexDirection: "row",
                    }}
                >
                    <View style={{ flex: 1, padding: 14 }}>
                        <Text style={{ ...styles.micro, letterSpacing: 0.6, marginBottom: 4 }}>
                            {greekUpper("Συνολικό κόστος")}
                        </Text>
                        <Text style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>
                            {fmtEurExact(totals.total)}
                        </Text>
                        <Text style={{ ...styles.small, marginTop: 2 }}>
                            πλέον ΦΠΑ 24%
                        </Text>
                    </View>
                    <View
                        style={{
                            flex: 1,
                            padding: 14,
                            borderLeftWidth: 1,
                            borderLeftColor: C.line,
                        }}
                    >
                        <Text style={{ ...styles.micro, letterSpacing: 0.6, marginBottom: 4 }}>
                            {greekUpper("Διάρκεια")}
                        </Text>
                        <Text style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>
                            {totals.months} μήνες
                        </Text>
                        <Text style={{ ...styles.small, marginTop: 2 }}>
                            {fmtDate(offer.startDate)} — {fmtDate(offer.endDate)}
                        </Text>
                    </View>
                </View>

                {/* QR + meta */}
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        marginTop: 36,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={{ ...styles.micro, letterSpacing: 0.6, marginBottom: 4 }}>
                            {greekUpper("Επικοινωνία")}
                        </Text>
                        <Text style={{ color: C.body, fontSize: 9.5 }}>{offer.respondToName}</Text>
                        <Text style={{ color: C.mid, fontSize: 8.5 }}>
                            {offer.respondToEmail} · {offer.respondToPhone}
                        </Text>
                    </View>
                    <View style={{ width: 90, alignItems: "center" }}>
                        <View
                            style={{
                                padding: 4,
                                backgroundColor: "#ffffff",
                                borderWidth: 1,
                                borderColor: C.line,
                                borderRadius: 4,
                            }}
                        >
                            <QRCode value={offerUrl} size={72} />
                        </View>
                        <Text
                            style={{
                                ...styles.micro,
                                marginTop: 4,
                                textAlign: "center",
                            }}
                        >
                            Πιο πρόσφατη έκδοση
                        </Text>
                    </View>
                </View>

                <PageFooter offerUrl={offerUrl} />
            </Page>

            {/* ─── Cost + payment plan ────────────────────────────────── */}
            <Page size="A4" style={styles.page}>
                <Text style={{ ...styles.h2, marginBottom: 16 }}>Κόστος</Text>

                {/* Column headers */}
                <View
                    style={{
                        flexDirection: "row",
                        paddingBottom: 6,
                        borderBottomWidth: 1,
                        borderBottomColor: C.ink,
                    }}
                >
                    <Text style={{ flex: 3, fontSize: 7, color: C.mid, letterSpacing: 0.6 }}>
                        {greekUpper("Υπηρεσία")}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 7, color: C.mid, letterSpacing: 0.6, textAlign: "right" }}>
                        {greekUpper("Μονάδα")}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 7, color: C.mid, letterSpacing: 0.6, textAlign: "right" }}>
                        {greekUpper("Τιμή")}
                    </Text>
                    <Text style={{ flex: 1.1, fontSize: 7, color: C.mid, letterSpacing: 0.6, textAlign: "right" }}>
                        {greekUpper("Σύνολο")}
                    </Text>
                </View>

                <Row
                    label="Πλατφόρμα OpenCouncil"
                    qty={`${totals.months} μήνες`}
                    rate={`${fmtEurExact(offer.platformPrice)}/μήνα`}
                    total={fmtEurExact(totals.platformTotal)}
                />
                <Row
                    label="Ψηφιοποίηση συνεδριάσεων"
                    qty={`${offer.hoursToIngest} ώρες`}
                    rate={`${fmtEurExact(offer.ingestionPerHourPrice)}/ώρα`}
                    total={fmtEurExact(totals.ingestionTotal)}
                />
                {hasEquipment && (
                    <Row
                        label={offer.equipmentRentalName || "Παροχή εξοπλισμού"}
                        qty={`${totals.months} μήνες`}
                        rate={`${fmtEurExact(offer.equipmentRentalPrice || 0)}/μήνα`}
                        total={fmtEurExact(totals.equipmentRentalTotal)}
                    />
                )}
                {hasPresence && (
                    <Row
                        label="Φυσική παρουσία σε συνεδριάσεις"
                        qty={`${offer.physicalPresenceHours} ώρες`}
                        rate={`${fmtEurExact(PHYSICAL_PRESENCE.pricePerHour)}/ώρα`}
                        total={fmtEurExact(totals.physicalPresenceTotal)}
                    />
                )}
                {offer.correctnessGuarantee && totals.hoursToGuarantee > 0 && (
                    <Row
                        label="Έλεγχος απομαγνητοφωνήσεων από άνθρωπο"
                        qty={
                            offer.version && offer.version > 1
                                ? `${totals.hoursToGuarantee} ώρες`
                                : `${totals.hoursToGuarantee} συνεδριάσεις`
                        }
                        rate={
                            offer.version && offer.version > 1
                                ? `${fmtEurExact(offer.version === 2 ? 20 : 11)}/ώρα`
                                : `${fmtEurExact(80)}/συνεδρίαση`
                        }
                        total={fmtEurExact(totals.correctnessGuaranteeCost)}
                    />
                )}
                <Row label="Μερικό Σύνολο" emphasize total={fmtEurExact(totals.subtotal)} />
                {totals.discount > 0 && (
                    <Row
                        label={`Έκπτωση (${offer.discountPercentage}%)`}
                        isDiscount
                        total={`−${fmtEurExact(totals.discount)}`}
                    />
                )}
                <Row label="Σύνολο (χωρίς ΦΠΑ)" isTotal total={fmtEurExact(totals.total)} />

                <Text style={{ ...styles.small, marginTop: 6, textAlign: "right" }}>
                    Οι τιμές δεν περιλαμβάνουν ΦΠΑ.
                </Text>

                {/* Payment plan */}
                <View style={{ marginTop: 36 }}>
                    <Text style={styles.h2}>Πλάνο πληρωμών</Text>
                    <View
                        style={{
                            flexDirection: "row",
                            paddingBottom: 6,
                            borderBottomWidth: 1,
                            borderBottomColor: C.ink,
                        }}
                    >
                        <Text style={{ flex: 1, fontSize: 7, color: C.mid, letterSpacing: 0.6 }}>
                            {greekUpper("Ημερομηνία")}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 7, color: C.mid, letterSpacing: 0.6, textAlign: "right" }}>
                            {greekUpper("Ποσό")}
                        </Text>
                    </View>
                    {totals.paymentPlan.map((p, i) => (
                        <View
                            key={i}
                            style={{
                                flexDirection: "row",
                                paddingVertical: 7,
                                borderTopWidth: 0.5,
                                borderTopColor: C.line,
                            }}
                        >
                            <Text style={{ flex: 1 }}>{fmtDate(p.dueDate)}</Text>
                            <Text style={{ flex: 1, textAlign: "right" }}>
                                {fmtEurExact(p.amount)}
                            </Text>
                        </View>
                    ))}
                </View>

                <PageFooter offerUrl={offerUrl} />
            </Page>

            {/* ─── What's included ────────────────────────────────────── */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.h2}>Τι περιλαμβάνει</Text>
                <Text style={{ marginBottom: 18, color: C.mid }}>
                    Δύο βασικές υπηρεσίες: η ψηφιοποίηση δημόσιων συνεδριάσεων και η
                    ελεύθερη χρήση της πλατφόρμας OpenCouncil από {G.def} και τους {G.demonym}{" "}
                    {G.possessive}.
                </Text>

                <View style={{ marginBottom: 22 }}>
                    <Text style={styles.h3}>Ψηφιοποίηση συνεδριάσεων</Text>
                    <Text style={{ ...styles.small, marginBottom: 8 }}>
                        Μέχρι {offer.hoursToIngest} ώρες δημόσιων συνεδριάσεων.
                    </Text>
                    <Bullet>Απομαγνητοφώνηση και αναγνώριση ομιλητών</Bullet>
                    <Bullet>Συνόψεις κάθε τοποθέτησης</Bullet>
                    <Bullet>Αναγνώριση θεμάτων και σύνδεση με την ημερήσια διάταξη</Bullet>
                    <Bullet>Μετατροπή σε MP4, MP3 και adaptive bitrate streaming</Bullet>
                    {offer.correctnessGuarantee ? (
                        <Bullet>
                            Ανθρώπινος έλεγχος της απομαγνητοφώνησης εντός 36 ωρών
                        </Bullet>
                    ) : (
                        <Bullet>
                            Αυτόματη διαδικασία· διορθώσεις κατόπιν αιτήματος (πολιτική
                            διορθώσεων)
                        </Bullet>
                    )}
                    <Bullet>Ολοκλήρωση εντός 24 ωρών από τη διαθεσιμότητα του βίντεο</Bullet>
                </View>

                <View>
                    <Text style={styles.h3}>Πλατφόρμα OpenCouncil</Text>
                    <Text style={{ ...styles.small, marginBottom: 8 }}>
                        Απεριόριστη χρήση για όλους.
                    </Text>
                    <Bullet>
                        Σελίδα {G.possessive} στο opencouncil.gr/{offer.cityId}
                    </Bullet>
                    <Bullet>Πρόσβαση σε απομαγνητοφωνήσεις, θέματα και συνόψεις</Bullet>
                    <Bullet>Στατιστικά παρατάξεων, ομιλητών και θεμάτων</Bullet>
                    <Bullet>Ενημερώσεις {G.demonym} μέσω SMS, WhatsApp και Email</Bullet>
                    <Bullet>Εξαγωγή βίντεο για τα social media</Bullet>
                    <Bullet>Εξαγωγή απομαγνητοφωνήσεων σε PDF</Bullet>
                    <Bullet>Σελίδες παρατάξεων και ομιλητών</Bullet>
                    <Bullet>Αναζήτηση σε θέματα και απομαγνητοφωνήσεις</Bullet>
                    <Bullet>Adaptive bitrate streaming, ανοιχτά δεδομένα (API)</Bullet>
                </View>

                {(hasEquipment || hasPresence) && (
                    <View style={{ marginTop: 22 }}>
                        <Text style={styles.h3}>Επιπλέον υπηρεσίες</Text>
                        {hasEquipment && (
                            <View style={{ marginBottom: 10 }}>
                                <Text style={{ fontWeight: 600, marginBottom: 2 }}>
                                    {offer.equipmentRentalName || "Παροχή εξοπλισμού"}
                                </Text>
                                {offer.equipmentRentalDescription && (
                                    <Text style={styles.mid}>{offer.equipmentRentalDescription}</Text>
                                )}
                            </View>
                        )}
                        {hasPresence && (
                            <View>
                                <Text style={{ fontWeight: 600, marginBottom: 2 }}>
                                    Φυσική παρουσία σε συνεδριάσεις
                                </Text>
                                <Text style={styles.mid}>
                                    Εξειδικευμένο προσωπικό για τεχνική υποστήριξη της
                                    καταγραφής κατά τη διάρκεια των συνεδριάσεων.
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <PageFooter offerUrl={offerUrl} />
            </Page>

            {/* ─── Pilot features + tech specs ────────────────────────── */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.h2}>Τεχνικές προδιαγραφές</Text>
                <Bullet>Cloud στη Digital Ocean (servers στην ΕΕ)</Bullet>
                <Bullet>Whisper (OpenAI) + PyAnnote για απομαγνητοφώνηση</Bullet>
                <Bullet>Claude (Anthropic) για συνόψεις και εξαγωγή θεμάτων</Bullet>
                <Bullet>Adaptive bitrate streaming μέσω mux.com έως 720p</Bullet>
                <Bullet>Διαθέσιμη σε όλους τους σύγχρονους περιηγητές</Bullet>
                <Bullet>
                    Πολιτική απορρήτου: opencouncil.gr/privacy · Όροι χρήσης:
                    opencouncil.gr/terms
                </Bullet>

                <PageFooter offerUrl={offerUrl} />
            </Page>

            {/* ─── Last page: signature, company, QR ──────────────────── */}
            <Page size="A4" style={styles.page}>
                <View
                    style={{
                        backgroundColor: C.accentSoft,
                        padding: 14,
                        borderRadius: 6,
                        marginBottom: 22,
                    }}
                >
                    <Text style={{ ...styles.h3, color: C.ink, marginBottom: 4 }}>
                        Για να απαντήσετε σε αυτή τη προσφορά
                    </Text>
                    <Text style={{ color: C.body, fontSize: 9 }}>
                        Στείλτε email στο{" "}
                        <Link src={`mailto:${offer.respondToEmail}`} style={{ color: C.body, textDecoration: "underline" }}>
                            {offer.respondToEmail}
                        </Link>
                        {" "}ή καλέστε στο{" "}
                        <Link src={`tel:${offer.respondToPhone}`} style={{ color: C.body, textDecoration: "underline" }}>
                            {offer.respondToPhone}
                        </Link>
                        .
                    </Text>
                </View>

                <Text style={styles.h3}>Στοιχεία εταιρείας</Text>
                <Text style={{ color: C.body, fontSize: 9 }}>
                    OpenCouncil Μονοπρόσωπη Ι.Κ.Ε.
                </Text>
                <Text style={{ color: C.mid, fontSize: 8 }}>
                    Λαλέχου 1, Νέο Ψυχικό 15451
                </Text>
                <Text style={{ color: C.mid, fontSize: 8 }}>
                    ΑΦΜ 802666391 (ΚΕΦΟΔΕ Αττικής) · ΓΕΜΗ 180529301000
                </Text>
                <Text style={{ color: C.mid, fontSize: 8, marginTop: 4 }}>
                    Η OpenCouncil ανήκει στην Schema Labs ΑΜΚΕ (schemalabs.gr).
                </Text>

                <View
                    style={{
                        marginTop: 42,
                        flexDirection: "row",
                        alignItems: "flex-end",
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mid, marginBottom: 10, fontSize: 9 }}>
                            Με εκτίμηση, εκ μέρους της OpenCouncil,
                        </Text>
                        <Text style={{ color: C.ink, fontSize: 10 }}>
                            {offer.respondToName}
                        </Text>
                        <Text style={{ color: C.mid, fontSize: 8 }}>
                            {offer.respondToEmail}
                        </Text>
                        <Text style={{ color: C.mid, fontSize: 8 }}>
                            {offer.respondToPhone}
                        </Text>
                    </View>
                    <View style={{ width: 90, alignItems: "center" }}>
                        <View
                            style={{
                                padding: 4,
                                backgroundColor: "#ffffff",
                                borderWidth: 1,
                                borderColor: C.line,
                                borderRadius: 4,
                            }}
                        >
                            <QRCode value={offerUrl} size={64} />
                        </View>
                        <Text style={{ ...styles.micro, marginTop: 4, textAlign: "center" }}>
                            Πιο πρόσφατη έκδοση
                        </Text>
                    </View>
                </View>

                <PageFooter offerUrl={offerUrl} />
            </Page>
        </Document>
    );
}
