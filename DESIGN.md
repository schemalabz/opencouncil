---
name: OpenCouncil
description: Open-source platform making Greek municipal council meetings transparent, searchable, and understandable.
colors:
  civic-flame: "#ff6600"
  flame-deep: "#fc550a"
  marble-blue: "#a4c0e1"
  ink: "#0c0a09"
  graphite: "#1c1917"
  ink-soft: "#78716c"
  stone-mist: "#f5f5f4"
  cloud-border: "#e7e5e4"
  paper: "#ffffff"
  paper-warm: "#fafaf9"
  signal-red: "#ef4444"
typography:
  headline:
    fontFamily: "Relative Book Pro, Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Relative Book Pro, Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Relative Book Pro, Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Relative Book Pro, Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  transcript:
    fontFamily: "Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "Roboto Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  none: "0px"
  card: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.civic-flame}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.marble-blue}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "40px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.civic-flame}"
    typography: "{typography.label}"
  badge:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper-warm}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: OpenCouncil

## 1. Overview

OpenCouncil is a transparency platform for Greek municipal council meetings. The interface exists to present a public record — verbatim transcripts, votes, and decisions — with minimal friction. The record is the content; the UI is a neutral container for it.

The visual system is built on white surfaces, a warm-stone neutral ramp, sharp (square) corners by default, and plain typography. It uses a single saturated accent — Civic Flame orange (`--orange: 24 100% 50%`) — applied only to primary actions, links, inline emphasis, and live/highlight moments. One sanctioned gradient (Civic Flame → Marble Blue) is reserved for thin borders and brand moments; it is never used on text or as a surface fill.

Design intent: high information density is acceptable; decoration is not. AI-generated content (summaries, subject extraction) is always visually labeled and rendered subordinate to the verbatim record.

The system deliberately avoids three reference styles:
- **Government-portal style** — dense menus, PDF-first layouts, institutional gray-blue, legalese-heavy walls of text.
- **Generic SaaS style** — purple gradients, hero metrics, repeated identical card grids.
- **Campaign style** — many competing colors, banners, and pervasive urgency cues.

**Key characteristics:**
- White surfaces (`--background`/`--card`) over a warm-stone neutral ramp; sharp corners by default (`--radius: 0rem`).
- One saturated accent (Civic Flame), used sparingly at decisive moments only.
- One sanctioned gradient (Civic Flame → Marble Blue) for thin borders and brand moments.
- Three typographic roles with fixed jobs: UI chrome (Relative Book Pro), the record (Roboto), timestamps (Roboto Mono).
- Flat-leaning surfaces; soft shadows signal interactivity, not decoration.
- WCAG 2.1 AA: ≥4.5:1 body-text contrast, visible focus rings, reduced-motion alternatives.

The component register in one line: **square, plain, exact controls, with the orange accent and brand gradient reserved for primary actions and hover states.**

## 2. Colors: Civic Flame & Marble Blue

A restrained warm-stone neutral field with one hot accent and one cool counterweight.

