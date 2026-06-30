# Design System v2 — Sidebar nav, sections, per-item pages, Do's/Don'ts

> **For agentic workers:** Addendum to `2026-06-16-design-system-route.md`. Implement the tasks in order; each ends with typecheck + commit. Steps use `- [ ]`.

**Goal:** Turn the single `/docs/design-system` page into a documented mini-site: a left sidebar grouping **Components** and **Patterns**, per-item routes (`/components/[slug]`, `/patterns/[slug]`) with live preview + **Copy Prompt** + **Do's / Don'ts**, and an overview page keeping the audit.

**Architecture:** A nested `layout.tsx` adds a locale-aware sidebar + header (Design with LLM). A `_registry/` (non-routed) holds typed `DocEntry` data — the 14 primitives (migrated from `showcase-registry.tsx`) and 6 live composite patterns — each with description, sample JSX, `dos[]`, `donts[]`, and a base prompt. Section index pages and `[slug]` detail pages render from the registry. Single source of truth stays: live `src/components/ui` components.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, Tailwind, `@/i18n/routing` (locale-aware `Link`/`usePathname`).

**Unchanged from v1:** `component-audit.ts`, `AuditTable.tsx`, `DesignWithLLM.tsx`, `src/lib/design-system/*`, `/api/design-context/[doc]`.

**Superseded:** the v1 `showcase-registry.tsx`, `ComponentShowcase.tsx`, and the v1 `page.tsx` body (incl. the uncommitted `Suspense` tweak).

---

## File structure

```
src/app/[locale]/(other)/docs/design-system/
  layout.tsx                    # NEW server shell: sidebar + header
  page.tsx                      # REWRITE overview: intro + section cards + audit
  Sidebar.tsx                   # NEW "use client" nav
  ComponentDoc.tsx              # NEW "use client" detail renderer (preview + Copy Prompt + Do's/Don'ts)
  components/page.tsx           # NEW components index
  components/[slug]/page.tsx    # NEW per-component page
  patterns/page.tsx             # NEW patterns index
  patterns/[slug]/page.tsx      # NEW per-pattern page
  _registry/
    types.ts                    # NEW DocEntry, DocKind
    components.tsx              # NEW 14 primitives (migrate samples) + dos/donts
    patterns.tsx               # NEW 6 live composites + dos/donts
    index.ts                   # NEW getEntry / lists / sidebar sections
  showcase-registry.tsx         # DELETE (migrated into _registry/components.tsx)
  ComponentShowcase.tsx         # DELETE (replaced by ComponentDoc)
```

---

### Task 12: Registry types + index

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/_registry/types.ts`
- Create: `src/app/[locale]/(other)/docs/design-system/_registry/index.ts`

- [ ] **Step 1: types.ts**

```typescript
// _registry/types.ts
import type { ReactNode } from 'react';

export type DocKind = 'components' | 'patterns';

export interface DocEntry {
    /** url slug, e.g. "button" */
    slug: string;
    /** display name, e.g. "Button" */
    name: string;
    /** one-line description */
    description: string;
    /** source file path in the repo */
    sourcePath: string;
    /** rendered preview (uncontrolled; no hooks) */
    sample: ReactNode;
    dos: string[];
    donts: string[];
}
```

- [ ] **Step 2: index.ts**

```typescript
// _registry/index.ts
import type { DocEntry, DocKind } from './types';
import { COMPONENT_ENTRIES } from './components';
import { PATTERN_ENTRIES } from './patterns';

export type { DocEntry, DocKind } from './types';

const REGISTRY: Record<DocKind, DocEntry[]> = {
    components: COMPONENT_ENTRIES,
    patterns: PATTERN_ENTRIES,
};

export const KIND_LABELS: Record<DocKind, string> = {
    components: 'Components',
    patterns: 'Patterns',
};

export function getEntries(kind: DocKind): DocEntry[] {
    return REGISTRY[kind];
}

export function getEntry(kind: DocKind, slug: string): DocEntry | undefined {
    return REGISTRY[kind].find((e) => e.slug === slug);
}

