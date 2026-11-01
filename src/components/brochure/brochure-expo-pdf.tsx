/**
 * Trifold A4 leaflet for Smart City Expo World Congress 2026 (English), on the
 * same primitives and fold as the Greek councillor brochure.
 *
 *   Page 1 (outside): [flap: live in Greece + quote + demo | back: find us, map, team | front]
 *   Page 2 (inside):  [for residents | for council staff | how it works + awards]
 *
 * Data comes from the opencouncil.eu site snapshot (public/brochure/expo-data.json).
 */
import { Document, Page, View, Text, Image, Svg, Path, Circle } from "@react-pdf/renderer";
import { ASSET_BASE, Brand, C, LucideIcon, QRCode } from "@/components/pdf/shared";
import type { ICON_PATHS } from "@/components/pdf/shared";
import { TEAM_MEMBERS } from "@/components/about/config";
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

const SITE = "opencouncil.eu";
const EMAIL = "contact@opencouncil.eu";
const WHATSAPP = "+30 698 058 6851";
const EXPO = { name: "Smart City Expo World Congress", when: "3–5 Nov 2026 · Fira Gran Via, Barcelona", stand: "Hall 3 · Stand S20", area: "Innovation Playground", pitch: "Pitch · Wed 4 Nov, 16:05", stage: "Innovation Playground Stage" };

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

const WA = { sender: "#1fa855", ink: "#111b21", muted: "#667781", link: "#027eb5" };
const STREET: Record<number, { color: string; width: number }> = {
    1: { color: "#dedede", width: 0.55 },
    2: { color: "#cfcfcf", width: 0.95 },
    3: { color: "#bdbdbd", width: 1.4 },
};

/** One Notis message, as a resident sees it: the sender, the text, the subject, the link. */
function NotisBubble({ pin, width }: { pin: ExpoData["chania"]["pin"]; width: number }) {
    return (
        <View style={{ width, backgroundColor: "#ffffff", borderRadius: 8, borderTopLeftRadius: 2, padding: 8, borderWidth: 0.5, borderColor: C.line }}>
            <Svg width={8} height={10} style={{ position: "absolute", left: -7.5, top: 0 }}>
                <Path d="M8,0 L0,0 L8,9 Z" fill="#ffffff" stroke={C.line} strokeWidth={0.5} />
            </Svg>
            <Text style={{ fontSize: 6.5, color: WA.sender, marginBottom: 3 }}>Notis · OpenCouncil Chania</Text>
            <Text style={{ fontSize: 7, color: WA.ink, lineHeight: 1.45 }}>
                In tonight’s municipal committee meeting, a subject affecting your street was discussed:
            </Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 5 }}>
                <LucideIcon name="mapPin" size={8} color={C.accent} />
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 7, color: WA.ink, lineHeight: 1.35 }}>{pin.title}</Text>
                    <Text style={{ fontSize: 6, color: WA.muted, marginTop: 1 }}>
                        {pin.place} · {fmtDate(pin.date)}
                    </Text>
                </View>
            </View>
            <Text style={{ fontSize: 7, color: WA.link, marginTop: 5 }}>View the summary and decision →</Text>
            <Text style={{ fontSize: 5.5, color: WA.muted, textAlign: "right", marginTop: 1 }}>21:14</Text>
        </View>
    );
}

