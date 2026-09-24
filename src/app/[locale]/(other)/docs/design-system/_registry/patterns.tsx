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
        previewSample: (
            <StatsCard
                columns={2}
                items={[
                    { title: 'Πρόσωπα', value: 1240, description: 'Δείτε όλα τα πρόσωπα' },
                    { title: 'Συνεδριάσεις', value: 412, description: 'Όλες οι συνεδριάσεις' },
                ]}
            />
        ),
        imports: `import { StatsCard } from '@/components/ui/stats-card';`,
        design: `Responsive grid of Paper cards (8px corners, Cloud Border, Whisper shadow, 24px padding) — one per metric. Each shows the value in Headline type (24px/600) over a Label-size title in plain Greek and a Soft Ink #78716c description. Numbers stay neutral; no orange fills for decoration.`,
        code: `<StatsCard
  columns={3}
  items={[
    { title: 'Πρόσωπα', value: 1240, description: 'Δείτε όλα τα πρόσωπα' },
    { title: 'Παρατάξεις', value: 38, description: 'Όλες οι παρατάξεις' },
    { title: 'Συνεδριάσεις', value: 412, description: 'Όλες οι συνεδριάσεις' },
  ]}
/>`,
        dos: ['Use for at-a-glance civic metrics (Πρόσωπα, Παρατάξεις, Συνεδριάσεις).', 'Keep labels in plain Greek.', 'Pick a column count that fits the viewport.'],
        donts: ["Don't oversize hero metrics for marketing effect.", "Don't use orange fills for decoration.", "Don't cram more than six columns."],
    },
    {
        slug: 'clickable-card', name: 'ClickableCard', sourcePath: 'src/components/ui/clickable-card.tsx',
        description: 'A whole card that is a single navigation target.',
        sample: (
            <ClickableCard href="#" className="max-w-sm">
                <div className="p-6">
                    <div className="font-semibold">Δημοτικό Συμβούλιο</div>
                    <div className="text-sm text-muted-foreground">Συνεδρίαση · Σήμερα</div>
                </div>
            </ClickableCard>
        ),
        imports: `import { ClickableCard } from '@/components/ui/clickable-card';`,
        design: `A full Card surface (Paper, 8px corners, resting gray 1.5px gradient border, Whisper shadow) made into a single link. Hover ignites the border to the Civic Flame→Marble Blue gradient with a subtle lift; the whole card is one focusable target with a 2px Ink ring offset 2px.`,
        code: `<ClickableCard href="#" className="max-w-sm">
  <div className="p-6">
    <div className="font-semibold">Δημοτικό Συμβούλιο</div>
    <div className="text-sm text-muted-foreground">Συνεδρίαση · Σήμερα</div>
  </div>
</ClickableCard>`,
        dos: ['Use when the entire card is one navigation target.', 'Provide an href and an accessible label.', 'Keep the hover lift subtle.'],
        donts: ["Don't nest multiple independent links inside.", "Don't use it for non-navigational content.", "Don't remove the focus state."],
    },
    {
        slug: 'collapsible-card', name: 'CollapsibleCard', sourcePath: 'src/components/ui/collapsible-card.tsx',
        description: 'Progressive disclosure of secondary detail.',
        sample: (
            <CollapsibleCard title="Λεπτομέρειες θέματος" defaultOpen className="max-w-sm">
                <p className="p-4 text-sm text-muted-foreground">Περιεχόμενο που εμφανίζεται όταν ανοίξει.</p>
            </CollapsibleCard>
        ),
        imports: `import { CollapsibleCard } from '@/components/ui/collapsible-card';`,
        design: `Card surface (Paper, 8px corners, Cloud Border, Whisper shadow) with a clickable header trigger in Label type and a chevron that rotates on toggle. Body expands/collapses in 150–300ms; no orange tint, no shadows beyond the resting Whisper.`,
        code: `<CollapsibleCard title="Λεπτομέρειες θέματος" defaultOpen className="max-w-sm">
  <p className="p-4 text-sm text-muted-foreground">Περιεχόμενο που εμφανίζεται όταν ανοίξει.</p>
</CollapsibleCard>`,
        dos: ['Use to progressively disclose secondary detail.', 'Label the trigger clearly.', 'Keep primary content default-open.'],
        donts: ["Don't hide essential information by default.", "Don't animate beyond 300ms.", "Don't nest deep accordions."],
    },
    {
        slug: 'badge-with-explanation', name: 'BadgeWithExplanation', sourcePath: 'src/components/ui/badge-with-explanation.tsx',
        description: 'A status badge with a one-line rationale.',
        sample: (
            <BadgeWithExplanation label="Κείμενο από ΤΝ" explanation="Δημιουργήθηκε από τεχνητή νοημοσύνη· υπόκειται στο επίσημο πρακτικό." variant="secondary" />
        ),
        imports: `import { BadgeWithExplanation } from '@/components/ui/badge-with-explanation';`,
        design: `A full-round Badge (12px semibold, secondary Stone Mist #f5f5f4 fill by default) paired with a one-line rationale in Soft Ink #78716c. Used chiefly for AI/system labels; meaning never carried by colour alone.`,
        code: `<BadgeWithExplanation label="Κείμενο από ΤΝ" explanation="Δημιουργήθηκε από τεχνητή νοημοσύνη· υπόκειται στο επίσημο πρακτικό." variant="secondary" />`,
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
        imports: `import { ColorPercentageRing } from '@/components/ui/color-percentage-ring';`,
        design: `Donut ring with segments drawn in brand-palette colours (Civic Flame Deep #fc550a, Marble Blue #a4c0e1, Cloud Border #e7e5e4) for part-to-whole civic breakdowns. Stays within the brand — no third accent scheme — and is paired with a text alternative.`,
        code: `<ColorPercentageRing
  size={96}
  data={[
    { color: '#fc550a', percentage: 45 },
    { color: '#a4c0e1', percentage: 35 },
    { color: '#e7e5e4', percentage: 20 },
  ]}
/>`,
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
        imports: `import Marquee from '@/components/ui/marquee';`,
        design: `Continuous horizontal strip of logos or 14px Soft Ink #78716c labels scrolling at a configurable duration, pausing on hover. Used sparingly for brand moments, never essential reading; honours prefers-reduced-motion with a static fallback.`,
        code: `<Marquee pauseOnHover className="max-w-md [--duration:20s]">
  <span className="mx-4 text-sm text-muted-foreground">Αθήνα</span>
  <span className="mx-4 text-sm text-muted-foreground">Θεσσαλονίκη</span>
  <span className="mx-4 text-sm text-muted-foreground">Πάτρα</span>
  <span className="mx-4 text-sm text-muted-foreground">Ηράκλειο</span>
</Marquee>`,
        dos: ['Use sparingly for a continuous strip of logos / labels.', 'Respect reduced-motion.', 'Pause on hover for readability.'],
        donts: ["Don't use it for essential reading content.", "Don't run multiple marquees at once.", "Don't speed it up to grab attention."],
    },
];
