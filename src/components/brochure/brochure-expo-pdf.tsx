/**
 * Trifold A4 leaflet for Smart City Expo World Congress 2026 (English), on the
 * same primitives and fold as the Greek councillor brochure.
 *
 *   Page 1 (outside): [flap: live in Greece + quote + demo | back: find us, map, team | front]
 *   Page 2 (inside):  [for residents | for council staff | how it works + awards]
 *
 * Data comes from the opencouncil.eu site snapshot (public/brochure/expo-data.json);
 * every line of copy from expo-leaflet-copy.ts.
 */
import { Document, Page, View, Text, Image, Svg, Path, Circle } from "@react-pdf/renderer";
import { ASSET_BASE, Brand, C, LucideIcon, QRCode } from "@/components/pdf/shared";
import type { ICON_PATHS } from "@/components/pdf/shared";
import { TEAM_MEMBERS } from "@/components/about/config";
import { EXPO_COPY as T, fill } from "@/components/brochure/expo-leaflet-copy";
import enAbout from "../../../messages/en/about.json";

export interface ExpoData {
    counts: { live: number; preview: number; countries: number };
    live: Array<{ id: string; name: string; crest: string | null }>;
    preview: Array<{ id: string; name: string; cc: string }>;
    quote: { textEn: string; speaker: string; role?: string; body: string; city: string; date: string } | null;
    cards: Array<{ city: string; title: string; date: string }>;
    map: {
        width: number;
        height: number;
        land: string[];
        dots: Array<{ id: string; name: string; status: "live" | "preview" | "requested"; x: number; y: number }>;
    };
    /** The cover: Chania's streets around one subject, from the site's city map. */
    chania: {
        width: number;
        height: number;
        streets: Array<{ w: number; d: string }>;
        coast: string;
        pin: { x: number; y: number; title: string; place: string; date: string; url: string };
        labels: Array<{ text: string; x: number; y: number }>;
    };
}

/** The subject page on the residents panel: a live council's, in the English interface. */
const SCREENSHOT = { file: "subject-page.png", url: "opencouncil.gr/athens", aspect: 2560 / 1480 };

const memberNames: Record<string, string> = enAbout.team.members;
const TEAM = TEAM_MEMBERS.map(m => ({ name: memberNames[m.id] ?? m.id, image: m.image }));

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const PANEL_W = PAGE_W / 3;
const PAD = 24;
const INNER = PANEL_W - PAD * 2;

/** Dates arrive as calendar dates (YYYY-MM-DD) and print day-first, "19 Oct 2026", like the rest of the leaflet. No timezone math. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The numbers every template may use. */
function vars(data: ExpoData): Record<string, string | number> {
    return {
        live: data.counts.live,
        preview: data.counts.preview,
        countries: data.counts.countries - 1,
        cities: data.preview.map(c => c.name).join(" · "),
        date: fmtDate(data.chania.pin.date),
        place: data.chania.pin.place,
        expoName: T.back.expoName,
    };
}

/** A sentence with one part in orange: "{accent}" in the template marks where. */
function Accented({ template, accent, style }: { template: string; accent: string; style: object }) {
    const [before, after = ""] = template.split("{accent}");
    return (
        <Text style={style}>
            {before}
            <Text style={{ color: C.accent }}>{accent}</Text>
            {after}
        </Text>
    );
}

// ─── Building blocks ────────────────────────────────────────────────────────

function FoldTicks() {
    return (
        <>
            {[PANEL_W, PANEL_W * 2].map(x => (
                <View key={x}>
                    <View style={{ position: "absolute", left: x, top: 0, width: 0.5, height: 6, backgroundColor: C.light }} />
                    <View style={{ position: "absolute", left: x, top: PAGE_H - 6, width: 0.5, height: 6, backgroundColor: C.light }} />
                </View>
            ))}
        </>
    );
}

function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
    return (
        <View style={{ width: PANEL_W, height: PAGE_H, padding: PAD, display: "flex", flexDirection: "column", ...style }}>
            {children}
        </View>
    );
}

function Kicker({ children }: { children: string }) {
    return <Text style={{ fontSize: 7.5, color: C.accent, letterSpacing: 1.2, marginBottom: 6 }}>{children.toUpperCase()}</Text>;
}

function PanelTitle({ kicker, title }: { kicker: string; title: string }) {
    return (
        <View style={{ marginBottom: 10 }}>
            <Kicker>{kicker}</Kicker>
            <Text style={{ fontSize: 15, color: C.ink, lineHeight: 1.25 }}>{title}</Text>
        </View>
    );
}