/** Chania's streets with the subject's pin and the message beside it. */
function ChaniaMap({ chania, width }: { chania: ExpoData["chania"]; width: number }) {
    const h = (chania.height / chania.width) * width;
    const k = width / chania.width;
    const pinX = chania.pin.x * k;
    const pinY = chania.pin.y * k;
    const bubbleW = 138;
    return (
        <View style={{ width, height: h, borderRadius: 8, backgroundColor: "#f5f5f4", borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>
            <Svg width={width} height={h} viewBox={`0 0 ${chania.width} ${chania.height}`}>
                {chania.streets.map(street => (
                    <Path key={street.w} d={street.d} fill="none" stroke={STREET[street.w]?.color ?? "#dedede"} strokeWidth={(STREET[street.w]?.width ?? 0.6) / k} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                <Path d={chania.coast} fill="none" stroke="#a3a3a3" strokeWidth={1.1 / k} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={chania.pin.x} cy={chania.pin.y} r={13 / k} fill={C.accent} opacity={0.16} />
                <Circle cx={chania.pin.x} cy={chania.pin.y} r={4.5 / k} fill={C.accent} stroke="#ffffff" strokeWidth={1.4 / k} />
            </Svg>
            {chania.labels.map(label => (
                <Text key={label.text} style={{ position: "absolute", left: label.x * k, top: label.y * k, fontSize: 6, color: C.mid, letterSpacing: 0.4 }}>
                    {label.text.toUpperCase()}
                </Text>
            ))}
            <View style={{ position: "absolute", left: pinX + 14, top: pinY - 8, width: bubbleW }}>
                <NotisBubble pin={chania.pin} width={bubbleW} />
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
    return (
        <Panel style={{ backgroundColor: C.surface }}>
            <Kicker>{`Live in ${data.counts.live} municipalities in Greece`}</Kicker>
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
                <Kicker>Now opening across Europe</Kicker>
                <Text style={{ fontSize: 12, color: C.ink, lineHeight: 1.3 }}>See it on your own council’s meeting.</Text>
                <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginTop: 5 }}>
                    Tell us the name of your council. Within 24 hours you get a link to one of its meetings, on the record. Free.
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <QRCode value={`https://${SITE}/#request`} size={56} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.ink, lineHeight: 1.3 }}>Scan to request a free demo</Text>
                        <Text style={{ fontSize: 7, color: C.mid, marginTop: 3 }}>{SITE}/#request</Text>
                    </View>
                </View>
                <Text style={{ fontSize: 6.8, color: C.mid, lineHeight: 1.45, marginTop: 10 }}>
                    Already previewed in {data.counts.preview} European cities: {data.preview.map(c => c.name).join(" · ")}
                </Text>
            </View>
        </Panel>
    );
}

function BackPanel({ data }: { data: ExpoData }) {
    return (
        <Panel>
            <View style={{ borderLeftWidth: 2, borderLeftColor: C.accent, backgroundColor: C.surface, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 12 }}>
                <Kicker>Find us in Barcelona</Kicker>
                <Text style={{ fontSize: 13, color: C.ink, lineHeight: 1.25 }}>{EXPO.name}</Text>
                <Text style={{ fontSize: 7.5, color: C.body, marginTop: 2 }}>{EXPO.when}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 7, alignItems: "flex-start" }}>
                    <LucideIcon name="mapPin" size={10} color={C.accent} />
                    <View>
                        <Text style={{ fontSize: 10, color: C.ink }}>{EXPO.stand}</Text>
                        <Text style={{ fontSize: 7, color: C.mid }}>{EXPO.area}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 5, alignItems: "flex-start" }}>
                    <LucideIcon name="mic" size={10} color={C.accent} />
                    <View>
                        <Text style={{ fontSize: 10, color: C.ink }}>{EXPO.pitch}</Text>
                        <Text style={{ fontSize: 7, color: C.mid }}>{EXPO.stage}</Text>
                    </View>
                </View>
            </View>

            <EuropeMap map={data.map} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 5, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }} />
                    <Text style={{ fontSize: 6.5, color: C.mid }}>{data.counts.live} live councils in Greece</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: C.ink, backgroundColor: "#ffffff" }} />
                    <Text style={{ fontSize: 6.5, color: C.mid }}>{data.counts.preview} previews in {data.counts.countries - 1} more countries</Text>
                </View>
            </View>

            <Kicker>The team</Kicker>
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
                <QRCode value={`https://${SITE}`} size={46} />
                <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="mail" size={8.5} color={C.accent} />
                        <Text style={{ fontSize: 8, color: C.body }}>{EMAIL}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="phone" size={8.5} color={C.accent} />
                        <Text style={{ fontSize: 8, color: C.body }}>{WHATSAPP}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <LucideIcon name="globe" size={8.5} color={C.accent} />
                        <Text style={{ fontSize: 8, color: C.body }}>{SITE}</Text>
                    </View>
                </View>
            </View>

            {/* The closing statement: the site's headline, in its colours, quieter than the cover. */}
            <Text style={{ fontSize: 11, color: C.ink, lineHeight: 1.35, marginTop: 14 }}>
                OpenCouncil is the system of record for <Text style={{ color: C.accent }}>local government democracy</Text>.
            </Text>
            <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.45, marginTop: 6 }}>
                OpenCouncil P.C. is wholly owned by Schema Labs, a non-profit based in Athens. Open source under the AGPL v3 licence.
            </Text>
        </Panel>
    );
}

