# Design System Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app `/docs/design-system` page that showcases the live `src/components/ui` primitives, documents a main↔sibling component audit, and offers a "Design with LLM" dropdown for consistent LLM handoff.

**Architecture:** A server page (in the existing `(other)/docs` route group) reads OpenCouncil's design docs and renders a curated showcase of real `ui/` components + an audit table. LLM context is centralized in `src/lib/design-system/` and exposed both to the page (clipboard payloads) and via `/api/design-context/[doc]` text endpoints (canonical links). Single source of truth: the live components and the root `DESIGN.md`/`PRODUCT.md`.

**Tech Stack:** Next.js 16 App Router (React 19, TS strict), Tailwind, Radix-based `ui/` components, Jest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-16-design-system-route-design.md`

**Note on deviations from spec:**
- **No i18n namespace.** The neighbouring `docs/page.tsx` (Swagger) is not internationalized; this page follows that precedent with plain English chrome. (The LLM payloads are English source docs anyway.)
- **preamble/skill are TS string constants**, not `.md` files read at runtime — avoids any `output: standalone` file-tracing risk for new files. `DESIGN.md`/`PRODUCT.md` are read with `fs` from the project root, reusing the proven Swagger-route pattern (root files are present at runtime).
- **Route folder is `design-system`** (kebab-case, matching `sign-in`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/design-system/content.ts` | `PREAMBLE` + `SKILL` string constants |
| `src/lib/design-system/llm-context.ts` | `DESIGN_CONTEXT_DOCS`, `getDesignContext(doc)`, `isDesignContextDoc(s)` |
| `src/lib/design-system/__tests__/llm-context.test.ts` | Unit tests for the helper |
| `src/app/api/design-context/[doc]/route.ts` | `text/plain` GET endpoint per doc |
| `src/app/api/design-context/[doc]/__tests__/route.test.ts` | Route handler tests |
| `src/app/[locale]/(other)/docs/design-system/component-audit.ts` | Audit data + integrity invariants |
| `src/app/[locale]/(other)/docs/design-system/__tests__/component-audit.test.ts` | Audit data integrity test |
| `docs/design-system-audit.md` | Human-readable audit (mirrors the data) |
| `src/app/[locale]/(other)/docs/design-system/AuditTable.tsx` | Renders audit data (server) |
| `src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx` | Curated component samples |
| `src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx` | One showcase entry + copy-prompt (client) |
| `src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx` | LLM dropdown (client) |
| `src/app/[locale]/(other)/docs/design-system/page.tsx` | Wires everything (server) |

---

### Task 1: LLM context constants

**Files:**
- Create: `src/lib/design-system/content.ts`

- [ ] **Step 1: Write the content module**

Author `PREAMBLE` (role header + non-negotiable rules + canonical pointer) and copy `SKILL` verbatim from the Claude bundle's `SKILL.md` (the `opencouncil-design` skill body).

```typescript
// src/lib/design-system/content.ts

export const PREAMBLE = `# Designing for OpenCouncil

You are designing for **OpenCouncil** — an open-source civic-transparency platform by Schema Labs that makes Greek municipal council meetings searchable and understandable. Brand register in one line: **square, plain, exact controls — with the Civic Flame orange and the one brand gradient reserved for primary actions and decisive moments. The record is the interface; the UI recedes.**