function Feature({ icon, title, text }: { icon: keyof typeof ICON_PATHS; title: string; text: string }) {
    return (
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                <LucideIcon name={icon} size={13} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, color: C.ink }}>{title}</Text>
                <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginTop: 2 }}>{text}</Text>
            </View>
        </View>
    );
}

function BrowserFrame({ src, url, width, aspect }: { src: string; url: string; width: number; aspect: number }) {
    return (
        <View style={{ width, borderWidth: 0.75, borderColor: C.line, borderRadius: 6, overflow: "hidden", backgroundColor: "#ffffff" }}>
            <View style={{ height: 13, backgroundColor: C.surface, borderBottomWidth: 0.5, borderBottomColor: C.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
                <View style={{ flexDirection: "row", gap: 2.5 }}>
                    {["#fc5753", "#fdbc40", "#33c748"].map(dot => (
                        <View key={dot} style={{ width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: dot }} />
                    ))}
                </View>
                <View style={{ flex: 1, marginHorizontal: 8, backgroundColor: "#ffffff", borderRadius: 3, borderWidth: 0.5, borderColor: C.line, paddingVertical: 1.5, alignItems: "center" }}>
                    <Text style={{ fontSize: 4.5, color: C.mid }}>{url}</Text>
                </View>
                <View style={{ width: 12 }} />
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={src} style={{ width: "100%", height: width / aspect, objectFit: "cover" }} />
        </View>
    );
}

// ─── The cover map ──────────────────────────────────────────────────────────

const WA = { header: "#008069", headerSub: "#cfe9e1", bg: "#efeae2", ink: "#111b21", muted: "#667781", link: "#027eb5", chip: "#54656f", placeholder: "#8696a0", mic: "#00a884" };
const MAP_BG = "#f5f5f4";
const STREET: Record<number, { color: string; width: number }> = {
    1: { color: "#dedede", width: 0.55 },
    2: { color: "#cfcfcf", width: 0.95 },
    3: { color: "#bdbdbd", width: 1.4 },
};
/** WhatsApp sets its own type; Inter is the closest face the PDF has. */
const WAT = { fontFamily: "Inter" };

/** A phone screen with one Notis message, drawn the way WhatsApp draws a business chat. */
function WhatsAppWindow({ data, width }: { data: ExpoData; width: number }) {
    const w = T.whatsapp;
    const v = vars(data);
    return (
        <View style={{ width }}>
            <View style={{ position: "absolute", left: 1.5, top: 3, width, height: "100%", borderRadius: 12, backgroundColor: "#000000", opacity: 0.12 }} />
            {/* The bezel is a layer of its own: a border on a clipped box leaves a light wedge at each corner. */}
            <View style={{ borderRadius: 12, backgroundColor: "#262626", padding: 1.2 }}>
            <View style={{ borderRadius: 10.8, overflow: "hidden", backgroundColor: WA.bg }}>
                {/* Header */}
                <View style={{ backgroundColor: WA.header, paddingVertical: 5, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ ...WAT, fontSize: 8, color: "#ffffff", marginRight: -1 }}>‹</Text>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image src={`${ASSET_BASE}/logo.png`} style={{ width: 11.5, height: 11.5 * (1354 / 1606) }} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ ...WAT, fontSize: 6.3, fontWeight: 500, color: "#ffffff" }}>{w.sender}</Text>
                        <Text style={{ ...WAT, fontSize: 4.6, color: WA.headerSub, marginTop: 0.5 }}>{w.status}</Text>
                    </View>
                    <LucideIcon name="video" size={7.5} color="#ffffff" />
                    <LucideIcon name="phone" size={6.5} color="#ffffff" />
                    <View style={{ gap: 1.2, marginLeft: 1 }}>
                        {[0, 1, 2].map(i => (
                            <View key={i} style={{ width: 1.4, height: 1.4, borderRadius: 0.7, backgroundColor: "#ffffff" }} />
                        ))}
                    </View>
                </View>

                {/* Chat */}
                <View style={{ padding: 5, paddingBottom: 3, gap: 4 }}>
                    <View style={{ alignSelf: "center", backgroundColor: "#ffffff", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.8 }}>
                        <Text style={{ ...WAT, fontSize: 4.4, color: WA.chip, letterSpacing: 0.2 }}>{w.dateChip}</Text>
                    </View>
                    <View style={{ alignSelf: "flex-start", maxWidth: "88%", backgroundColor: "#ffffff", borderRadius: 7, borderTopLeftRadius: 0, paddingVertical: 4, paddingHorizontal: 6, marginLeft: 4 }}>
                        <Svg width={5} height={6} style={{ position: "absolute", left: -4.5, top: 0 }}>
                            <Path d="M5,0 L0,0 L5,6 Z" fill="#ffffff" />
                        </Svg>
                        <Text style={{ ...WAT, fontSize: 6.2, color: WA.ink, lineHeight: 1.38 }}>{w.message}</Text>
                        <Text style={{ ...WAT, fontSize: 6.2, fontWeight: 600, color: WA.ink, lineHeight: 1.38, marginTop: 4 }}>{data.chania.pin.title}</Text>
                        <Text style={{ ...WAT, fontSize: 6.2, color: WA.ink, lineHeight: 1.38 }}>{fill(w.place, v)}</Text>
                        <Text style={{ ...WAT, fontSize: 6.2, color: WA.link, textDecoration: "underline", lineHeight: 1.38, marginTop: 4 }}>{w.link}</Text>
                        <Text style={{ ...WAT, fontSize: 4.4, color: WA.muted, textAlign: "right", marginTop: 1 }}>{w.time}</Text>
                    </View>
                </View>

                {/* Composer */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 5, paddingVertical: 3 }}>
                    <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: "#ffffff", justifyContent: "center", paddingHorizontal: 7 }}>
                        <Text style={{ ...WAT, fontSize: 5.4, color: WA.placeholder }}>{w.composer}</Text>
                    </View>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: WA.mic, alignItems: "center", justifyContent: "center" }}>
                        <LucideIcon name="mic" size={7} color="#ffffff" />
                    </View>
                </View>
            </View>
            </View>
        </View>
    );
}