function FrontPanel({ data }: { data: ExpoData }) {
    const stats = [
        { value: String(data.counts.live), label: "live councils\nin Greece" },
        { value: String(data.counts.preview), label: "European cities\npreviewed" },
        { value: "1,000+", label: "hours of meetings\non the record" },
    ];
    return (
        <Panel>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Brand size={34} textScale={0.5} />
                <Text style={{ fontSize: 7.5, color: C.accent, marginTop: 6 }}>.eu</Text>
            </View>

            <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 20, color: C.ink, lineHeight: 1.12 }}>Your council already meets in public.</Text>
                <Text style={{ fontSize: 20, color: C.accent, lineHeight: 1.12 }}>Make the city pay attention.</Text>
            </View>

            <View style={{ width: 28, height: 1.5, backgroundColor: C.accent, marginTop: 10, marginBottom: 7 }} />
            <Text style={{ fontSize: 11, color: C.ink, lineHeight: 1.45 }}>
                We carefully transcribe city council sessions and turn them into summarised subjects, WhatsApp updates for citizens, and official minutes for staff.
            </Text>

            <View style={{ marginTop: 10 }}>
                <ChaniaMap chania={data.chania} width={INNER} />
                <Text style={{ fontSize: 6.5, color: C.mid, marginTop: 5, lineHeight: 1.4 }}>
                    Chania, {fmtDate(data.chania.pin.date)}. A real subject, and the message residents of the street received about it.
                </Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 8, marginBottom: 10 }}>
                {stats.map((stat, i) => (
                    <View key={stat.label} style={{ flex: 1, borderLeftWidth: i === 0 ? 0 : 0.5, borderLeftColor: C.line, paddingLeft: i === 0 ? 0 : 8 }}>
                        <Text style={{ fontSize: 16, color: i === 0 ? C.accent : C.ink }}>{stat.value}</Text>
                        <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.35, marginTop: 2 }}>{stat.label}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Text style={{ fontSize: 6.5, color: C.mid, lineHeight: 1.4 }}>{`${EXPO.name}\nBarcelona · 3–5 Nov 2026`}</Text>
                <Text style={{ fontSize: 8, color: C.ink, textAlign: "right", lineHeight: 1.35 }}>{EXPO.stand.replace(" · ", "\n")}</Text>
            </View>
        </Panel>
    );
}

// ─── Inside ─────────────────────────────────────────────────────────────────