## Non-negotiable rules
- **Civic Flame Rule** — orange (#ff6600) appears only where the citizen acts or the record demands attention (primary buttons, links, inline emphasis, live/highlight). Never tints backgrounds, resting borders, default icons, or inactive states. If orange covers >~10% of a screen, it's wrong.
- **One Gradient Rule** — exactly one gradient (Flame Deep #fc550a → Marble Blue #a4c0e1 → back), on 1–1.5px borders and brand moments only. Never on text, never as a surface fill.
- **Two Voices Rule** — Relative Book Pro is the interface; Roboto is the verbatim record; Roboto Mono is timestamps/IDs. The font switch is the trust boundary.
- **Sharp Default Rule** — square corners by default; curvature is earned (cards 8px, featured 12px, pills/avatars full-round).
- **AI labelling** — every AI-generated summary/categorization carries an explicit, visually subordinate label ("Κείμενο από ΤΝ"). AI never masquerades as the record.
- **Accessibility** — WCAG 2.1 AA; visible focus (2px Ink ring, offset 2px); reduced-motion alternatives. Greek is the primary locale; sentence case; no emoji.

The full design spec (DESIGN.md) and product context (PRODUCT.md) follow / are linked below. Honour them over any default instinct.`;

export const SKILL = `---
name: opencouncil-design
description: Use this skill to generate well-branded interfaces and assets for OpenCouncil (the Schema Labs civic-transparency platform for Greek municipal council meetings), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

This is the OpenCouncil design system. Its register in one line: **square, plain, exact controls — with the Civic Flame orange and the one brand gradient reserved for primary actions and decisive moments. The record is the interface; the UI recedes.**

Non-negotiables to honor: the Civic Flame Rule (orange only on action/emphasis, never on resting chrome or backgrounds), the One Gradient Rule (Flame→Blue on thin borders only), the Two Voices Rule (Relative Book Pro for UI, Roboto for the verbatim record), the Sharp Default Rule (square corners unless earned), and an explicit AI label on every AI-generated summary. Primary locale is Greek; WCAG 2.1 AA throughout.

Canonical references (always current):
- Design spec: /api/design-context/design (the repo's DESIGN.md)
- Product context: /api/design-context/product (the repo's PRODUCT.md)
- Combined, self-contained context: /api/design-context/combined

If creating visual artifacts (slides, mocks, throwaway prototypes), produce static HTML for the user to view. If working on production code, follow the rules above and the linked specs to design with this brand. If invoked without guidance, ask what to build, then act as an expert OpenCouncil designer.`;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/design-system/content.ts
git commit -m "feat(design-system): LLM context constants (preamble + skill)"
```

---

### Task 2: LLM context helper (TDD)

**Files:**
- Create: `src/lib/design-system/llm-context.ts`
- Test: `src/lib/design-system/__tests__/llm-context.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/design-system/__tests__/llm-context.test.ts
import {
    DESIGN_CONTEXT_DOCS,
    getDesignContext,
    isDesignContextDoc,
} from '@/lib/design-system/llm-context';

describe('llm-context', () => {
    it('lists the five supported docs', () => {
        expect(DESIGN_CONTEXT_DOCS).toEqual(['design', 'product', 'preamble', 'combined', 'skill']);
    });

    it('validates doc keys', () => {
        expect(isDesignContextDoc('design')).toBe(true);
        expect(isDesignContextDoc('nope')).toBe(false);
    });

    it('reads DESIGN.md for "design"', () => {
        expect(getDesignContext('design')).toContain('Civic Flame');
    });

    it('reads PRODUCT.md for "product"', () => {
        expect(getDesignContext('product').length).toBeGreaterThan(100);
    });

    it('combined contains preamble + design + product', () => {
        const combined = getDesignContext('combined');
        expect(combined).toContain('Designing for OpenCouncil'); // preamble
        expect(combined).toContain('Civic Flame'); // design
        expect(combined.split('---').length).toBeGreaterThanOrEqual(3);
    });

    it('skill returns the skill front-matter', () => {
        expect(getDesignContext('skill')).toContain('name: opencouncil-design');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/design-system/__tests__/llm-context.test.ts`
Expected: FAIL — cannot find module `@/lib/design-system/llm-context`.

- [ ] **Step 3: Write the helper**

```typescript
// src/lib/design-system/llm-context.ts
import fs from 'fs';
import path from 'path';
import { PREAMBLE, SKILL } from './content';

export const DESIGN_CONTEXT_DOCS = ['design', 'product', 'preamble', 'combined', 'skill'] as const;
export type DesignContextDoc = (typeof DESIGN_CONTEXT_DOCS)[number];

export function isDesignContextDoc(value: string): value is DesignContextDoc {
    return (DESIGN_CONTEXT_DOCS as readonly string[]).includes(value);
}

function readRootDoc(filename: string): string {
    return fs.readFileSync(path.join(process.cwd(), filename), 'utf8');
}

export function getDesignContext(doc: DesignContextDoc): string {
    switch (doc) {
        case 'design':
            return readRootDoc('DESIGN.md');
        case 'product':
            return readRootDoc('PRODUCT.md');
        case 'preamble':
            return PREAMBLE;
        case 'skill':
            return SKILL;
        case 'combined':
            return [PREAMBLE, readRootDoc('DESIGN.md'), readRootDoc('PRODUCT.md')].join('\n\n---\n\n');
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/design-system/__tests__/llm-context.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-system/llm-context.ts src/lib/design-system/__tests__/llm-context.test.ts
git commit -m "feat(design-system): centralized LLM context helper"
```

---

### Task 3: `/api/design-context/[doc]` endpoint (TDD)

**Files:**
- Create: `src/app/api/design-context/[doc]/route.ts`
- Test: `src/app/api/design-context/[doc]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/design-context/[doc]/__tests__/route.test.ts
import { GET } from '../route';
import { NextRequest } from 'next/server';

function call(doc: string) {
    const req = new NextRequest(`http://localhost/api/design-context/${doc}`);
    return GET(req, { params: Promise.resolve({ doc }) });
}

describe('GET /api/design-context/[doc]', () => {
    it('returns text/plain for a valid doc', async () => {
        const res = await call('design');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/plain');
        expect(await res.text()).toContain('Civic Flame');
    });

    it('serves the combined doc', async () => {
        const res = await call('combined');
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('Designing for OpenCouncil');
    });

    it('404s an unknown doc', async () => {
        const res = await call('bogus');
        expect(res.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/design-context`
Expected: FAIL — cannot find module `../route`.

- [ ] **Step 3: Write the route handler**

```typescript
// src/app/api/design-context/[doc]/route.ts
import { NextRequest } from 'next/server';
import { getDesignContext, isDesignContextDoc } from '@/lib/design-system/llm-context';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ doc: string }> }
) {
    const { doc } = await params;
    if (!isDesignContextDoc(doc)) {
        return new Response('Not found', { status: 404 });
    }
    return new Response(getDesignContext(doc), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/design-context`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/design-context
git commit -m "feat(design-system): /api/design-context/[doc] text endpoints"
```

---

### Task 4: Component audit data (TDD)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/component-audit.ts`
- Test: `src/app/[locale]/(other)/docs/design-system/__tests__/component-audit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/[locale]/(other)/docs/design-system/__tests__/component-audit.test.ts
import { COMPONENT_AUDIT, AUDIT_CATEGORIES } from '../component-audit';

describe('component-audit', () => {
    it('every row has a known category', () => {
        for (const row of COMPONENT_AUDIT) {
            expect(AUDIT_CATEGORIES).toContain(row.category);
        }
    });

    it('has no duplicate names', () => {
        const names = COMPONENT_AUDIT.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('common rows are in both, sibling-only only in sibling, main-only only in main', () => {
        for (const row of COMPONENT_AUDIT) {
            if (row.category === 'common') expect(row.inMain && row.inSibling).toBe(true);
            if (row.category === 'sibling-only') expect(row.inMain).toBe(false);
            if (row.category === 'main-only') expect(row.inSibling).toBe(false);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- design-system/__tests__/component-audit`
Expected: FAIL — cannot find module `../component-audit`.

- [ ] **Step 3: Write the audit data**

```typescript
// src/app/[locale]/(other)/docs/design-system/component-audit.ts
export const AUDIT_CATEGORIES = ['common', 'sibling-only', 'main-only', 'divergent'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface AuditRow {
    name: string;
    inMain: boolean;
    inSibling: boolean;
    category: AuditCategory;
    note?: string;
}

// Compared: main `src/components/ui` ↔ sibling `../opencouncil-design/src/components/{ui,patterns}`.
export const COMPONENT_AUDIT: AuditRow[] = [
    // Common ui primitives (in both)
    { name: 'button', inMain: true, inSibling: true, category: 'common' },
    { name: 'badge', inMain: true, inSibling: true, category: 'divergent', note: 'Main adds badge-picker / badge-with-explanation; sibling is plain.' },
    { name: 'input', inMain: true, inSibling: true, category: 'common' },
    { name: 'textarea', inMain: true, inSibling: true, category: 'common' },
    { name: 'label', inMain: true, inSibling: true, category: 'common' },
    { name: 'select', inMain: true, inSibling: true, category: 'common' },
    { name: 'checkbox', inMain: true, inSibling: true, category: 'common' },
    { name: 'switch', inMain: true, inSibling: true, category: 'common' },
    { name: 'card', inMain: true, inSibling: true, category: 'divergent', note: 'Verify gradient-ignite border vs plain card during adoption.' },
    { name: 'dialog', inMain: true, inSibling: true, category: 'common' },
    { name: 'popover', inMain: true, inSibling: true, category: 'common' },
    { name: 'tooltip', inMain: true, inSibling: true, category: 'common' },
    { name: 'alert', inMain: true, inSibling: true, category: 'common' },
    { name: 'separator', inMain: true, inSibling: true, category: 'common' },
    { name: 'skeleton', inMain: true, inSibling: true, category: 'common' },
    { name: 'dropdown-menu', inMain: true, inSibling: true, category: 'common' },
    // Sibling-only primitives (worth adopting)
    { name: 'heading', inMain: false, inSibling: true, category: 'sibling-only', note: 'Typographic primitive the main repo lacks.' },
    { name: 'text', inMain: false, inSibling: true, category: 'sibling-only', note: 'Typographic primitive the main repo lacks.' },
    // Sibling-only patterns
    { name: 'form-field', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern (label+control+error).' },
    { name: 'empty-state', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'callout', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'page-container', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'page-header', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'app-header', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern (main has domain headers under layout/landing, not a DS primitive).' },
    { name: 'app-footer', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'breadcrumbs', inMain: true, inSibling: true, category: 'divergent', note: 'Main `breadcrumb` is a ui primitive; sibling `breadcrumbs` is a pattern — naming/level mismatch.' },
    // Main-only (notable; not exhaustive)
    { name: 'tabs', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'calendar', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'chart', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'command', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'drawer', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'sheet', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'sidebar', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'table', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'pagination', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'progress', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'slider', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'scroll-area', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'hover-card', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'context-menu', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'collapsible', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'toast', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'form', inMain: true, inSibling: false, category: 'main-only' },
];
```

> Before committing, sanity-check membership against the live folders:
> `ls src/components/ui` and `ls ../opencouncil-design/src/components/ui ../opencouncil-design/src/components/patterns`. Add/adjust rows if reality differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- design-system/__tests__/component-audit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/component-audit.ts" "src/app/[locale]/(other)/docs/design-system/__tests__/component-audit.test.ts"
git commit -m "feat(design-system): main↔sibling component audit data"
```

---

### Task 5: Human-readable audit doc

**Files:**
- Create: `docs/design-system-audit.md`

- [ ] **Step 1: Write the audit markdown (mirror of `component-audit.ts`)**

```markdown
# Component audit: main ↔ opencouncil-design

Compared `src/components/ui` (main repo) against `../opencouncil-design/src/components/{ui,patterns}` (sibling docs app). Mirrors `src/app/[locale]/(other)/docs/design-system/component-audit.ts` — update both together.

## Common (in both)
button, input, textarea, label, select, checkbox, switch, dialog, popover, tooltip, alert, separator, skeleton, dropdown-menu

## Divergent / naming mismatch
- **badge** — main adds `badge-picker` / `badge-with-explanation`; sibling is plain.
- **card** — verify the gradient-ignite border (sibling/bundle) vs main's plainer card before adopting.
- **breadcrumb(s)** — main `breadcrumb` is a ui primitive; sibling `breadcrumbs` is a pattern (level/naming mismatch).

## Sibling-only — candidates to adopt
- **Primitives:** `heading`, `text` (typographic primitives the main repo lacks).
- **Patterns:** `form-field`, `empty-state`, `callout`, `page-container`, `page-header`, `app-header`, `app-footer`.

## Main-only (not exhaustive)
tabs, calendar, chart, command, drawer, sheet, sidebar, table, pagination, progress, slider, scroll-area, hover-card, context-menu, collapsible, toast/toaster, form — plus composites (stats-card, clickable-card, collapsible-card, multi-select-dropdown, phone-field, date-range-picker, triple-toggle, …).

> The sibling app is not part of this build; this audit is a consolidation guide, not a dependency.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system-audit.md
git commit -m "docs(design-system): human-readable component audit"
```

---

### Task 6: AuditTable component

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/AuditTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/[locale]/(other)/docs/design-system/AuditTable.tsx
import { COMPONENT_AUDIT, type AuditCategory } from './component-audit';

const LABELS: Record<AuditCategory, string> = {
    common: 'Common (both)',
    'sibling-only': 'Sibling-only (adopt?)',
    'main-only': 'Main-only',
    divergent: 'Divergent',
};

const ORDER: AuditCategory[] = ['common', 'divergent', 'sibling-only', 'main-only'];

export function AuditTable() {
    return (
        <div className="space-y-8">
            {ORDER.map((category) => {
                const rows = COMPONENT_AUDIT.filter((r) => r.category === category);
                if (rows.length === 0) return null;
                return (
                    <div key={category}>
                        <h3 className="text-sm font-semibold mb-2">{LABELS[category]}</h3>
                        <div className="rounded-md border divide-y">
                            {rows.map((row) => (
                                <div key={row.name} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                                    <code className="font-mono text-xs shrink-0 w-40">{row.name}</code>
                                    <span className="text-muted-foreground">{row.note ?? ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/AuditTable.tsx"
git commit -m "feat(design-system): audit table component"
```

---

### Task 7: Showcase registry

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx`

Defines the curated samples. Plain JSX of (client) `ui/` components — no hooks — so a server page can import and render it. Interactive samples stay uncontrolled (Radix handles internal state).

- [ ] **Step 1: Write the registry**

```tsx
// src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
    Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

export interface ShowcaseEntry {
    name: string;
    sourcePath: string;
    /** Descriptive prompt; the canonical rules link is appended client-side. */
    prompt: string;
    sample: ReactNode;
}

const p = (name: string, file: string) =>
    `Design a variant of the \`${name}\` component (source: src/components/ui/${file}) for OpenCouncil.`;

export const SHOWCASE: ShowcaseEntry[] = [
    {
        name: 'Button', sourcePath: 'src/components/ui/button.tsx', prompt: p('Button', 'button.tsx'),
        sample: (
            <div className="flex flex-wrap gap-2 items-center">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="gradient">Gradient</Button>
                <Button variant="destructive">Destructive</Button>
                <Button size="sm">Small</Button>
                <Button size="lg">Large</Button>
                <Button disabled>Disabled</Button>
            </div>
        ),
    },
    {
        name: 'Badge', sourcePath: 'src/components/ui/badge.tsx', prompt: p('Badge', 'badge.tsx'),
        sample: (
            <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
            </div>
        ),
    },
    {
        name: 'Input', sourcePath: 'src/components/ui/input.tsx', prompt: p('Input', 'input.tsx'),
        sample: <Input placeholder="Αναζήτηση…" className="max-w-xs" />,
    },
    {
        name: 'Textarea', sourcePath: 'src/components/ui/textarea.tsx', prompt: p('Textarea', 'textarea.tsx'),
        sample: <Textarea placeholder="Σχόλιο…" className="max-w-xs" />,
    },
    {
        name: 'Label + Checkbox', sourcePath: 'src/components/ui/checkbox.tsx', prompt: p('Checkbox', 'checkbox.tsx'),
        sample: (
            <div className="flex items-center gap-2">
                <Checkbox id="ds-cb" />
                <Label htmlFor="ds-cb">Δημόσιο</Label>
            </div>
        ),
    },
    {
        name: 'Switch', sourcePath: 'src/components/ui/switch.tsx', prompt: p('Switch', 'switch.tsx'),
        sample: (
            <div className="flex items-center gap-2">
                <Switch id="ds-sw" />
                <Label htmlFor="ds-sw">Ειδοποιήσεις</Label>
            </div>
        ),
    },
    {
        name: 'Select', sourcePath: 'src/components/ui/select.tsx', prompt: p('Select', 'select.tsx'),
        sample: (
            <Select>
                <SelectTrigger className="max-w-xs"><SelectValue placeholder="Δήμος" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="athens">Αθήνα</SelectItem>
                    <SelectItem value="thessaloniki">Θεσσαλονίκη</SelectItem>
                </SelectContent>
            </Select>
        ),
    },
    {
        name: 'Card', sourcePath: 'src/components/ui/card.tsx', prompt: p('Card', 'card.tsx'),
        sample: (
            <Card className="max-w-sm">
                <CardHeader>
                    <CardTitle>Συνεδρίαση</CardTitle>
                    <CardDescription>Δημοτικό Συμβούλιο · Σήμερα</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Περιεχόμενο κάρτας.</CardContent>
            </Card>
        ),
    },
    {
        name: 'Alert', sourcePath: 'src/components/ui/alert.tsx', prompt: p('Alert', 'alert.tsx'),
        sample: (
            <Alert className="max-w-md">
                <AlertTitle>Σημείωση</AlertTitle>
                <AlertDescription>Κείμενο από ΤΝ — υπόκειται στο επίσημο πρακτικό.</AlertDescription>
            </Alert>
        ),
    },
    {
        name: 'Tabs', sourcePath: 'src/components/ui/tabs.tsx', prompt: p('Tabs', 'tabs.tsx'),
        sample: (
            <Tabs defaultValue="transcript" className="max-w-md">
                <TabsList>
                    <TabsTrigger value="transcript">Απομαγνητοφώνηση</TabsTrigger>
                    <TabsTrigger value="subjects">Θέματα</TabsTrigger>
                </TabsList>
                <TabsContent value="transcript" className="text-sm text-muted-foreground">Κείμενο…</TabsContent>
                <TabsContent value="subjects" className="text-sm text-muted-foreground">Θέματα…</TabsContent>
            </Tabs>
        ),
    },
    {
        name: 'Dialog', sourcePath: 'src/components/ui/dialog.tsx', prompt: p('Dialog', 'dialog.tsx'),
        sample: (
            <Dialog>
                <DialogTrigger asChild><Button variant="outline">Άνοιγμα</Button></DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Τίτλος</DialogTitle>
                        <DialogDescription>Περιγραφή διαλόγου.</DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        ),
    },
    {
        name: 'Tooltip', sourcePath: 'src/components/ui/tooltip.tsx', prompt: p('Tooltip', 'tooltip.tsx'),
        sample: (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost">Hover</Button></TooltipTrigger>
                    <TooltipContent>Βοήθεια</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ),
    },
    {
        name: 'Separator', sourcePath: 'src/components/ui/separator.tsx', prompt: p('Separator', 'separator.tsx'),
        sample: (
            <div className="max-w-xs">
                <p className="text-sm">Πάνω</p>
                <Separator className="my-2" />
                <p className="text-sm">Κάτω</p>
            </div>
        ),
    },
    {
        name: 'Skeleton', sourcePath: 'src/components/ui/skeleton.tsx', prompt: p('Skeleton', 'skeleton.tsx'),
        sample: (
            <div className="space-y-2 max-w-xs">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        ),
    },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/showcase-registry.tsx"
git commit -m "feat(design-system): curated showcase registry"
```

---

### Task 8: ComponentShowcase (client)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComponentShowcaseProps {
    name: string;
    sourcePath: string;
    prompt: string;
    children: ReactNode;
}

export function ComponentShowcase({ name, sourcePath, prompt, children }: ComponentShowcaseProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = `${prompt}\n\nFollow OpenCouncil's design rules: ${window.location.origin}/api/design-context/combined`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    return (
        <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">{name}</h3>
                    <code className="text-xs text-muted-foreground">{sourcePath}</code>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy LLM prompt">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    <span className="ml-1">Copy prompt</span>
                </Button>
            </div>
            <div className="rounded-md bg-muted/30 p-4">{children}</div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx"
git commit -m "feat(design-system): per-component showcase with copy-prompt"
```

---

### Task 9: DesignWithLLM dropdown (client)

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx
'use client';

import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DesignContextDoc } from '@/lib/design-system/llm-context';

type Contexts = Record<DesignContextDoc, string>;

const COPY_ITEMS: { doc: DesignContextDoc; label: string }[] = [
    { doc: 'design', label: 'Copy styles (DESIGN.md)' },
    { doc: 'product', label: 'Copy product (PRODUCT.md)' },
    { doc: 'combined', label: 'Copy combined preamble' },
    { doc: 'skill', label: 'Copy design skill (SKILL.md)' },
];

export function DesignWithLLM({ contexts }: { contexts: Contexts }) {
    const [done, setDone] = useState<string | null>(null);

    const copy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setDone(key);
            setTimeout(() => setDone((d) => (d === key ? null : d)), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const copyPointer = () => {
        const url = `${window.location.origin}/api/design-context/combined`;
        copy('pointer', `When designing for OpenCouncil, read and follow ${url} (its design + product rules).`);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Sparkles className="h-4 w-4 mr-1" /> Design with LLM
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Copy full context</DropdownMenuLabel>
                {COPY_ITEMS.map((item) => (
                    <DropdownMenuItem key={item.doc} onClick={() => copy(item.doc, contexts[item.doc])}>
                        {done === item.doc ? <Check className="h-4 w-4 mr-2 text-green-600" /> : null}
                        {item.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Reference</DropdownMenuLabel>
                <DropdownMenuItem onClick={copyPointer}>
                    {done === 'pointer' ? <Check className="h-4 w-4 mr-2 text-green-600" /> : null}
                    Copy canonical link (pointer prompt)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx"
git commit -m "feat(design-system): Design with LLM dropdown"
```

---

### Task 10: Wire the page

**Files:**
- Create: `src/app/[locale]/(other)/docs/design-system/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/[locale]/(other)/docs/design-system/page.tsx
import type { Metadata } from 'next';
import { DESIGN_CONTEXT_DOCS, getDesignContext, type DesignContextDoc } from '@/lib/design-system/llm-context';
import { SHOWCASE } from './showcase-registry';
import { ComponentShowcase } from './ComponentShowcase';
import { DesignWithLLM } from './DesignWithLLM';
import { AuditTable } from './AuditTable';

export const metadata: Metadata = {
    title: 'Design System · OpenCouncil',
    description: 'OpenCouncil component showcase, cross-folder audit, and LLM design context.',
};

export default function DesignSystemPage() {
    const contexts = Object.fromEntries(
        DESIGN_CONTEXT_DOCS.map((doc) => [doc, getDesignContext(doc)])
    ) as Record<DesignContextDoc, string>;

    return (
        <div className="container mx-auto max-w-5xl py-10 space-y-12">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Design System</h1>
                    <p className="text-muted-foreground mt-1">
                        Live OpenCouncil components — the record is the interface; the UI recedes.
                    </p>
                </div>
                <DesignWithLLM contexts={contexts} />
            </header>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Components</h2>
                <div className="grid gap-4">
                    {SHOWCASE.map((entry) => (
                        <ComponentShowcase
                            key={entry.name}
                            name={entry.name}
                            sourcePath={entry.sourcePath}
                            prompt={entry.prompt}
                        >
                            {entry.sample}
                        </ComponentShowcase>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Cross-folder audit</h2>
                <p className="text-sm text-muted-foreground">
                    Main <code>src/components/ui</code> vs the sibling <code>opencouncil-design</code> app.
                    A consolidation guide — see <code>docs/design-system-audit.md</code>.
                </p>
                <AuditTable />
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/(other)/docs/design-system/page.tsx"
git commit -m "feat(design-system): /docs/design-system page"
```

---

### Task 11: Verify end-to-end

- [ ] **Step 1: Run the full test + type suite**

Run: `npm test -- design-system design-context && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds; `/api/design-context/[doc]` and `…/docs/design-system` appear in the route manifest.

- [ ] **Step 3: Manual smoke (dev server)**

Start dev (`npm run dev`), then verify via the preview tooling:
- Load `/en/docs/design-system` and `/el/docs/design-system` — header, ~14 component samples render with variants, audit table populated, no console errors.
- Open "Design with LLM" → each item copies (toast/check); "Copy canonical link" yields a prompt containing the live origin + `/api/design-context/combined`.
- Per-component "Copy prompt" copies the component prompt + rules link.
- `GET /api/design-context/combined` returns `text/plain` with preamble + DESIGN + PRODUCT; `GET /api/design-context/bogus` → 404.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test(design-system): end-to-end verification fixups"
```

---

## Self-Review

**Spec coverage:**
- Showcase imports live `ui/` → Tasks 7, 8, 10. ✓
- Curated ~15 core primitives → Task 7 (14 entries; label shown with checkbox). ✓
- Audit (table + `docs/*.md`) → Tasks 4, 5, 6. ✓
- LLM dropdown copy (DESIGN/PRODUCT/preamble/skill) → Tasks 1, 9. ✓
- Stable raw endpoints + pointer → Tasks 3, 9. ✓
- Per-component prompt → Task 8. ✓
- Combined = preamble+design+product → Task 2 (`getDesignContext('combined')`). ✓
- i18n: intentionally dropped (documented deviation, matches sibling Swagger docs page).

**Type consistency:** `DesignContextDoc`/`DESIGN_CONTEXT_DOCS` (Task 2) reused in Tasks 3, 9, 10. `getDesignContext` signature consistent. `ShowcaseEntry` (Task 7) consumed in Task 10. `AuditRow`/`AuditCategory` (Task 4) consumed in Task 6. ✓

**Placeholders:** none — all steps carry real code/commands.