/** Chania's streets with the subject's pin and the phone beside it. */
function ChaniaMap({ data, width }: { data: ExpoData; width: number }) {
    const chania = data.chania;
    const h = (chania.height / chania.width) * width;
    const k = width / chania.width;
    const pinX = chania.pin.x * k;
    const phoneW = 138;
    return (
        <View style={{ width, height: h, borderRadius: 8, backgroundColor: MAP_BG, borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>
            <Svg width={width} height={h} viewBox={`0 0 ${chania.width} ${chania.height}`}>
                {chania.streets.map(street => (
                    <Path key={street.w} d={street.d} fill="none" stroke={STREET[street.w]?.color ?? "#dedede"} strokeWidth={(STREET[street.w]?.width ?? 0.6) / k} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                <Path d={chania.coast} fill="none" stroke="#a3a3a3" strokeWidth={1.1 / k} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={chania.pin.x} cy={chania.pin.y} r={13 / k} fill={C.accent} opacity={0.16} />
                <Circle cx={chania.pin.x} cy={chania.pin.y} r={4.5 / k} fill={C.accent} stroke="#ffffff" strokeWidth={1.4 / k} />
            </Svg>
            {/* Each label on a patch of the map's own colour, so no street runs through the letters. */}
            {chania.labels.map(label => (
                <View key={label.text} style={{ position: "absolute", left: label.x * k - 2.5, top: label.y * k - 1, backgroundColor: MAP_BG, borderRadius: 2, paddingHorizontal: 2.5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 6, color: C.mid, letterSpacing: 0.4 }}>{label.text.toUpperCase()}</Text>
                </View>
            ))}
            <View style={{ position: "absolute", left: pinX + 16, top: 54, width: phoneW }}>
                <WhatsAppWindow data={data} width={phoneW} />
            </View>
        </View>
    );
}

// ─── The Europe map ─────────────────────────────────────────────────────────

/** Preview dots whose label goes on the left, because the one to the right is taken. */
const LABEL_LEFT = new Set(["kortrijk", "rennes", "valladolid"]);

function EuropeMap({ map }: { map: ExpoData["map"] }) {
    const w = INNER;
    const h = (map.height / map.width) * INNER;
    const live = map.dots.filter(d => d.status === "live");
    const preview = map.dots.filter(d => d.status === "preview");
    return (
        <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>
            <Svg width={w} height={h} viewBox={`0 0 ${map.width} ${map.height}`}>
                {map.land.map((d, i) => (
                    <Path key={i} d={d} fill="#ececec" stroke="#d8d8d8" strokeWidth={0.4} />
                ))}
                {preview.map(d => (
                    <Circle key={d.id} cx={d.x} cy={d.y} r={2.6} fill="#ffffff" stroke={C.ink} strokeWidth={1} />
                ))}
                {live.map(d => (
                    <Circle key={d.id} cx={d.x} cy={d.y} r={2.6} fill={C.accent} stroke="#ffffff" strokeWidth={0.8} />
                ))}
            </Svg>
            {/* Labels for the previews, right of the dot unless a neighbour is there. Live Greek dots are named by the crest list on the flap. */}
            {preview.map(d => {
                const x = (d.x / map.width) * w;
                const side = LABEL_LEFT.has(d.id) ? { right: w - x + 4 } : { left: x + 4 };
                return (
                    <Text key={`${d.id}-l`} style={{ position: "absolute", ...side, top: (d.y / map.height) * h - 3.5, fontSize: 5.5, color: C.body }}>
                        {d.name}
                    </Text>
                );
            })}
        </View>
    );
}

// ─── Outside ────────────────────────────────────────────────────────────────

function FlapPanel({ data }: { data: ExpoData }) {
    const t = T.flap;
    const v = vars(data);
    return (
        <Panel style={{ backgroundColor: C.surface }}>
            <Kicker>{fill(t.kicker, v)}</Kicker>
            <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8, marginTop: 2 }}>
                {data.live.map(city => (
                    <View key={city.id} style={{ width: "50%", flexDirection: "row", alignItems: "center", gap: 5, paddingRight: 6 }}>
                        <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
                            {city.crest && (
                                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
                                <Image src={city.crest} style={{ maxWidth: 16, maxHeight: 16, objectFit: "contain" }} />
                            )}
                        </View>
                        <Text style={{ flex: 1, fontSize: 7.5, color: C.body }}>{city.name}</Text>
                    </View>
                ))}
            </View>

            {data.quote && (
                <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={{ fontSize: 26, color: C.accent, marginBottom: 0 }}>“</Text>
                    <Text style={{ fontSize: 14, color: C.ink, lineHeight: 1.4 }}>{data.quote.textEn}</Text>
                    <Text style={{ fontSize: 7.5, color: C.body, marginTop: 8, lineHeight: 1.4 }}>
                        {data.quote.speaker}, {data.quote.role ?? `${data.quote.body} of ${data.quote.city}`}, {fmtDate(data.quote.date)}
                    </Text>
                </View>
            )}

            <View style={{ borderTopWidth: 1.5, borderTopColor: C.accent, paddingTop: 12 }}>
                <Kicker>{t.demoKicker}</Kicker>
                <Text style={{ fontSize: 12, color: C.ink, lineHeight: 1.3 }}>{t.demoTitle}</Text>
                <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginTop: 5 }}>{t.demoText}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <QRCode value={`https://${T.contacts.site}/#request`} size={56} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.ink, lineHeight: 1.3 }}>{t.scan}</Text>
                        <Text style={{ fontSize: 7, color: C.mid, marginTop: 3 }}>{T.contacts.site}/#request</Text>
                    </View>
                </View>
                <Text style={{ fontSize: 6.8, color: C.mid, lineHeight: 1.45, marginTop: 10 }}>{fill(t.previewed, v)}</Text>
            </View>
        </Panel>
    );
}