/** Image first, then the list: the resident's panel is the one with a product in it. */
function ResidentsPanel() {
    return (
        <Panel>
            <PanelTitle kicker="For residents" title="Hours-long meetings, understood in minutes." />
            <BrowserFrame src={`${ASSET_BASE}/brochure/salzburg-subject.png`} url="opencouncil.at/salzburg" width={INNER} aspect={2560 / 1480} />
            <Text style={{ fontSize: 6.8, color: C.mid, lineHeight: 1.45, marginTop: 5, marginBottom: 14 }}>
                Salzburg City Council, 21 Oct 2026: “A €13 million shared space for three old town squares”, from a debate in German. Speech recognition handles most European languages well.
            </Text>
            <Feature icon="fileText" title="Subjects and summaries" text="Every meeting is split into subjects. For each one: a summary, each speaker’s position in brief, the video and the decision." />
            <Feature icon="search" title="Search" text="Search everything that has been said, in every meeting." />
            <Feature icon="bell" title="WhatsApp updates" text="Residents get a message whenever the council discusses their street, their neighbourhood or a subject they follow." />
            <Feature icon="mapPin" title="Subject map" text="The council’s subjects on the map. Zoom into any area, neighbourhood and street." />
            <Feature icon="landmark" title="Councillors and parties" text="Every member’s page: what they spoke on, for how long, and where they stood on each subject." />
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
    return (
        <Panel style={{ backgroundColor: C.surface }}>
            <PanelTitle kicker="For council staff" title="What took days now takes hours." />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, marginBottom: 6 }}>
                <Text style={{ fontSize: 44, color: C.accent, lineHeight: 1 }}>48h</Text>
                <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.45, flex: 1 }}>
                    from the end of the meeting to a transcript of every word, every speaker recognised, checked by a person.
                </Text>
            </View>

            <View style={{ borderTopWidth: 0.5, borderTopColor: C.line }}>
                <RuledItem title="Minutes ready to sign" text="The meeting’s minutes, with attendance, votes and decisions, ready for review and signature." />
                <RuledItem title="Open API and MCP server" text="The record is open data. Query it through the public API, or ask about your council in Claude or ChatGPT." />
                <RuledItem title="Your data, in Europe" text="Hosted in the EU, GDPR compliant, open source. European or self-hosted models when your policy asks for it." last />
            </View>

            <View style={{ backgroundColor: "#ffffff", borderWidth: 0.5, borderColor: C.line, borderRadius: 6, padding: 10, marginTop: 8 }}>
                <Kicker>What European councils discussed</Kicker>
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

            <Text style={{ fontSize: 13, color: C.ink, lineHeight: 1.35 }}>
                OpenCouncil replaces the company that writes your minutes today, <Text style={{ color: C.accent }}>at a similar cost and with ten times the use.</Text>
            </Text>
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

const AWARDS: Array<[string, string]> = [
    ["Digital Governance Award", "Best Applied Idea in Local Government, Greek Ministry of Digital Governance"],
    ["European Public Sector Award 2025–26", "Good Practice Certificate, EIPA"],
    ["Innovation in Politics Awards 2026", "Finalist"],
    ["7th Guangzhou International Award for Urban Innovation", "Finalist"],
    ["OECD.AI Policy Navigator", "the OECD catalogue of AI in the public sector"],
];

function HowItWorksPanel() {
    return (
        <Panel>
            <PanelTitle kicker="How it works" title="One video of the meeting in. Everything else out." />
            <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.5, marginBottom: 14 }}>
                Nothing to install. The stream your council already runs is enough.
            </Text>
            <Step number="1" title="The meeting" text="The council’s own stream or recording, as it is." />
            <Step number="2" title="Carefully transcribed" text="Every word and every speaker, checked by a person. Then subjects, summaries and decisions." />
            <Step number="3" title="Published and searchable" text="Each subject on its own page, in search, on the map. The record of the city." />
            <Step number="4" title="Sent to the people it concerns" text="A WhatsApp message to the residents who follow the subject. Minutes to the staff who sign them." last />

            <View style={{ flex: 1 }} />

            <View style={{ backgroundColor: C.surface, borderRadius: 6, padding: 12 }}>
                <Kicker>Awards and mentions</Kicker>
                {AWARDS.map(([title, detail], i) => (
                    <View key={title} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: i === AWARDS.length - 1 ? 0 : 5 }}>
                        <LucideIcon name="award" size={9} color={C.accent} />
                        <Text style={{ flex: 1, fontSize: 7.5, color: C.body, lineHeight: 1.4 }}>
                            <Text style={{ color: C.ink }}>{title}</Text> · {detail}
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