### Primary
- **Civic Flame** (#ff6600, `--orange: 24 100% 50%`): Democratic energy. Primary action buttons, link-style buttons, highlight moments. This is the citizen's voice made visible — and its rarity is what keeps it loud.
- **Civic Flame Deep** (#fc550a, `--gradient-orange: 16 97% 52%`): The hotter end of the brand gradient. Inline emphasis (`em` renders in this color), the 15%-opacity highlight tint on targeted transcript utterances, and the gradient's hot endpoint. Never a standalone surface fill.

### Secondary
- **Marble Blue** (#a4c0e1, `--accent: 212 50% 76%`): Institutional calm, like veined marble in a public building. Secondary buttons, subtle hover tints (10% opacity washes on outline buttons), and the cool endpoint of the brand gradient (the card and gradient-button components hardcode the literal #a4c0e1). It cools the flame; it never competes with it. Note: `--gradient-blue: 213 49% 73%` (≈#98b7dc) is defined in `globals.css` but currently unused by any component — treat `--accent` as the canonical Marble Blue token.

### Neutral
- **Ink** (#0c0a09, `--foreground`): Body text and focus rings. Warm near-black, never pure black.
- **Graphite** (#1c1917, `--primary`): Dark fills — default badges, the skip-link, primary-on-dark contexts.
- **Soft Ink** (#78716c, `--muted-foreground`): Secondary text, placeholders, captions. Passes 4.5:1 on white; do not lighten it further.
- **Stone Mist** (#f5f5f4, `--secondary` / `--muted`): Quiet panel and chip backgrounds; the second neutral layer behind sidebars and toolbars (sidebar uses #fafafa).
- **Cloud Border** (#e7e5e4, `--border` / `--input`): Hairline borders and input strokes. The structural line of the whole system.
- **Paper** (#ffffff, `--background` / `--card`): The default surface. The glass walls are white.
- **Warm Paper** (#fafaf9, `--primary-foreground`): Text on dark fills.
- **Signal Red** (#ef4444, `--destructive`): Destructive actions and errors only. Never decorative.

The canonical source of truth is the HSL custom-property set in `src/app/globals.css` (shadcn/stone convention, consumed as `hsl(var(--token))` via `tailwind.config.ts`). The hex values above are their sRGB equivalents.

### Named Rules
**The Civic Flame Rule.** Orange appears only where the citizen acts or the record demands attention: primary buttons, links, live emphasis, highlights. It never tints backgrounds, borders-at-rest, icons-by-default, or any inactive state. If orange covers more than ~10% of a screen, the screen is wrong.

**The One Gradient Rule.** Exactly one gradient exists: Civic Flame Deep → Marble Blue (→ back to flame). It is permitted on 1–1.5px borders (card hover, the gradient button outline) and brand moments — never on text, never as a surface fill, never as a third color scheme.

## 3. Typography

**UI Font:** Relative Book Pro (with Inter variable as loaded fallback)
**Record Font:** Roboto (variable, 100–900)
**Mono Font:** Roboto Mono (timestamps, code)

**Character:** A plain-spoken civic voice. Relative Book Pro gives the interface a slightly characterful, humanist warmth at a single weight; Roboto renders the verbatim record with newspaper neutrality; Roboto Mono timestamps it with archival precision.

### Hierarchy
- **Headline** (600, 1.5rem / 24px, 1.2, -0.025em): Card titles and section headings (`text-2xl font-semibold tracking-tight`). Page-level `h2` defaults to 24px regular, centered.
- **Title** (500, 1.125rem / 18px, 1.4): Sub-headings, header breadcrumb on desktop.
- **Body** (400, 1rem / 16px, 1.5): Default prose. Cap prose at 65–75ch; data tables may run denser.
- **Label** (500, 0.875rem / 14px): Buttons, inputs, navigation, form labels — the working size of the product UI. Badges drop to 12px semibold.
- **Transcript** (Roboto 400, 1rem, 1.5): The public record itself (`.transcript-text`). Optimized for long-form reading with native content-visibility virtualization.
- **Mono** (Roboto Mono 400, 0.875rem): Timestamps, IDs, code.

### Named Rules
**The Two Voices Rule.** The interface speaks Relative Book Pro; the record speaks Roboto. Never set transcript text in the UI font, and never set UI chrome in Roboto. The font switch IS the trust boundary between platform and record.

**The Fixed Scale Rule.** Product surfaces use the fixed rem scale above — no fluid/clamp typography outside marketing pages. A heading that resizes with the viewport has no place in a transcript reader.

## 4. Elevation

Quiet ambient lift. Surfaces are flat-leaning, but shadows are soft and meaningful: interactive things sit slightly above the page to signal they can be touched. Cards rest at a whisper (`shadow-sm`); buttons carry a touch more presence (`shadow-md`); overlays (dialogs, popovers, dropdowns) earn the largest shadows because they are literally above the page. Depth is never used to decorate static content — structure at rest comes from Cloud Border hairlines and spacing.

### Shadow Vocabulary
Each role maps to the Tailwind class the codebase actually uses:

- **Whisper** (`shadow-sm`, `box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Cards and resting containers.
- **Lift** (`shadow-md`, `box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Primary and secondary buttons; elements inviting touch.
- **Float** (`shadow-lg`, `box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): Overlays only — dialogs, dropdowns, popovers, toasts.

### Named Rules
**The Touchable Lift Rule.** A shadow is a promise of interactivity. If an element casts more than a whisper and isn't clickable, remove the shadow.

## 5. Layout & Breakpoints

A single mobile-first breakpoint scale, defined in `tailwind.config.ts`. Screens are designed for the citizen on a phone first; wider viewports add room, never new structure.

### Breakpoints
- **xs** (480px): Large phones — the smallest width that earns layout changes beyond the base.
- **sm** (640px): Landscape phones / small tablets.
- **md** (768px): Tablets — the breakpoint where sidebars and breadcrumbs expand (e.g. header links scale 14→18px).
- **lg** (1024px): Small laptops — the primary desktop target for the journalist workflow.
- **xl** (1280px): Standard desktop.
- **2xl** (1536px): Large desktop.

### Container
The centered `container` pads at **2rem** and caps its width at **1400px** from the `2xl` breakpoint up — content stops widening before the viewport does, so the record never sprawls into unreadable line lengths on large monitors. (Note: the container's `2xl` cap of 1400px is intentionally below the `2xl` *screen* value of 1536px.)

### Named Rules
**The Mobile-First Rule.** Design the base (phone) layout first; every breakpoint above only adds. The least-technical citizen on a phone is the primary reader, per PRODUCT.md — a screen that only works at `lg` has failed its first audience.

**The Capped Measure Rule.** Wide viewports gain margin, not measure. Combined with the 65–75ch prose cap (§3), the 1400px container keeps the record legible from phone to 4K.

## 6. Iconography

**Canonical set: [Lucide](https://lucide.dev) (`lucide-react`).** Clean, geometric, single-weight line icons that match the system's quiet-precision register without competing with Civic Flame. `react-icons` also appears in the codebase for a few brand/legacy glyphs, but Lucide is the default — new screens should reach for it first.

- **Style:** Line icons at the inherited stroke; default to the text color of their context (`currentColor`), not a standalone accent. Icons are chrome, not action — an icon turns Civic Flame only when it *is* the primary action (per The Civic Flame Rule, §2).
- **Sizing:** Match the optical size of adjacent Label text (≈16px in 14px UI contexts); never larger than the text they accompany unless the icon is the sole content of a touch target.
- **Touch targets:** Icon-only buttons still honor the 40px minimum (§7 Buttons / accessibility) — pad the hit area, don't grow the glyph.

### Named Rules
**The One Icon Set Rule.** Lucide is the system's voice for icons; don't mix in a second line-icon library. Consistency of stroke and corner is part of "quiet precision" — a stray icon set reads as clutter the same way a third accent color does.

## 7. Components

Square, plain, exact — with warmth reserved for action and hover.

### Buttons
- **Shape:** Sharp corners (0px — the radius token is `0rem`); only the oversized `xl` marketing button earns 12px.
- **Primary:** Civic Flame fill (#ff6600), white label (14px / 500), 40px tall, 16px horizontal padding, Lift shadow.
- **Hover / Focus:** Hover dims the fill to 90% opacity (150ms color transition); focus shows a 2px Ink ring offset 2px from the edge. Disabled drops to 50% opacity.
- **Secondary:** Marble Blue fill, Graphite label, same geometry and shadow.
- **Outline:** Paper background, 1px Cloud Border, hover washes Marble Blue at 10%.
- **Ghost / Link:** Ghost is transparent until hover; Link is Civic Flame text with underline on hover.
- **Gradient (brand moments only):** Paper fill wrapped in a 1px animated Civic Flame → Marble Blue border. Subject to The One Gradient Rule.

### Badges
- **Style:** Full-round pill, 12px semibold, 10px horizontal padding.
- **Variants:** Default Graphite fill with Warm Paper text; secondary Stone Mist; destructive Signal Red; outline transparent with Ink text. AI-generated content always carries its dedicated AI badge — fidelity labeling is non-negotiable.

### Cards / Containers (signature component)
- **Corner Style:** 8px by default; some featured and marketing cards use 12px (`rounded-xl`).
- **Background:** Paper, framed by a 1.5px gradient border that rests as quiet gray (gray-300 → gray-200 → gray-300).
- **Hover:** The resting gray border ignites into the animated Civic Flame → Marble Blue gradient (300ms ignition; the card's inline animation loops at 5s, while the gradient button runs the same `gradientFlow` keyframes at 3s via `animate-gradientFlow`) — the system's signature warm moment.
- **Shadow Strategy:** Whisper at rest (see Elevation).
- **Internal Padding:** 24px (`p-6`) headers and content.

### Inputs / Fields
- **Style:** 40px tall, sharp corners, 1px Cloud Border stroke on Paper, 14px text, 12px horizontal padding.
- **Focus:** 2px Ink ring offset 2px — the same focus vocabulary as buttons, everywhere.
- **Placeholder:** Soft Ink. **Error / Disabled:** Signal Red border via form-message context; disabled at 50% opacity with `not-allowed` cursor.

### Navigation
- **Header:** Breadcrumb path with municipality logos, Label-size links (scaling 14→18px across breakpoints), `hover:text-primary` color transition, chevron separators. Auto-scrolling title for long Greek meeting names.
- **Sidebar:** Second neutral layer (#fafafa) with its own muted token set; collapses on mobile via the sidebar trigger.
- **Skip link:** First focusable element, Graphite fill — accessibility is part of the navigation design, not an afterthought.

### The Transcript Surface (signature component)
The record itself: Roboto at 16px/1.5, speaker segments with sticky headers, utterances with `scroll-margin-top: 25vh` so deep links land below the sticky chrome, and `content-visibility: auto` for native virtualization of hours-long meetings. Timestamps in Roboto Mono. The transcript page is the purest expression of the Glass Town Hall: maximum record, minimum building.

### Named Rules
**The Sharp Default Rule.** Corners are square unless a shape earns curvature: cards (8px, or 12px for featured cards), pills (full), the xl marketing button (12px). Nothing else rounds.

## 8. Do's and Don'ts

### Do:
- **Do** spend the flame palette (#ff6600 / #fc550a) only on primary actions, links, inline emphasis, and highlights — rarity is the point.
- **Do** keep the record verbatim and visually distinct: Roboto for transcript text, Roboto Mono for timestamps, and an explicit AI badge on every AI-generated summary or categorization.
- **Do** use the same focus vocabulary everywhere: 2px Ink ring, 2px offset, on every interactive element.
- **Do** hold body text at ≥4.5:1 contrast (Ink or Soft Ink on Paper — nothing lighter than #78716c).
- **Do** ship every interactive component with default, hover, focus-visible, and disabled states, and provide `prefers-reduced-motion` alternatives for the gradient-flow and marquee animations.
- **Do** design for the least-technical citizen: 40px+ touch targets, plain Greek before civic jargon, one obvious action per screen.

### Don't:
- **Don't** use bureaucratic portal patterns — no dense nested menus, PDF-first layouts, institutional gray-blue, or walls of unbroken administrative text.
- **Don't** use marketing-site patterns — no decorative gradients, oversized hero metrics, or repeated identical card grids.
- **Don't** use urgency or clutter patterns — no stacked banners, no persistent urgency cues, and no third accent color.
- **Don't** put the brand gradient on text or surface fills; it lives on thin borders and brand moments only (The One Gradient Rule).
- **Don't** use `border-left` stripes thicker than 1px as colored accents on cards, callouts, or alerts.
- **Don't** round corners outside the sanctioned set (0 / 8px cards / 12px featured cards and xl buttons / full pills), and don't introduce new shadows outside Whisper/Lift/Float.
- **Don't** color inactive states — orange and Marble Blue belong to action and selection, never to resting chrome.
- **Don't** add decorative motion in the product register: motion conveys state (hover ignition, accordion, loading) in 150–300ms; no orchestrated page-load choreography.
