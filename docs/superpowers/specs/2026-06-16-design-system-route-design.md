# Design: `/docs/design-system` route

_Date: 2026-06-16 · Branch: `feat/initialize-design-system`_

## Problem

OpenCouncil's design material is scattered across three overlapping sources:

1. **Main repo** `src/components/ui/*` — ~60 live, production shadcn-based primitives (the real component library).
2. **Sibling `../opencouncil-design`** — a standalone Next.js docs app (`components/ui`, `components/patterns`, a playground, `Showcase`/`SidebarNav`, and `(docs)` pages). Not a git repo; not part of this build.
3. **Claude Design handoff bundle** — HTML/CSS/JSX prototypes (tokens, guideline cards, `core/`+`civic/` components, two UI kits, a `SKILL.md`, and a `readme.md` distilling `DESIGN.md`/`PRODUCT.md`).

We want one in-app page that (a) showcases the real components so it can't go stale, (b) documents what overlaps/duplicates/diverges across the folders so we can consolidate, and (c) gives a consistent way to hand OpenCouncil design context to an LLM.

## Goals

1. A route at `/[locale]/docs/design-system` that **imports and renders the live `src/components/ui` primitives** (single source of truth — nothing maintained in parallel).
2. A **cross-folder audit** (main `src/components/ui` ↔ sibling `opencouncil-design`) rendered as a table on the page **and** written to a diffable `docs/design-system-audit.md`.
3. A **"Design with LLM" dropdown** for consistent LLM handoff:
   - **Copy-to-clipboard** of four payloads: `DESIGN.md`, `PRODUCT.md`, a combined prompt preamble, and the design-system `SKILL.md`.
   - **Stable raw-text endpoints** + a **copy canonical link / pointer prompt** item (one canonical, always-fresh source).

## Non-goals (v1)

- react-live playground, tokens/foundations specimen pages, UI kits, rendering the Claude bundle.
- "Open in Claude/ChatGPT" deep links; SKILL.md download. (Considered, deferred — URL-length cap / vendor lock-in / extra step.)
- Auto-discovering all 60 `ui/` components (most need props/data/context and break when rendered bare).
- Actually adopting sibling-only components (`heading`, `text`, `callout`, …) — the audit only *flags* them.

## Approach (chosen)

**Curated living showcase.** One route imports the real primitives, renders a curated core set with their variants, shows a static main↔sibling audit table, and hosts the LLM dropdown. Rejected alternatives: auto-discovery (fragile), porting the sibling docs app (pulls in `react-live`/`prism`, recreates a parallel structure to maintain — possible future phase).

## Architecture

Route lives in the existing `(other)` group, alongside the swagger `docs/page.tsx` (which already reads a file server-side via `fs` — same pattern).

### Files

- `src/app/[locale]/(other)/docs/design-system/page.tsx` — **server component**. Reads `DESIGN.md`, `PRODUCT.md`, `_content/preamble.md`, `_content/skill.md` via `fs` at the repo root. Renders: header (title + brand one-liner + `DesignWithLLM`), the showcase sections, the audit table. Passes the read payloads to `DesignWithLLM` as props.
- `src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx` — **`"use client"`** dropdown (uses `ui/dropdown-menu`). Two groups:
  - _Copy full context_: DESIGN.md · PRODUCT.md · Combined preamble · SKILL.md → `navigator.clipboard.writeText(...)` (precedent: `consultations/PermalinkButton.tsx`).
  - _Reference_: Copy canonical link / pointer prompt — builds the pointer with `window.location.origin` (per CLAUDE.md, client-side base URL) pointing at `/api/design-context/combined`.
- `src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx` — **`"use client"`** wrapper for one registry entry: title, source path, live sample(s), and a per-component **Copy prompt** button.
- `src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx` — curated entries. Each: `{ name, sourcePath, sample: ReactNode (variants), promptHint }`. The one file that grows when a component is added to the showcase.
- `src/app/[locale]/(other)/docs/design-system/AuditTable.tsx` — presentational (server) table rendering `component-audit.ts`.
- `src/app/[locale]/(other)/docs/design-system/component-audit.ts` — the audit as typed data (see below).
- `src/app/[locale]/(other)/docs/design-system/_content/preamble.md` — role/instruction header + non-negotiable rules + pointer to canonical URLs. (`_content` = underscore-prefixed, non-routed folder.)
- `src/app/[locale]/(other)/docs/design-system/_content/skill.md` — copy of the bundle's `SKILL.md`.
- `src/app/api/design-context/[doc]/route.ts` — `text/plain` endpoint. `doc ∈ {design, product, preamble, combined, skill}`. Reads the same files the page reads (zero duplication). `combined` = preamble + DESIGN.md + PRODUCT.md concatenated.
- `docs/design-system-audit.md` — generated, human-readable audit (same data as `component-audit.ts`, prose form).