function BackPanel({ data }: { data: ExpoData }) {
    const t = T.back;
    const v = vars(data);
    const contacts: Array<[keyof typeof ICON_PATHS, string]> = [
        ["mail", T.contacts.email],
        ["phone", T.contacts.whatsapp],
        ["globe", T.contacts.site],
    ];
    return (
        <Panel>
            <View style={{ borderLeftWidth: 2, borderLeftColor: C.accent, backgroundColor: C.surface, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 12 }}>
                <Kicker>{t.kicker}</Kicker>
                <Text style={{ fontSize: 13, color: C.ink, lineHeight: 1.25 }}>{t.expoName}</Text>
                <Text style={{ fontSize: 7.5, color: C.body, marginTop: 2 }}>{t.expoWhen}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 7, alignItems: "flex-start" }}>
                    <LucideIcon name="mapPin" size={10} color={C.accent} />
                    <View>
                        <Text style={{ fontSize: 10, color: C.ink }}>{t.stand}</Text>
                        <Text style={{ fontSize: 7, color: C.mid }}>{t.area}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 5, alignItems: "flex-start" }}>
                    <LucideIcon name="mic" size={10} color={C.accent} />
                    <View>
                        <Text style={{ fontSize: 10, color: C.ink }}>{t.pitch}</Text>
                        <Text style={{ fontSize: 7, color: C.mid }}>{t.stage}</Text>
                    </View>
                </View>
            </View>

            <EuropeMap map={data.map} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 5, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }} />
                    <Text style={{ fontSize: 6.5, color: C.mid }}>{fill(t.legendLive, v)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: C.ink, backgroundColor: "#ffffff" }} />
                    <Text style={{ fontSize: 6.5, color: C.mid }}>{fill(t.legendPreview, v)}</Text>
                </View>
            </View>

            <Kicker>{t.teamKicker}</Kicker>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                {TEAM.map(member => (
                    <View key={member.name} style={{ width: INNER / 5, alignItems: "center" }}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image src={`${ASSET_BASE}${member.image}`} style={{ width: 30, height: 30, borderRadius: 15, objectFit: "cover" }} />
                        <Text style={{ fontSize: 6, color: C.body, textAlign: "center", marginTop: 3, lineHeight: 1.3 }}>{member.name}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 10 }}>
                <QRCode value={`https://${T.contacts.site}`} size={46} />
                <View style={{ flex: 1, gap: 4 }}>
                    {contacts.map(([icon, text]) => (
                        <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <LucideIcon name={icon} size={8.5} color={C.accent} />
                            <Text style={{ fontSize: 8, color: C.body }}>{text}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* The closing statement: the site's headline, in its colours, quieter than the cover. */}
            <Accented template={t.closing} accent={t.closingAccent} style={{ fontSize: 11, color: C.ink, lineHeight: 1.35, marginTop: 14 }} />
            <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.45, marginTop: 6 }}>{t.note}</Text>
        </Panel>
    );
}

