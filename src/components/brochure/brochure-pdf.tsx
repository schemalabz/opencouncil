/**
 * Trifold A4 brochure for municipal councilors — client-side PDF via
 * @react-pdf/renderer, sharing the offer PDF's brand primitives.
 *
 * Two landscape A4 pages, each split in three 99mm panels (roll fold):
 *   Page 1 (outside): [flap that folds in | back cover | front cover]
 *   Page 2 (inside):  [Ανοιχτότητα | Αποδοτικότητα | Πώς δουλεύει]
 * Tiny fold ticks sit in the top/bottom margins as folding guides for
 * office-printed copies.
 *
 * Content mirrors the /about and /explain pages; live platform stats are
 * injected by the caller.
 */
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { ASSET_BASE, Brand, C, greekUpper, LucideIcon, QRCode } from "@/components/pdf/shared";
import type { ICON_PATHS } from "@/components/pdf/shared";

export interface BrochureCity {
    id: string;
    /** Nominative municipality name, e.g. "Δήμος Αργιθέας". */
    nameMunicipality: string;
    /** ΑΔΑΜ of the currently in-effect contract, if the city has one. */
    adam?: string;
}

export interface BrochureData {
    stats: {
        municipalityCount: number;
        subjectCount: number;
        meetingHours: number;
    };
    /** Origin for QR links, e.g. https://opencouncil.gr */
    baseUrl: string;
    contactEmail: string;
    contactPhone: string;
    /**
     * City variant: handed to councilors during a presentation at that
     * municipality. Names the city on the cover, points the QR codes to the
     * city's page, and swaps the sales framing for a feedback invitation.
     */
    city?: BrochureCity;
    /** Partner municipalities — PNG/JPEG logo URLs with names (no SVG). */
    partners: Array<{ name: string; logo: string }>;
}

// "Δήμος Αργιθέας" → "στον Δήμο Αργιθέας"
function municipalityAccusative(nameMunicipality: string): string {
    return nameMunicipality.replace(/^Δήμος /, "Δήμο ");
}

// A4 landscape: 841.89 × 595.28pt → three equal panels.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const PANEL_W = PAGE_W / 3;
const PANEL_PAD = 26;

const TEAM: Array<{ name: string; image: string }> = [
    { name: "Χρήστος Πορίος", image: "/people/christos.jpg" },
    { name: "Ανδρέας Κούλουμος", image: "/people/andreas.jpg" },
    { name: "Ελίζα Γκιμιτζούδη", image: "/people/eliza.jpeg" },
    { name: "Θάνος Παπαδογιάννης", image: "/people/thanos.png" },
    { name: "Βασιλική Κουμαρέλα", image: "/people/vasia.jpg" },
    { name: "Μυρτώ Πλεμμένου", image: "/people/myrto.jpg" },
    { name: "Αλεξάνδρα Ρανούνκελ", image: "/people/alexandra.jpg" },
];

// Round down to the nearest `step` and present as "1.900+".
function approx(n: number, step: number): string {
    const floored = Math.floor(n / step) * step;
    if (floored <= 0) return String(n);
    return `${floored.toLocaleString("el-GR")}+`;
}

// ─── Building blocks ────────────────────────────────────────────────────────

function FoldTicks() {
    // 6pt ticks at both fold lines, top and bottom — inside the margin, so
    // they never collide with content.
    return (
        <>
            {[PANEL_W, PANEL_W * 2].map(x => (
                <View key={x}>
                    <View
                        style={{
                            position: "absolute",
                            left: x,
                            top: 0,
                            width: 0.5,
                            height: 6,
                            backgroundColor: C.light,
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            left: x,
                            top: PAGE_H - 6,
                            width: 0.5,
                            height: 6,
                            backgroundColor: C.light,
                        }}
                    />
                </View>
            ))}
        </>
    );
}

function Panel({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: object;
}) {
    return (
        <View
            style={{
                width: PANEL_W,
                height: PAGE_H,
                padding: PANEL_PAD,
                display: "flex",
                flexDirection: "column",
                ...style,
            }}
        >
            {children}
        </View>
    );
}

function PanelTitle({ kicker, title }: { kicker: string; title: string }) {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 6.5, color: C.accent, letterSpacing: 1, marginBottom: 4 }}>
                {greekUpper(kicker)}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>
                {title}
            </Text>
        </View>
    );
}

