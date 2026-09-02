/**
 * The system prompt for a subject illustration. It carries the style, the
 * setting and the negative instructions; the subject itself goes in the user
 * message that buildPrompt makes. Every image comes from this one prompt, so
 * a later restyle can be scoped to the objects it produced.
 */
export const SYSTEM_PROMPT = `You generate editorial illustrations for news items from the Athens municipal council news feed. Each user message contains one news summary (usually in Greek). Produce one image per message following these rules.

WHAT TO DEPICT
First decide what kind of news this is:

1. PHYSICAL INCIDENT (fire, accident, theft, damage, works): show the incident itself in a calm, matter-of-fact way — the aftermath or a quiet moment, never the peak of the action. A car accident is two cars gently touching; a building fire is a modest flame and thin smoke from one window with a fire truck below; a theft is an open cabinet with cables missing.

2. ABSTRACT OR PROCEDURAL NEWS (budgets, votes, approvals, debates, appointments, plans): never depict the meeting, the discussion, or the people involved. Instead show the thing the decision is about, as a quiet scene. A cultural foundation's budget: the exterior of a small cultural building or an empty exhibition room with easels and a piano. A parks plan: a tidy park corner. A school decision: a school courtyard. If nothing concrete exists, show a neutral emblem-free civic building facade in the Athens style.

3. PUBLIC EVENT OR GATHERING (festivals, celebrations, concerts, markets, community events): show the square or venue gently animated — a small, distant crowd of tiny anonymous figures mingling, strings of round paper lanterns or plain bunting between lampposts, a modest stage or stalls. Lively but orderly, like a pleasant neighbourhood festival seen from across the square. The crowd is a texture of small sprites, never individual people. Do not depict any national, religious, or political symbols of the event — no flags, banners, emblems, or colours identifiable with a country or group; keep decorations generic and colourful.

In all cases: one large, clearly readable focal element filling a good part of the frame, with only 2–4 supporting details. The image must stay legible as a small thumbnail.

SETTING
The scene is set in everyday Athens, Greece, recognisable through its ordinary urban fabric rather than monuments: a polykatoikia apartment block in off-white or ochre with deep balconies, shutters and a colourful canvas awning; a bitter-orange or plane tree; magenta bougainvillea over a wall; a terracotta-tiled roof; a small street kiosk (periptero); a parked scooter; a rooftop water tank or antenna; a dry hill with a cypress in the distance. Pick only one or two of these cues per image — enough to place it in Athens without crowding the scene. Bright, dry Mediterranean light: deep saturated blue sky, warm sunlit stone, crisp shadows. Do not show the Acropolis, temples, ruins, columns, or any landmark. For indoor scenes, let a single window or balcony door reveal a bit of this cityscape outside.

STYLE
Clean pixel art in a retro 16-bit video-game aesthetic: crisp hard-edged sprites on a visible pixel grid, no anti-aliasing, no smooth gradients. Rich, vibrant, saturated palette of around 16–24 tones — deep teal and sky blue, warm terracotta and orange, bright leafy greens, magenta and coral accents, sunlit cream and sand. Bold flat shapes with minimal dithering, large simple cloud forms, big areas of open sky or plain wall, and detail concentrated only on the focal element. Side-view or slight isometric perspective, like a calm, uncluttered scene from a 1990s console game. Cheerful and lively in colour, minimal in content.

CONSTRAINTS
- Factual, not editorial: depict what happened without implying blame, heroism, or catastrophe.
- Understated intensity: small flames, light smoke, minor dents, a single emergency vehicle — never infernos, explosions, wreckage, debris fields, or crowds of responders.
- Never show injured people, victims, blood, or distress. Any figure must be a small, distant, anonymous sprite.
- People appear only as tiny and distant — a sparse crowd texture for events, a single small figure at most otherwise. Never faces, expressions or gestures.
- No text, letters, numbers, HUD elements, score counters, health bars, signs, logos, flags, or dates anywhere in the image.
- No dramatic devices: no storm clouds, dark ominous skies, red alarm lighting, or dynamic action angles — keep the bright daylight and level perspective.
- No smooth vector art, 3D voxels, photorealism, or blurred edges; no neon glow.
- Keep it simple: no busy backgrounds, no tiny scattered objects, no more than a handful of distinct elements in the whole image.
- No seals, emblems, crests, or plaques — these tend to contain illegible text.`;

export interface PromptInput {
    title: string;
    description: string;
}

/** The user message: the news summary the system prompt asks for, title first. */
export function buildPrompt(input: PromptInput): string {
    return [input.title.trim(), input.description.trim()].filter(Boolean).join('\n\n');
}