function FrontPanel({ data }: { data: ExpoData }) {
    const t = T.front;
    const v = vars(data);
    return (
        <Panel>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Brand size={34} textScale={0.5} />
                <Text style={{ fontSize: 7.5, color: C.accent, marginTop: 6 }}>.eu</Text>
            </View>

            <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 20, color: C.ink, lineHeight: 1.12 }}>{t.headline}</Text>
                <Text style={{ fontSize: 20, color: C.accent, lineHeight: 1.12 }}>{t.headlineAccent}</Text>
            </View>

            <View style={{ width: 28, height: 1.5, backgroundColor: C.accent, marginTop: 10, marginBottom: 7 }} />
            <Text style={{ fontSize: 11, color: C.ink, lineHeight: 1.45 }}>{t.statement}</Text>

            <View style={{ marginTop: 10 }}>
                <ChaniaMap data={data} width={INNER} />
                <Text style={{ fontSize: 6.5, color: C.mid, marginTop: 5, lineHeight: 1.4 }}>{fill(t.mapCaption, v)}</Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 8, marginBottom: 10 }}>
                {t.stats.map((stat, i) => (
                    <View key={stat.label} style={{ flex: 1, borderLeftWidth: i === 0 ? 0 : 0.5, borderLeftColor: C.line, paddingLeft: i === 0 ? 0 : 8 }}>
                        <Text style={{ fontSize: 16, color: i === 0 ? C.accent : C.ink }}>{fill(stat.value, v)}</Text>
                        <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.35, marginTop: 2 }}>{stat.label}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.4 }}>{fill(t.footer, v)}</Text>
                <Text style={{ fontSize: 8, color: C.ink, textAlign: "right", lineHeight: 1.35 }}>{T.back.stand.replace(" · ", "\n")}</Text>
            </View>
        </Panel>
    );
}

// ─── Inside ─────────────────────────────────────────────────────────────────

const FEATURE_ICONS: Array<keyof typeof ICON_PATHS> = ["fileText", "search", "bell", "mapPin", "landmark"];

/** Image first, then the list: the resident's panel is the one with a product in it. */
function ResidentsPanel() {
    const t = T.residents;
    return (
        <Panel>
            <PanelTitle kicker={t.kicker} title={t.title} />
            <BrowserFrame src={`${ASSET_BASE}/brochure/${SCREENSHOT.file}`} url={SCREENSHOT.url} width={INNER} aspect={SCREENSHOT.aspect} />
            <Text style={{ fontSize: 6.8, color: C.mid, lineHeight: 1.45, marginTop: 5, marginBottom: 14 }}>{t.screenshotCaption}</Text>
            {t.features.map((feature, i) => (
                <Feature key={feature.title} icon={FEATURE_ICONS[i] ?? "fileText"} title={feature.title} text={feature.text} />
            ))}
        </Panel>
    );
}