function Feature({
    icon,
    title,
    text,
    badge,
}: {
    icon: keyof typeof ICON_PATHS;
    title: string;
    text: string;
    badge?: string;
}) {
    return (
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 16 }}>
            <View
                style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: C.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                }}
            >
                <LucideIcon name={icon} size={13} />
            </View>
            <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink }}>{title}</Text>
                    {badge && (
                        <Text
                            style={{
                                fontSize: 5.5,
                                color: C.accent,
                                borderWidth: 0.5,
                                borderColor: C.accent,
                                borderRadius: 3,
                                paddingHorizontal: 3,
                                paddingVertical: 1,
                            }}
                        >
                            {greekUpper(badge)}
                        </Text>
                    )}
                </View>
                <Text style={{ fontSize: 8, color: C.mid, lineHeight: 1.5, marginTop: 2.5 }}>
                    {text}
                </Text>
            </View>
        </View>
    );
}

/**
 * Screenshot presented inside a minimal browser-window mockup: hairline
 * border, rounded corners, a chrome bar with traffic-light dots and the URL.
 * `aspect` is the screenshot's width/height ratio (both shipped assets are
 * 1600×1000).
 */
function BrowserFrame({
    src,
    url,
    width,
    aspect = 1.6,
}: {
    src: string;
    url: string;
    width: number;
    aspect?: number;
}) {
    const BAR_H = 13;
    return (
        <View
            style={{
                width,
                borderWidth: 0.75,
                borderColor: C.line,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: "#ffffff",
            }}
        >
            <View
                style={{
                    height: BAR_H,
                    backgroundColor: C.surface,
                    borderBottomWidth: 0.5,
                    borderBottomColor: C.line,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 6,
                }}
            >
                <View style={{ flexDirection: "row", gap: 2.5 }}>
                    {["#fc5753", "#fdbc40", "#33c748"].map(dot => (
                        <View
                            key={dot}
                            style={{
                                width: 3.5,
                                height: 3.5,
                                borderRadius: 1.75,
                                backgroundColor: dot,
                            }}
                        />
                    ))}
                </View>
                <View
                    style={{
                        flex: 1,
                        marginHorizontal: 8,
                        backgroundColor: "#ffffff",
                        borderRadius: 3,
                        borderWidth: 0.5,
                        borderColor: C.line,
                        paddingVertical: 1.5,
                        alignItems: "center",
                    }}
                >
                    <Text style={{ fontSize: 4.5, color: C.mid }}>{url}</Text>
                </View>
                <View style={{ width: 12 }} />
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={src} style={{ width: "100%", height: width / aspect }} />
        </View>
    );
}

// ─── Outside: flap ──────────────────────────────────────────────────────────

