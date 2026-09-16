/**
 * The colours Νότης's thread is drawn in, wherever it is drawn: the city
 * page's example conversation, the signup's first-message preview, the about
 * page's demo, and the Open Graph images of the two signup flows.
 *
 * They are WhatsApp's own, because the thread is a picture of the app the
 * reader will get the message in. Plain values and no imports: the Open Graph
 * renderer reads no CSS variables, and this module is safe on both sides.
 *
 * Tailwind cannot read a constant inside an arbitrary value, so a class like
 * `bg-[#d9fdd3]` still carries its own literal. These are for the inline
 * styles — the wallpaper, and every box the renderer draws.
 */
export const NOTIS_CHAT = {
    /** The wallpaper behind the bubbles. */
    SURFACE: '#ECE5DD',
    /** Νότης's own bubble. */
    NOTIS_BUBBLE: '#ffffff',
    /** The reader's bubble. */
    USER_BUBBLE: '#d9fdd3',
    /** The text in a bubble. */
    INK: '#111B21',
    /** A timestamp, a label, a typing dot. */
    MUTED: '#667781',
} as const;

/** The faint tile WhatsApp lays over the wallpaper. */
const PATTERN = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c2b7' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

/** The wallpaper, flat. What a small pane and the Open Graph renderer use. */
export const CHAT_SURFACE = { backgroundColor: NOTIS_CHAT.SURFACE };

/** The wallpaper with its tile, for a pane large enough to show the tile. */
export const CHAT_SURFACE_PATTERNED = { ...CHAT_SURFACE, backgroundImage: PATTERN };