function RuledItem({ title, text, last = false }: { title: string; text: string; last?: boolean }) {
    return (
        <View style={{ paddingVertical: 9, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: C.line }}>
            <Text style={{ fontSize: 10.5, color: C.ink }}>{title}</Text>
            <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginTop: 2 }}>{text}</Text>
        </View>
    );
}

/** Tinted panel in the middle of the spread: one big number, a ruled list, the Europe list in a card, a big line. */
function StaffPanel({ data }: { data: ExpoData }) {
    const t = T.staff;
    return (
        <Panel style={{ backgroundColor: C.surface }}>
            <PanelTitle kicker={t.kicker} title={t.title} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, marginBottom: 6 }}>
                <Text style={{ fontSize: 44, color: C.accent, lineHeight: 1 }}>{t.bigNumber}</Text>
                <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.45, flex: 1 }}>{t.bigNumberText}</Text>
            </View>

            <View style={{ borderTopWidth: 0.5, borderTopColor: C.line }}>
                {t.items.map((item, i) => (
                    <RuledItem key={item.title} title={item.title} text={item.text} last={i === t.items.length - 1} />
                ))}
            </View>

            <View style={{ backgroundColor: "#ffffff", borderWidth: 0.5, borderColor: C.line, borderRadius: 6, padding: 10, marginTop: 8 }}>
                <Kicker>{t.cardsKicker}</Kicker>
                {data.cards.map((card, i) => (
                    <View key={card.title} style={{ flexDirection: "row", gap: 8, marginBottom: i === data.cards.length - 1 ? 0 : 6 }}>
                        <Text style={{ width: 46, fontSize: 7.5, color: C.accent }}>{card.city}</Text>
                        <Text style={{ flex: 1, fontSize: 7.5, color: C.body, lineHeight: 1.4 }}>
                            {card.title} · {fmtDate(card.date)}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={{ flex: 1 }} />

            <Accented template={t.punchline} accent={t.punchlineAccent} style={{ fontSize: 13, color: C.ink, lineHeight: 1.35 }} />
        </Panel>
    );
}

function Step({ number, title, text, last = false }: { number: string; title: string; text: string; last?: boolean }) {
    return (
        <View style={{ flexDirection: "row", gap: 10, paddingBottom: last ? 0 : 18 }}>
            <Text style={{ width: 26, fontSize: 19, color: C.accent, lineHeight: 1, marginTop: 1 }}>{number}</Text>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.ink }}>{title}</Text>
                <Text style={{ fontSize: 9, color: C.body, lineHeight: 1.5, marginTop: 3 }}>{text}</Text>
            </View>
        </View>
    );
}

function HowItWorksPanel() {
    const t = T.how;
    return (
        <Panel>
            <PanelTitle kicker={t.kicker} title={t.title} />
            <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginBottom: 14 }}>{t.intro}</Text>
            {t.steps.map((step, i) => (
                <Step key={step.title} number={String(i + 1)} title={step.title} text={step.text} last={i === t.steps.length - 1} />
            ))}

            <View style={{ flex: 1 }} />

            <View style={{ backgroundColor: C.surface, borderRadius: 6, padding: 12 }}>
                <Kicker>{t.awardsKicker}</Kicker>
                {t.awards.map((award, i) => (
                    <View key={award.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: i === t.awards.length - 1 ? 0 : 5 }}>
                        <LucideIcon name="award" size={9} color={C.accent} />
                        <Text style={{ flex: 1, fontSize: 7.5, color: C.body, lineHeight: 1.4 }}>
                            <Text style={{ color: C.ink }}>{award.title}</Text> · {award.detail}
                        </Text>
                    </View>
                ))}
            </View>
        </Panel>
    );
}

// ─── Document ───────────────────────────────────────────────────────────────

export function ExpoLeafletPdf({ data }: { data: ExpoData }) {
    const page = { fontFamily: "Relative", flexDirection: "row" as const, backgroundColor: "#ffffff" };
    return (
        <Document title="OpenCouncil at Smart City Expo World Congress 2026" author="OpenCouncil" language="en">
            <Page size="A4" orientation="landscape" style={page}>
                <FoldTicks />
                <FlapPanel data={data} />
                <BackPanel data={data} />
                <FrontPanel data={data} />
            </Page>
            <Page size="A4" orientation="landscape" style={page}>
                <FoldTicks />
                <ResidentsPanel />
                <StaffPanel data={data} />
                <HowItWorksPanel />
            </Page>
        </Document>
    );
}