function FlapPanel({ data }: { data: BrochureData }) {
    return (
        <Panel style={{ backgroundColor: C.surface }}>
            {data.partners.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                    <Text
                        style={{ fontSize: 6.5, color: C.accent, letterSpacing: 1, marginBottom: 8 }}
                    >
                        {greekUpper(`Σε ${data.stats.municipalityCount} δήμους στην Ελλάδα`)}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 7 }}>
                        {data.partners.map(partner => (
                            <View
                                key={partner.name}
                                style={{
                                    width: "50%",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 5,
                                    paddingRight: 6,
                                }}
                            >
                                <View
                                    style={{
                                        width: 15,
                                        height: 15,
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                                    <Image
                                        src={partner.logo}
                                        style={{
                                            maxWidth: 15,
                                            maxHeight: 15,
                                            objectFit: "contain",
                                        }}
                                    />
                                </View>
                                <Text style={{ flex: 1, fontSize: 6.5, color: C.body, lineHeight: 1.25 }}>
                                    {partner.name}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <View style={{ flex: 1, justifyContent: "center" }}>
                <Text style={{ fontSize: 26, color: C.accent, marginBottom: 2 }}>“</Text>
                <Text style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, fontWeight: 500 }}>
                    Μέσα στα πρώτα πέντε λεπτά κατάλαβα πως ήταν κάτι το διαφορετικό.
                </Text>
                <Text style={{ fontSize: 7.5, color: C.mid, marginTop: 8, lineHeight: 1.4 }}>
                    Προϊσταμένη Δ/νσης Προγραμματισμού, Οργάνωσης και Πληροφορικής
                </Text>
                <Text style={{ fontSize: 7.5, color: C.light, marginTop: 1 }}>Δήμος Χανίων</Text>
            </View>

            <View
                style={{
                    borderTopWidth: 0.5,
                    borderTopColor: C.line,
                    paddingTop: 14,
                }}
            >
                {data.city ? (
                    <>
                        <Text
                            style={{ fontSize: 10.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}
                        >
                            Η γνώμη σας μετράει.
                        </Text>
                        <Text style={{ fontSize: 8, color: C.body, lineHeight: 1.5, marginTop: 6 }}>
                            Το OpenCouncil διαμορφώνεται μαζί με τους ανθρώπους της
                            αυτοδιοίκησης. Πείτε μας τι λείπει, τι δεν δουλεύει και τι θα
                            θέλατε να δείτε — κάθε παρατήρηση φτάνει κατευθείαν στην ομάδα
                            που το φτιάχνει.
                        </Text>
                    </>
                ) : (
                    <>
                        <Text
                            style={{ fontSize: 10.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}
                        >
                            Ξεκινά στον δήμο σας σε ημέρες — όχι μήνες.
                        </Text>
                        <View style={{ marginTop: 8, gap: 5 }}>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                                <Text style={{ fontSize: 8, color: C.accent }}>·</Text>
                                <Text style={{ flex: 1, fontSize: 8, color: C.body, lineHeight: 1.45 }}>
                                    Δωρεάν δοκιμαστική περίοδος, για όσο χρόνο χρειάζεστε.
                                </Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                                <Text style={{ fontSize: 8, color: C.accent }}>·</Text>
                                <Text style={{ flex: 1, fontSize: 8, color: C.body, lineHeight: 1.45 }}>
                                    Κόστος συγκρίσιμο με τον σημερινό σας πάροχο
                                    απομαγνητοφώνησης — με δεκαπλάσια λειτουργικότητα.
                                </Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                                <Text style={{ fontSize: 8, color: C.accent }}>·</Text>
                                <Text style={{ flex: 1, fontSize: 8, color: C.body, lineHeight: 1.45 }}>
                                    Χωρίς κόστος ενσωμάτωσης — αρκεί ένα βίντεο ή ηχητικό
                                    αρχείο.
                                </Text>
                            </View>
                        </View>
                    </>
                )}
                <View
                    style={{
                        marginTop: 12,
                        backgroundColor: C.ink,
                        borderRadius: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                    }}
                >
                    <Text style={{ fontSize: 8.5, fontWeight: 600, color: "#ffffff" }}>
                        {data.city ? "Καλέστε μας ή γράψτε μας" : "Κλείστε μία παρουσίαση"}
                    </Text>
                    <Text style={{ fontSize: 7.5, color: "#d4d4d4", marginTop: 2 }}>
                        {data.contactEmail} · {data.contactPhone}
                    </Text>
                </View>
            </View>
        </Panel>
    );
}

// ─── Outside: back cover ────────────────────────────────────────────────────

function BackPanel({ data }: { data: BrochureData }) {
    return (
        <Panel>
            <PanelTitle kicker="Η ομάδα" title="Οι άνθρωποι πίσω από το OpenCouncil" />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {TEAM.map(member => (
                    <View key={member.name} style={{ width: 50, alignItems: "center" }}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image
                            src={`${ASSET_BASE}${member.image}`}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                objectFit: "cover",
                            }}
                        />
                        <Text
                            style={{
                                fontSize: 6.5,
                                color: C.body,
                                textAlign: "center",
                                marginTop: 3,
                                lineHeight: 1.3,
                            }}
                        >
                            {member.name}
                        </Text>
                    </View>
                ))}
            </View>

            <Text style={{ fontSize: 7.5, color: C.mid, lineHeight: 1.5, marginTop: 12 }}>
                Η OpenCouncil Μονοπρόσωπη Ι.Κ.Ε. ανήκει εξ ολοκλήρου στη Schema Labs,
                μη-κερδοσκοπική εταιρεία. Ο κώδικάς μας είναι ανοιχτός, με άδεια GPL v3 —
                κάθε γραμμή είναι δημόσια.
            </Text>

            {data.city?.adam && (
                <Text style={{ fontSize: 7.5, color: C.mid, lineHeight: 1.5, marginTop: 8 }}>
                    Το OpenCouncil λειτουργεί στον{" "}
                    {municipalityAccusative(data.city.nameMunicipality)} με σύμβαση με ΑΔΑΜ{" "}
                    {data.city.adam}. Ο τρόπος τιμολόγησης είναι δημόσια διαθέσιμος στο
                    opencouncil.gr/about.
                </Text>
            )}

            <View style={{ flex: 1 }} />

            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderTopWidth: 0.5,
                    borderTopColor: C.line,
                    paddingTop: 14,
                }}
            >
                <View style={{ alignItems: "center", gap: 3 }}>
                    <QRCode
                        value={data.city ? `${data.baseUrl}/${data.city.id}` : `${data.baseUrl}/about`}
                        size={52}
                    />
                    {data.city && (
                        <Text style={{ fontSize: 5, color: C.light }}>
                            opencouncil.gr/{data.city.id}
                        </Text>
                    )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="mail" size={8} color={C.mid} />
                        <Text style={{ fontSize: 7.5, color: C.body }}>{data.contactEmail}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="phone" size={8} color={C.mid} />
                        <Text style={{ fontSize: 7.5, color: C.body }}>{data.contactPhone}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="mapPin" size={8} color={C.mid} />
                        <Text style={{ fontSize: 7.5, color: C.body }}>
                            Σμολένσκι 22, Αθήνα · opencouncil.gr
                        </Text>
                    </View>
                </View>
            </View>
        </Panel>
    );
}

// ─── Outside: front cover ───────────────────────────────────────────────────

function FrontPanel({ data }: { data: BrochureData }) {
    const stats = [
        { value: String(data.stats.municipalityCount), label: "δήμοι" },
        { value: approx(data.stats.subjectCount, 100), label: "θέματα" },
        { value: approx(data.stats.meetingHours, 100), label: "ώρες συνεδριάσεων" },
    ];

    return (
        <Panel>
            <Brand size={30} />

            <View style={{ flex: 1, justifyContent: "center" }}>
                {data.city ? (
                    <>
                        <Text style={{ fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
                            Το OpenCouncil
                        </Text>
                        <Text style={{ fontSize: 20, fontWeight: 700, color: C.accent, lineHeight: 1.2 }}>
                            στον {municipalityAccusative(data.city.nameMunicipality)}
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style={{ fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
                            Το λειτουργικό σύστημα
                        </Text>
                        <Text style={{ fontSize: 20, fontWeight: 700, color: C.accent, lineHeight: 1.2 }}>
                            των συλλογικών οργάνων
                        </Text>
                    </>
                )}
                <Text style={{ fontSize: 9, color: C.mid, lineHeight: 1.55, marginTop: 10 }}>
                    Δημοτικά συμβούλια, επιτροπές και κοινότητες — πιο ανοιχτά για τους
                    δημότες, πιο αποδοτικά για τις υπηρεσίες.
                </Text>
                <View style={{ marginTop: 16 }}>
                    <BrowserFrame
                        src={`${ASSET_BASE}/brochure/homepage.jpg`}
                        url="opencouncil.gr"
                        width={PANEL_W - PANEL_PAD * 2}
                    />
                </View>
            </View>

            <View
                style={{
                    flexDirection: "row",
                    borderTopWidth: 0.5,
                    borderTopColor: C.line,
                    paddingTop: 14,
                    marginBottom: 12,
                }}
            >
                {stats.map(stat => (
                    <View key={stat.label} style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>
                            {stat.value}
                        </Text>
                        <Text style={{ fontSize: 6.5, color: C.mid, marginTop: 1 }}>
                            {stat.label}
                        </Text>
                    </View>
                ))}
            </View>

            <Text style={{ fontSize: 7.5, color: C.light, lineHeight: 1.4 }}>
                Από τον Δήμο Σαμοθράκης μέχρι τον Δήμο Αθηναίων ·{" "}
                {data.city ? `opencouncil.gr/${data.city.id}` : "opencouncil.gr"}
            </Text>
        </Panel>
    );
}

// ─── Inside panels ──────────────────────────────────────────────────────────

function CitizensPanel() {
    return (
        <Panel>
            <PanelTitle kicker="Για δημότες και αιρετούς" title="Κάθε συνεδρίαση, ανοιχτή σε όλους" />
            <Text style={{ fontSize: 8.5, color: C.mid, lineHeight: 1.55, marginBottom: 16 }}>
                Το OpenCouncil μετατρέπει πολύωρες συνεδριάσεις σε κατανοητό, αναζητήσιμο
                και προσβάσιμο περιεχόμενο — αυτόματα.
            </Text>

            <Feature
                icon="fileText"
                title="Θέματα & Περιλήψεις"
                text="Κάθε συνεδρίαση χωρίζεται αυτόματα σε θέματα. Για κάθε θέμα, σύνοψη τοποθέτησης ανά ομιλητή, με βίντεο, κείμενο και ψηφοφορία."
            />
            <Feature
                icon="search"
                title="Αναζήτηση"
                text="Αναζήτηση σε όλα όσα έχουν ειπωθεί σε κάθε συνεδρίαση, σε κάθε δήμο."
            />
            <Feature
                icon="bell"
                title="Ειδοποιήσεις"
                text="Οι δημότες λαμβάνουν σύντομα μηνύματα σε SMS, WhatsApp και email, όποτε το ΔΣ συζητάει κάτι για τον δρόμο ή τη γειτονιά τους."
            />
            <Feature
                icon="mapPin"
                title="Χάρτης θεμάτων"
                text="Ζουμ σε κάθε περιοχή, γειτονιά και δρόμο: τα θέματα που συζητάει το ΔΣ και οι κοινότητες, σε χάρτη."
            />

            <View style={{ flex: 1 }} />
            <BrowserFrame
                src={`${ASSET_BASE}/brochure/subject.jpg`}
                url="opencouncil.gr/chania"
                width={PANEL_W - PANEL_PAD * 2}
            />
            <Text style={{ fontSize: 7, color: C.light, lineHeight: 1.4, marginTop: 8 }}>
                Η διαφάνεια ως υποδομή: όλα δημόσια, με ανοιχτά δεδομένα μέσω API.
            </Text>
        </Panel>
    );
}

function ServicesPanel({ data }: { data: BrochureData }) {
    return (
        <Panel>
            <PanelTitle
                kicker="Για τις υπηρεσίες του δήμου"
                title="Ό,τι γινόταν σε μέρες, τώρα γίνεται σε ώρες"
            />
            <Text style={{ fontSize: 8.5, color: C.mid, lineHeight: 1.55, marginBottom: 16 }}>
                Απομαγνητοφωνήσεις, πρακτικά, αποφάσεις — αυτόματα ή με ελάχιστη ανθρώπινη
                παρέμβαση.
            </Text>

            <Feature
                icon="mic"
                title="Απομαγνητοφωνήσεις σε 48 ώρες"
                text="Ακριβείς, ελεγμένες από άνθρωπο απομαγνητοφωνήσεις κάθε συνεδρίασης, με αυτόματη αναγνώριση ομιλητή."
            />
            <Feature
                icon="fileCheck"
                title="Αυτόματη παραγωγή πρακτικών"
                text="Αυτόματα πρακτικά της συνεδρίασης, έτοιμα για έλεγχο και υπογραφή. Εξοικονόμηση ημερών εργασίας."
            />
            <Feature
                icon="landmark"
                title="Αποφάσεις για τη Διαύγεια"
                text="Αυτόματη δημιουργία εγγράφων αποφάσεων, έτοιμων για ανάρτηση στη Διαύγεια."
                badge="Σύντομα"
            />
            <Feature
                icon="printer"
                title="Έντυπο αρχείο"
                text="Παράδοση αρχείου απομαγνητοφωνήσεων σε έντυπη μορφή, σύμφωνα με τις προδιαγραφές του κάθε δήμου."
            />

            <View style={{ flex: 1 }} />
            <View
                style={{
                    backgroundColor: C.accentSoft,
                    borderRadius: 6,
                    padding: 10,
                }}
            >
                {data.city ? (
                    <>
                        <Text style={{ fontSize: 8, fontWeight: 600, color: C.ink }}>
                            Θέλουμε τη γνώμη σας.
                        </Text>
                        <Text style={{ fontSize: 7.5, color: C.body, lineHeight: 1.5, marginTop: 3 }}>
                            Καλέστε μας στο {data.contactPhone} ή γράψτε μας στο{" "}
                            {data.contactEmail} — κάθε παρατήρηση διαμορφώνει το OpenCouncil.
                        </Text>
                    </>
                ) : (
                    <Text style={{ fontSize: 7.5, color: C.body, lineHeight: 1.5 }}>
                        Το OpenCouncil μπορεί να αντικαταστήσει τον πάροχο των πρακτικών σας
                        για παρόμοιο κόστος — με δεκαπλάσια λειτουργικότητα και ταχύτητα.
                    </Text>
                )}
            </View>
        </Panel>
    );
}

function Step({
    number,
    icon,
    title,
    text,
    last = false,
}: {
    number: string;
    icon: keyof typeof ICON_PATHS;
    title: string;
    text: string;
    last?: boolean;
}) {
    return (
        <View style={{ flexDirection: "row", gap: 9 }}>
            <View style={{ alignItems: "center" }}>
                <View
                    style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: C.accent,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Text style={{ fontSize: 8.5, fontWeight: 700, color: "#ffffff" }}>
                        {number}
                    </Text>
                </View>
                {!last && (
                    <View style={{ width: 0.5, flex: 1, backgroundColor: C.line, marginTop: 3 }} />
                )}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <LucideIcon name={icon} size={9} />
                    <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink }}>{title}</Text>
                </View>
                <Text style={{ fontSize: 8, color: C.mid, lineHeight: 1.5, marginTop: 2.5 }}>
                    {text}
                </Text>
            </View>
        </View>
    );
}

function HowItWorksPanel() {
    return (
        <Panel>
            <PanelTitle kicker="Πώς δουλεύει" title="Από τη συνεδρίαση στον δημότη — αυτόματα" />

            <Step
                number="1"
                icon="video"
                title="Μαγνητοσκόπηση"
                text="Η συνεδρίαση καταγράφεται ή ανεβαίνει από YouTube — αρκεί ένα βίντεο ή ηχητικό αρχείο, μαζί με την ημερήσια διάταξη."
            />
            <Step
                number="2"
                icon="sparkles"
                title="AI + ανθρώπινος έλεγχος"
                text="Απομαγνητοφώνηση με αναγνώριση ομιλητών, θέματα, περιλήψεις και αποφάσεις — ελεγμένα από άνθρωπο σε 48 ώρες."
            />
            <Step
                number="3"
                icon="bell"
                title="Σε δημότες, υπηρεσίες και αιρετούς"
                text="Ειδοποιήσεις στους δημότες, ανοιχτή πλατφόρμα για όλους, πρακτικά και απομαγνητοφωνήσεις έτοιμα για χρήση."
                last
            />

            <View style={{ flex: 1 }} />

            <View style={{ borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 12 }}>
                <Text style={{ fontSize: 6.5, color: C.accent, letterSpacing: 1, marginBottom: 7 }}>
                    {greekUpper("Διακρίσεις & Αναφορές")}
                </Text>
                {[
                    ["Βραβείο Υπ. Ψηφιακής Διακυβέρνησης", "Καλύτερη Εφαρμοσμένη Ιδέα — Τοπική Αυτοδιοίκηση"],
                    ["ΟΟΣΑ", "Αναφορά σε έκθεση για AI & Civic Engagement"],
                    ["Innovation in Politics Awards 2026", "Φιναλίστ"],
                    ["EPSA 2025-26", "Πιστοποιητικό Καλής Πρακτικής"],
                ].map(([title, subtitle]) => (
                    <View
                        key={title}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}
                    >
                        <LucideIcon name="award" size={9} />
                        <Text style={{ flex: 1, fontSize: 7.5, color: C.body, lineHeight: 1.3 }}>
                            <Text style={{ fontWeight: 600, color: C.ink }}>{title}</Text>
                            {" — "}
                            {subtitle}
                        </Text>
                    </View>
                ))}
            </View>
        </Panel>
    );
}

// ─── Document ───────────────────────────────────────────────────────────────

export function BrochurePdf({ data }: { data: BrochureData }) {
    return (
        <Document
            title="OpenCouncil — Ενημερωτικό τρίπτυχο"
            author="OpenCouncil"
            language="el"
        >
            {/* Outside: flap | back | front */}
            <Page
                size="A4"
                orientation="landscape"
                style={{ fontFamily: "Relative", flexDirection: "row", backgroundColor: "#ffffff" }}
            >
                <FoldTicks />
                <FlapPanel data={data} />
                <BackPanel data={data} />
                <FrontPanel data={data} />
            </Page>

            {/* Inside: three-panel spread */}
            <Page
                size="A4"
                orientation="landscape"
                style={{ fontFamily: "Relative", flexDirection: "row", backgroundColor: "#ffffff" }}
            >
                <FoldTicks />
                <CitizensPanel />
                <ServicesPanel data={data} />
                <HowItWorksPanel />
            </Page>
        </Document>
    );
}
