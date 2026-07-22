/**
 * Shared primitives for client-side PDF generation with @react-pdf/renderer:
 * brand fonts and colors, Greek typography helpers, a vector QR code and
 * lucide icon strokes. Used by the offer PDF and the trifold brochure.
 *
 * IMPORTANT react-pdf gotcha: never set `lineHeight` on the Page style. It is
 * inherited as a *computed* value (page fontSize × multiplier), so any larger
 * text gets squeezed into a tiny line box and overlaps its neighbours. Always
 * pair lineHeight with the fontSize it applies to.
 *
 * Renders both in the browser (lazy-loaded) and in Node (scripts/tests via
 * renderToFile) — asset URLs resolve accordingly.
 */
import { Svg, Path, Circle, Font, View, Text, Image } from "@react-pdf/renderer";
import qrcode from "qrcode-generator";

// ─── Assets (browser: same-origin URLs · Node: filesystem paths) ────────────
export const ASSET_BASE =
    typeof window !== "undefined"
        ? window.location.origin
        : `${process.cwd()}/public`;

// Full-charset static Inter TTFs (Latin + Greek). The app itself uses
// Inter Variable (woff2), which react-pdf can't consume — these statics are
// the same family at the same weights, so the PDF matches the site.
Font.register({
    family: "Inter",
    fonts: [
        { src: `${ASSET_BASE}/fonts/pdf/inter-400.ttf` },
        { src: `${ASSET_BASE}/fonts/pdf/inter-500.ttf`, fontWeight: 500 },
        { src: `${ASSET_BASE}/fonts/pdf/inter-600.ttf`, fontWeight: 600 },
        { src: `${ASSET_BASE}/fonts/pdf/inter-700.ttf`, fontWeight: 700 },
    ],
});
// Brand font: Relative Pro Book (the site's primary face; Inter is only its
// fallback). Ships in a single 400 weight — bold styles resolve to the same
// face, so documents set in it must build hierarchy from size and color.
Font.register({
    family: "Relative",
    src: `${ASSET_BASE}/fonts/pdf/relative-pro-book.ttf`,
});

// Greek shouldn't be hyphenated mid-word.
Font.registerHyphenationCallback((word) => [word]);

// ─── Greek typography ────────────────────────────────────────────────────────
// Greek ALL CAPS drops the tonos: "Φεβρουαρίου" → "ΦΕΒΡΟΥΑΡΙΟΥ".
export function greekUpper(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .normalize("NFC")
        .toUpperCase();
}

// ─── Design tokens ──────────────────────────────────────────────────────────
export const C = {
    ink: "#0a0a0a",
    body: "#262626",
    mid: "#525252",
    light: "#a3a3a3",
    line: "#e5e5e5",
    surface: "#fafafa",
    // Brand orange (--orange: hsl(24 100% 50%))
    accent: "#ff8000",
    accentSoft: "#fff4eb",
};

// Logo intrinsic ratio: 1606 × 1354
export const LOGO_RATIO = 1354 / 1606;

/**
 * The OpenCouncil lockup: butterfly + wordmark. The wordmark is always
 * regular weight — never bold the logo lockup — and the butterfly stays
 * visually dominant over the letters (text ≈ 0.55 × logo width).
 */
export function Brand({ size = 18 }: { size?: number }) {
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.38 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image
                src={`${ASSET_BASE}/logo.png`}
                style={{ width: size, height: size * LOGO_RATIO }}
            />
            <Text style={{ fontSize: size * 0.55, color: C.ink }}>OpenCouncil</Text>
        </View>
    );
}

// ─── QR (vector) ────────────────────────────────────────────────────────────
export function QRCode({
    value,
    size,
    color = C.ink,
}: {
    value: string;
    size: number;
    color?: string;
}) {
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

// ─── Lucide icons (stroke paths, mirrors the web's lucide-react) ────────────
export const ICON_PATHS: Record<string, { paths: string[]; circles?: [number, number, number][] }> =
    {
        // lucide FileText
        fileText: {
            paths: [
                "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
                "M14 2v4a2 2 0 0 0 2 2h4",
                "M10 9H8",
                "M16 13H8",
                "M16 17H8",
            ],
        },
        // lucide Building2
        building2: {
            paths: [
                "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z",
                "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2",
                "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2",
                "M10 6h4",
                "M10 10h4",
                "M10 14h4",
                "M10 18h4",
            ],
        },
        // lucide Package
        package: {
            paths: [
                "m7.5 4.27 9 5.15",
                "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
                "M3.3 7 12 12l8.7-5",
                "M12 22V12",
            ],
        },
        // lucide Clock
        clock: {
            paths: ["M12 6v6l4 2"],
            circles: [[12, 12, 10]],
        },
        // lucide Receipt
        receipt: {
            paths: [
                "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z",
                "M14 8H8",
                "M16 12H8",
                "M13 16H8",
            ],
        },
        // lucide Search
        search: {
            paths: ["m21 21-4.34-4.34"],
            circles: [[11, 11, 8]],
        },
        // lucide Bell
        bell: {
            paths: [
                "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
                "M10.3 21a1.94 1.94 0 0 0 3.4 0",
            ],
        },
        // lucide MapPin
        mapPin: {
            paths: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"],
            circles: [[12, 10, 3]],
        },
        // lucide Mic
        mic: {
            paths: [
                "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",
                "M19 10v2a7 7 0 0 1-14 0v-2",
                "M12 19v3",
            ],
        },
        // lucide FileCheck
        fileCheck: {
            paths: [
                "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
                "M14 2v4a2 2 0 0 0 2 2h4",
                "m9 15 2 2 4-4",
            ],
        },
        // lucide Landmark
        landmark: {
            paths: [
                "M3 22h18",
                "M6 18v-7",
                "M10 18v-7",
                "M14 18v-7",
                "M18 18v-7",
                "m12 2 7 5H5l7-5Z",
            ],
        },
        // lucide Printer
        printer: {
            paths: [
                "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
                "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
                "M6 14h12v8H6z",
            ],
        },
        // lucide Video
        video: {
            paths: [
                "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
                "M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
            ],
        },
        // lucide Sparkles
        sparkles: {
            paths: [
                "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0Z",
            ],
        },
        // lucide Award
        award: {
            paths: [
                "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
            ],
            circles: [[12, 8, 6]],
        },
        // lucide Phone
        phone: {
            paths: [
                "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
            ],
        },
        // lucide Mail (envelope body drawn as a path — no Rect primitive here)
        mail: {
            paths: [
                "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",
                "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
            ],
        },
    };

export function LucideIcon({
    name,
    size,
    color = C.accent,
}: {
    name: keyof typeof ICON_PATHS;
    size: number;
    color?: string;
}) {
    const icon = ICON_PATHS[name];
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {icon.circles?.map(([cx, cy, r], i) => (
                <Circle
                    key={`c${i}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                />
            ))}
            {icon.paths.map((d, i) => (
                <Path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
        </Svg>
    );
}