export interface SidebarSection {
    kind: DocKind;
    label: string;
    items: { slug: string; name: string }[];
}

export function getSidebarSections(): SidebarSection[] {
    return (Object.keys(REGISTRY) as DocKind[]).map((kind) => ({
        kind,
        label: KIND_LABELS[kind],
        items: REGISTRY[kind].map((e) => ({ slug: e.slug, name: e.name })),
    }));
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` (will error until Task 13/14 create the entry files; that's fine — do Tasks 13 & 14 before committing this one). Commit after Task 14.

---

### Task 13: Component entries (migrate + Do's/Don'ts)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/_registry/components.tsx`
- Delete (after): `src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx`

- [ ] **Step 1:** Build `COMPONENT_ENTRIES: DocEntry[]` by migrating each sample from the existing `showcase-registry.tsx` (keep the exact verified JSX `sample` and the same imports), and adding `slug`, `description`, `dos`, `donts`. Use this exact content:

```tsx
// _registry/components.tsx  (top: 'use client' is NOT allowed — keep hook-free)
// Imports: copy the full import list from the existing showcase-registry.tsx, plus:
import type { DocEntry } from './types';
```

Per-entry metadata (samples come from the existing registry, matched by name):

| slug | name | sourcePath | description |
|---|---|---|---|
| button | Button | src/components/ui/button.tsx | Primary action control; Civic Flame reserved for the one primary action. |
| badge | Badge | src/components/ui/badge.tsx | Compact status or category label. |
| input | Input | src/components/ui/input.tsx | Single-line text field. |
| textarea | Textarea | src/components/ui/textarea.tsx | Multi-line text field. |
| checkbox | Checkbox | src/components/ui/checkbox.tsx | Binary, multi-select choice. |
| switch | Switch | src/components/ui/switch.tsx | Instant on/off setting. |
| select | Select | src/components/ui/select.tsx | Choose one from many options. |
| card | Card | src/components/ui/card.tsx | Grouped, scannable surface. |
| alert | Alert | src/components/ui/alert.tsx | Contextual in-page message. |
| tabs | Tabs | src/components/ui/tabs.tsx | Switch between peer views. |
| dialog | Dialog | src/components/ui/dialog.tsx | Focused, interrupting task. |
| tooltip | Tooltip | src/components/ui/tooltip.tsx | Supplementary hint on hover/focus. |
| separator | Separator | src/components/ui/separator.tsx | Divides unrelated groups. |
| skeleton | Skeleton | src/components/ui/skeleton.tsx | Loading placeholder mirroring content. |

(Note: the existing registry labels the checkbox sample "Label + Checkbox" — use name `Checkbox`, slug `checkbox`, keep that sample JSX.)

Do's / Don'ts content (verbatim):

```
button:
  dos: ["Use the default (Civic Flame) variant for the single primary action per screen.","Use outline / ghost / secondary for lower-priority actions.","Keep labels sentence-case and verb-first; honour the 40px touch target."]
  donts: ["Don't place two Civic-Flame primary buttons in one view.","Don't use the gradient variant for routine actions — reserve it for decisive brand moments.","Don't shrink the hit area below 40px or remove the focus ring."]
badge:
  dos: ["Use to label status or category concisely.","Use outline / secondary for neutral metadata.","Label AI-generated content explicitly (\"Κείμενο από ΤΝ\")."]
  donts: ["Don't use the destructive variant for non-critical states.","Don't tint badges Civic Flame for decoration.","Don't stack many badges that compete for attention."]
input:
  dos: ["Always pair with a <Label>.","Keep the visible focus ring.","Use placeholders for examples, not instructions."]
  donts: ["Don't rely on the placeholder as the only label.","Don't use orange borders at rest.","Don't remove the focus outline."]
textarea:
  dos: ["Pair with a label.","Allow vertical resize.","Size to the expected content."]
  donts: ["Don't use it for single-line input.","Don't fix a tiny height that hides content.","Don't disable the focus ring."]
checkbox:
  dos: ["Pair with a clickable label (htmlFor).","Group related options together.","Keep the hit target ≥40px."]
  donts: ["Don't use a checkbox for mutually exclusive choices (use radio).","Don't leave it unlabeled.","Don't tint it orange at rest."]
switch:
  dos: ["Use for instant on/off settings.","Label the setting, not the state.","Reflect the change immediately."]
  donts: ["Don't use it where a submit is required.","Don't use it where a form checkbox is expected.","Don't animate beyond 150–300ms."]
select:
  dos: ["Use for five or more options.","Provide a clear placeholder.","Keep option labels short."]
  donts: ["Don't use it for 2–3 options (use a toggle / radio).","Don't nest long scrolling lists without search (use command).","Don't omit a label."]
card:
  dos: ["Use for grouped, scannable content.","Keep 24px (p-6) padding.","Let the hairline border + whisper shadow carry structure."]
  donts: ["Don't add thick coloured left-border stripes.","Don't round beyond 8px (12px only for featured).","Don't stack heavy shadows."]
alert:
  dos: ["Use for contextual, in-page messages.","Keep one clear message.","Label AI content explicitly."]
  donts: ["Don't stack multiple competing alerts.","Don't use it for transient feedback (use toast).","Don't use urgency colours for routine notes."]
tabs:
  dos: ["Use to switch between peer views of one context (transcript / subjects / video).","Keep labels short.","Preserve scroll position per tab."]
  donts: ["Don't use tabs for sequential steps.","Don't hide critical actions behind a tab.","Don't exceed a handful of tabs on mobile."]
dialog:
  dos: ["Use for focused, interrupting tasks.","Give a clear title and description.","Return focus to the trigger on close."]
  donts: ["Don't use it for non-blocking info (use popover / alert).","Don't nest dialogs.","Don't trap the user without a clear close."]
tooltip:
  dos: ["Use for supplementary hints on icons / controls.","Keep the text short.","Ensure keyboard and focus access."]
  donts: ["Don't put essential information only in a tooltip.","Don't use it on touch-only targets.","Don't include interactive content."]
separator:
  dos: ["Use to divide unrelated groups.","Prefer spacing first, separators second.","Use the hairline Cloud Border colour."]
  donts: ["Don't box every item with rules.","Don't use thick or coloured rules.","Don't replace whitespace entirely."]
skeleton:
  dos: ["Mirror the shape and size of the loading content.","Keep durations short.","Provide a reduced-motion alternative."]
  donts: ["Don't show skeletons for instant loads.","Don't mismatch the final layout (causing shift).","Don't animate aggressively."]
```

- [ ] **Step 2:** Delete `showcase-registry.tsx` (its content now lives here).
- [ ] **Step 3: Typecheck** after Task 14 (entries cross-referenced by index). Commit in Task 14.

---

### Task 14: Pattern entries (live composites + Do's/Don'ts)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/_registry/patterns.tsx`

- [ ] **Step 1:** First read the real prop interfaces to build valid samples:
  - `StatsCard({ items: StatsCardItem[], columns? })` — `StatsCardItem { title, value, description?, percent?, trend? }`
  - `ClickableCard({ children, href?, onClick?, className? })`
  - `CollapsibleCard({ title, children, defaultOpen?, icon? })`
  - `BadgeWithExplanation({ label, explanation, variant? })`
  - `ColorPercentageRing({ data: {color,percentage}[], size?, thickness? })`
  - `Marquee` (default export) `({ children, pauseOnHover?, reverse? })`

- [ ] **Step 2:** Write `PATTERN_ENTRIES: DocEntry[]` (hook-free; uncontrolled samples). Imports (verify each before use):

```tsx
// _registry/patterns.tsx
import type { DocEntry } from './types';
import { StatsCard } from '@/components/ui/stats-card';
import { ClickableCard } from '@/components/ui/clickable-card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { BadgeWithExplanation } from '@/components/ui/badge-with-explanation';
import { ColorPercentageRing } from '@/components/ui/color-percentage-ring';
import Marquee from '@/components/ui/marquee';

export const PATTERN_ENTRIES: DocEntry[] = [
    {
        slug: 'stats-card', name: 'StatsCard', sourcePath: 'src/components/ui/stats-card.tsx',
        description: 'At-a-glance grid of civic metrics.',
        sample: (
            <StatsCard
                columns={3}
                items={[
                    { title: 'Πρόσωπα', value: 1240, description: 'Δείτε όλα τα πρόσωπα' },
                    { title: 'Παρατάξεις', value: 38, description: 'Όλες οι παρατάξεις' },
                    { title: 'Συνεδριάσεις', value: 412, description: 'Όλες οι συνεδριάσεις' },
                ]}
            />
        ),
        dos: ['Use for at-a-glance civic metrics (Πρόσωπα, Παρατάξεις, Συνεδριάσεις).', 'Keep labels in plain Greek.', 'Pick a column count that fits the viewport.'],
        donts: ["Don't oversize hero metrics for marketing effect.", "Don't use orange fills for decoration.", "Don't cram more than six columns."],
    },
    {
        slug: 'clickable-card', name: 'ClickableCard', sourcePath: 'src/components/ui/clickable-card.tsx',
        description: 'A whole card that is a single navigation target.',
        sample: (
            <ClickableCard href="#" className="max-w-sm p-6">
                <div className="font-semibold">Δημοτικό Συμβούλιο</div>
                <div className="text-sm text-muted-foreground">Συνεδρίαση · Σήμερα</div>
            </ClickableCard>
        ),
        dos: ['Use when the entire card is one navigation target.', 'Provide an href and an accessible label.', 'Keep the hover lift subtle.'],
        donts: ["Don't nest multiple independent links inside.", "Don't use it for non-navigational content.", "Don't remove the focus state."],
    },
    {
        slug: 'collapsible-card', name: 'CollapsibleCard', sourcePath: 'src/components/ui/collapsible-card.tsx',
        description: 'Progressive disclosure of secondary detail.',
        sample: (
            <CollapsibleCard title="Λεπτομέρειες θέματος" defaultOpen className="max-w-sm">
                <p className="text-sm text-muted-foreground">Περιεχόμενο που εμφανίζεται όταν ανοίξει.</p>
            </CollapsibleCard>
        ),
        dos: ['Use to progressively disclose secondary detail.', 'Label the trigger clearly.', 'Keep primary content default-open.'],
        donts: ["Don't hide essential information by default.", "Don't animate beyond 300ms.", "Don't nest deep accordions."],
    },
    {
        slug: 'badge-with-explanation', name: 'BadgeWithExplanation', sourcePath: 'src/components/ui/badge-with-explanation.tsx',
        description: 'A status badge with a one-line rationale.',
        sample: (
            <BadgeWithExplanation label="Κείμενο από ΤΝ" explanation="Δημιουργήθηκε από τεχνητή νοημοσύνη· υπόκειται στο επίσημο πρακτικό." variant="secondary" />
        ),
        dos: ['Use when a status needs a one-line rationale.', 'Keep the explanation short and factual.', 'Use it for AI / system labels.'],
        donts: ["Don't pack a paragraph into the explanation.", "Don't use it for primary actions.", "Don't rely on colour alone to convey meaning."],
    },
    {
        slug: 'color-percentage-ring', name: 'ColorPercentageRing', sourcePath: 'src/components/ui/color-percentage-ring.tsx',
        description: 'Part-to-whole ring for civic breakdowns.',
        sample: (
            <ColorPercentageRing
                size={96}
                data={[
                    { color: '#fc550a', percentage: 45 },
                    { color: '#a4c0e1', percentage: 35 },
                    { color: '#e7e5e4', percentage: 20 },
                ]}
            />
        ),
        dos: ['Use for part-to-whole civic breakdowns (e.g. party shares).', 'Pass accessible colour / percentage data.', 'Keep the palette within the brand.'],
        donts: ["Don't use it for a single value (use a stat).", "Don't introduce a third accent scheme.", "Don't omit a text alternative."],
    },
    {
        slug: 'marquee', name: 'Marquee', sourcePath: 'src/components/ui/marquee.tsx',
        description: 'Continuous strip for logos or labels.',
        sample: (
            <Marquee pauseOnHover className="max-w-md [--duration:20s]">
                <span className="mx-4 text-sm text-muted-foreground">Αθήνα</span>
                <span className="mx-4 text-sm text-muted-foreground">Θεσσαλονίκη</span>
                <span className="mx-4 text-sm text-muted-foreground">Πάτρα</span>
                <span className="mx-4 text-sm text-muted-foreground">Ηράκλειο</span>
            </Marquee>
        ),
        dos: ['Use sparingly for a continuous strip of logos / labels.', 'Respect reduced-motion.', 'Pause on hover for readability.'],
        donts: ["Don't use it for essential reading content.", "Don't run multiple marquees at once.", "Don't speed it up to grab attention."],
    },
];
```

> If a sample fails to render or typecheck (e.g. a required prop missing after reading the real interface), fix the sample minimally — keep it uncontrolled and brand-appropriate. Note any change in your report.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no `src/` errors (Tasks 12–14 now resolve together).
- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/_registry"
git rm "src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx"
git commit -m "feat(design-system): doc registry with components, patterns, dos/donts"
```

---

### Task 15: Sidebar (client)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/Sidebar.tsx`

- [ ] **Step 1:** Write the nav. Use locale-aware `Link`/`usePathname` from `@/i18n/routing`. The sidebar receives sections as a prop (server reads the registry).

```tsx
// Sidebar.tsx
'use client';

import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { SidebarSection } from './_registry';

const BASE = '/docs/design-system';

export function Sidebar({ sections }: { sections: SidebarSection[] }) {
    const pathname = usePathname();

    const link = (href: string, label: string) => {
        const active = pathname === href;
        return (
            <li key={href}>
                <Link
                    href={href}
                    className={cn(
                        'block rounded-md px-2 py-1.5 text-sm transition-colors',
                        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                >
                    {label}
                </Link>
            </li>
        );
    };

    return (
        <nav className="flex flex-col gap-8">
            <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
                <ul className="flex flex-col gap-0.5">{link(BASE, 'Introduction')}</ul>
            </div>
            {sections.map((section) => (
                <div key={section.kind}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</div>
                    <ul className="flex flex-col gap-0.5">
                        {link(`${BASE}/${section.kind}`, `All ${section.label.toLowerCase()}`)}
                        {section.items.map((item) => link(`${BASE}/${section.kind}/${item.slug}`, item.name))}
                    </ul>
                </div>
            ))}
        </nav>
    );
}
```

> Note: `usePathname` from `@/i18n/routing` returns the path WITHOUT the locale prefix, and `Link` adds the locale — so comparing against the locale-less `/docs/design-system/...` hrefs is correct.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. (Layout consumes it next; commit in Task 16.)

---

### Task 16: Layout shell

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/layout.tsx`

- [ ] **Step 1:** Server layout: header (title + Design with LLM) + sidebar + content. It must build the `contexts` for the dropdown (same as v1 page) and the sidebar sections.

```tsx
// layout.tsx
import type { ReactNode } from 'react';
import { DESIGN_CONTEXT_DOCS, getDesignContext, type DesignContextDoc } from '@/lib/design-system/llm-context';
import { DesignWithLLM } from './DesignWithLLM';
import { Sidebar } from './Sidebar';
import { getSidebarSections } from './_registry';

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
    const contexts = Object.fromEntries(
        DESIGN_CONTEXT_DOCS.map((doc) => [doc, getDesignContext(doc)])
    ) as Record<DesignContextDoc, string>;
    const sections = getSidebarSections();

    return (
        <div className="container mx-auto max-w-7xl py-8">
            <header className="flex items-center justify-between gap-4 border-b pb-4 mb-8">
                <div>
                    <h1 className="text-xl font-bold">Design System</h1>
                    <p className="text-sm text-muted-foreground">The record is the interface; the UI recedes.</p>
                </div>
                <DesignWithLLM contexts={contexts} />
            </header>
            <div className="flex gap-10">
                <aside className="hidden w-56 shrink-0 lg:block">
                    <div className="sticky top-20">
                        <Sidebar sections={sections} />
                    </div>
                </aside>
                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck** then commit Sidebar + layout:

```bash
git add "src/app/[locale]/(other)/docs/design-system/Sidebar.tsx" "src/app/[locale]/(other)/docs/design-system/layout.tsx"
git commit -m "feat(design-system): sidebar nav + layout shell"
```

---

### Task 17: ComponentDoc (detail renderer + Copy Prompt)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/ComponentDoc.tsx`
- Delete: `src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx`

- [ ] **Step 1:** Client renderer. Receives the entry's display fields + `sample` as children. Copy Prompt composes a shadcnstudio-style prompt from the fields + canonical rules link.

```tsx
// ComponentDoc.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComponentDocProps {
    name: string;
    sourcePath: string;
    description: string;
    dos: string[];
    donts: string[];
    children: ReactNode;
}

export function ComponentDoc({ name, sourcePath, description, dos, donts, children }: ComponentDocProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const origin = window.location.origin;
        const prompt = [
            `Use the OpenCouncil "${name}" component (source: ${sourcePath}).`,
            description,
            '',
            "Do's:",
            ...dos.map((d) => `- ${d}`),
            "Don'ts:",
            ...donts.map((d) => `- ${d}`),
            '',
            `Follow OpenCouncil's full design + product rules: ${origin}/api/design-context/combined`,
        ].join('\n');
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    return (
        <article className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold">{name}</h2>
                    <p className="text-muted-foreground mt-1">{description}</p>
                    <code className="text-xs text-muted-foreground">{sourcePath}</code>
                </div>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                    Copy Prompt
                </Button>
            </div>

            <section>
                <h3 className="text-sm font-semibold mb-2">Preview</h3>
                <div className="rounded-md border bg-muted/30 p-6">{children}</div>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
                <div>
                    <h3 className="text-sm font-semibold mb-2 text-green-700">Do</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
                        {dos.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="text-sm font-semibold mb-2 text-red-700">Don't</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
                        {donts.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                </div>
            </section>
        </article>
    );
}
```

- [ ] **Step 2:** Delete `ComponentShowcase.tsx`.
- [ ] **Step 3: Typecheck**, then commit:

```bash
git add "src/app/[locale]/(other)/docs/design-system/ComponentDoc.tsx"
git rm "src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx"
git commit -m "feat(design-system): component doc page with Copy Prompt + Do's/Don'ts"
```

---

### Task 18: Section index + detail pages

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/components/page.tsx`
- Create: `src/app/[locale]/(other)/docs/design-system/components/[slug]/page.tsx`
- Create: `src/app/[locale]/(other)/docs/design-system/patterns/page.tsx`
- Create: `src/app/[locale]/(other)/docs/design-system/patterns/[slug]/page.tsx`

- [ ] **Step 1:** A shared index render (server). `components/page.tsx`:

```tsx
// components/page.tsx
import { Link } from '@/i18n/routing';
import { getEntries } from '../_registry';

export default function ComponentsIndex() {
    const entries = getEntries('components');
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Components</h2>
            <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => (
                    <Link key={e.slug} href={`/docs/design-system/components/${e.slug}`}
                        className="rounded-md border p-4 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold">{e.name}</div>
                        <div className="text-sm text-muted-foreground">{e.description}</div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2:** `patterns/page.tsx` — identical but `getEntries('patterns')`, heading "Patterns", hrefs `/docs/design-system/patterns/${e.slug}`.

- [ ] **Step 3:** `components/[slug]/page.tsx`:

```tsx
// components/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getEntries, getEntry } from '../../_registry';
import { ComponentDoc } from '../../ComponentDoc';

export function generateStaticParams() {
    return getEntries('components').map((e) => ({ slug: e.slug }));
}

export default async function ComponentDetail({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const entry = getEntry('components', slug);
    if (!entry) notFound();
    return (
        <ComponentDoc name={entry.name} sourcePath={entry.sourcePath} description={entry.description} dos={entry.dos} donts={entry.donts}>
            {entry.sample}
        </ComponentDoc>
    );
}
```

- [ ] **Step 4:** `patterns/[slug]/page.tsx` — identical but `getEntries('patterns')` / `getEntry('patterns', slug)`.

- [ ] **Step 5: Typecheck**, then commit:

```bash
git add "src/app/[locale]/(other)/docs/design-system/components" "src/app/[locale]/(other)/docs/design-system/patterns"
git commit -m "feat(design-system): components & patterns index and detail pages"
```

---

### Task 19: Overview page rewrite

**Files:**
- Modify: `src/app/[locale]/(other)/docs/design-system/page.tsx`

- [ ] **Step 1:** Replace the page body with an overview: intro + two section cards (link to Components / Patterns) + the audit table. (The header + sidebar now come from `layout.tsx`, so the page only renders content.)

```tsx
// page.tsx
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { AuditTable } from './AuditTable';
import { getEntries } from './_registry';

export const metadata: Metadata = {
    title: 'Design System · OpenCouncil',
    description: 'OpenCouncil component showcase, cross-folder audit, and LLM design context.',
};

export default function DesignSystemOverview() {
    const counts = { components: getEntries('components').length, patterns: getEntries('patterns').length };
    return (
        <div className="space-y-12">
            <section className="space-y-3">
                <h2 className="text-2xl font-bold">Introduction</h2>
                <p className="text-muted-foreground max-w-2xl">
                    Live OpenCouncil components, documented with usage guidance. Square, plain, exact controls —
                    Civic Flame and the one brand gradient reserved for primary actions. Use “Design with LLM” to copy
                    the design + product rules into any model.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
                    <Link href="/docs/design-system/components" className="rounded-md border p-4 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold">Components →</div>
                        <div className="text-sm text-muted-foreground">{counts.components} primitives</div>
                    </Link>
                    <Link href="/docs/design-system/patterns" className="rounded-md border p-4 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold">Patterns →</div>
                        <div className="text-sm text-muted-foreground">{counts.patterns} composites</div>
                    </Link>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Cross-folder audit</h2>
                <p className="text-sm text-muted-foreground">
                    Main <code>src/components/ui</code> vs the sibling <code>opencouncil-design</code> app.
                    See <code>docs/design-system-audit.md</code>.
                </p>
                <AuditTable />
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**, then commit:

```bash
git add "src/app/[locale]/(other)/docs/design-system/page.tsx"
git commit -m "feat(design-system): overview page with section cards"
```

---

### Task 20: Verify

- [ ] **Step 1:** `npx jest design-context component-audit` → green (unchanged suites still pass).
- [ ] **Step 2:** `npx tsc --noEmit` → no `src/` errors.
- [ ] **Step 3:** Build (only when the user's dev server is paused): `npm run build` → succeeds; routes `…/design-system`, `…/components`, `…/components/[slug]`, `…/patterns`, `…/patterns/[slug]`, `/api/design-context/[doc]` present.
- [ ] **Step 4:** Manual (user's running dev server): visit `/en/docs/design-system` → sidebar with Overview / Components / Patterns; click into a component → preview + Copy Prompt + Do/Don't; Copy Prompt copies the composed prompt; pattern pages render the live composites.

---

## Self-review

- Sidebar + sections + per-item routes → Tasks 15, 16, 18. ✓
- Components & Patterns sections with routes → Tasks 13, 14, 18. ✓
- Patterns = live main-repo composites → Task 14 (6 entries, verified props). ✓
- Copy Prompt (shadcnstudio-style) → Task 17. ✓
- Do's / Don'ts content → Tasks 13, 14 (data) + Task 17 (render). ✓
- Single source of truth (live components) preserved; v1 endpoint/audit/dropdown reused. ✓
- Type consistency: `DocEntry`/`DocKind`/`SidebarSection` defined in `_registry` (Tasks 12) and consumed by Sidebar/layout/pages (15–19). `ComponentDoc` prop names match the `[slug]` page call (Task 17 ↔ 18). ✓
- Deletions: `showcase-registry.tsx` (Task 13/14), `ComponentShowcase.tsx` (Task 17). ✓
```