### Curated showcase set (~15 core primitives)

`button, badge, input, card, select, checkbox, switch, textarea, label, tooltip, dialog, tabs, alert, separator, skeleton` — each rendered with its key variants (e.g. button: default/secondary/outline/ghost/link/gradient + sizes + disabled).

### LLM payloads

- `design` → `DESIGN.md` (repo root).
- `product` → `PRODUCT.md` (repo root).
- `preamble` → `_content/preamble.md` prose only.
- `combined` → `preamble.md` + `DESIGN.md` + `PRODUCT.md` (self-contained, full context for non-browsing models).
- `skill` → `_content/skill.md`.
- _Pointer prompt_ (clipboard, built client-side): a short prompt instructing a browsing-capable LLM to read `${origin}/api/design-context/combined` before designing for OpenCouncil.
- _Per-component prompt_: template — "Design a variant of `<Name>` (source: `<path>`) following OpenCouncil's design rules; see `${origin}/api/design-context/combined`."

### Audit data

`component-audit.ts` exports rows: `{ name, inMain, inSibling, category, note? }` where `category ∈ {common, main-only, sibling-only, divergent}`. From the folder comparison:

- **Common (both, 16 ui primitives):** card, popover, label, tooltip, alert, switch, dialog, badge, separator, button, checkbox, dropdown-menu, select, textarea, input, skeleton.
- **Sibling-only primitives (2):** `heading`, `text` — typographic primitives the main repo lacks (worth adopting).
- **Sibling-only patterns (8):** `form-field`, `empty-state`, `breadcrumbs`, `page-container`, `app-header`, `page-header`, `callout`, `app-footer`.
- **Main-only (notable):** calendar, chart, command, drawer, sheet, sidebar, table, tabs, pagination, progress, slider, scroll-area, hover-card, context-menu, collapsible, toast/toaster, form, breadcrumb, + composites (badge-picker, badge-with-explanation, stats-card, clickable-card, collapsible-card, multi-select-dropdown, phone-field, date-range-picker, triple-toggle, …).
- **Divergent / naming mismatch:** main `breadcrumb` (ui primitive) vs sibling `breadcrumbs` (pattern); main `badge` + `badge-picker` + `badge-with-explanation` (richer) vs sibling plain `badge`; `card` exists in both — flag for a content diff during implementation.

Exact membership is finalized at implementation time by diffing the actual files.

### i18n

Page chrome (section titles, dropdown labels) uses a small new next-intl namespace (`designSystem`) added to the locale message files; copied LLM payloads stay verbatim (English source docs). Greek is primary.

## Data flow

`page.tsx` (server) reads md files → renders showcase registry + `AuditTable` → passes payload strings to `DesignWithLLM` (client). `DesignWithLLM` copies payloads or builds a pointer prompt from `window.location.origin`. `/api/design-context/[doc]` independently serves the same files as `text/plain` for external/browsing consumers. `docs/design-system-audit.md` mirrors `component-audit.ts`.

## Verification

- Build: `npm run build` (after all changes); quick `npx tsc --noEmit`.
- Manual: load `/en/docs/design-system` and `/el/docs/design-system` — components render, variants visible, audit table populated.
- Dropdown: each copy item writes the expected payload; pointer item copies a prompt with the correct origin.
- Endpoints: `GET /api/design-context/{design,product,preamble,combined,skill}` returns `text/plain` 200 with the right content; unknown `doc` → 404.
- `docs/design-system-audit.md` matches `component-audit.ts`.

## Open risks

- Some curated primitives may need minimal wrapper state (e.g. `dialog`, `tabs`, `select`) to render meaningfully in the showcase — handled per-entry in the registry.
- `card` divergence between main and sibling needs a real diff to categorize precisely (done during implementation).
