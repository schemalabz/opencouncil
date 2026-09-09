// _registry/components.tsx  ('use client' is NOT allowed — keep hook-free)
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
import type { DocEntry } from './types';

export const COMPONENT_ENTRIES: DocEntry[] = [
    {
        slug: 'button', name: 'Button', sourcePath: 'src/components/ui/button.tsx',
        description: 'Primary action control; Civic Flame reserved for the one primary action.',
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
        imports: `import { Button } from '@/components/ui/button';`,
        design: `Primary: Civic Flame fill #ff6600, white Label text (14px/500), 40px tall, 16px horizontal padding, sharp corners (radius 0), Lift shadow; hover dims fill to 90% (150ms), focus 2px Ink ring offset 2px, disabled 50% opacity. Secondary: Marble Blue fill, Graphite label. Outline: Paper bg, 1px Cloud Border, 10% Marble Blue hover wash. Ghost transparent until hover; Link is Civic Flame text underlined on hover. Gradient: Paper fill in a 1px animated Civic Flame→Marble Blue border (One Gradient Rule).`,
        code: `<div className="flex flex-wrap gap-2 items-center">
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
</div>`,
        dos: [
            'Use the default (Civic Flame) variant for the single primary action per screen.',
            'Use outline / ghost / secondary for lower-priority actions.',
            'Keep labels sentence-case and verb-first; honour the 40px touch target.',
        ],
        donts: [
            "Don't place two Civic-Flame primary buttons in one view.",
            "Don't use the gradient variant for routine actions — reserve it for decisive brand moments.",
            "Don't shrink the hit area below 40px or remove the focus ring.",
        ],
    },
    {
        slug: 'badge', name: 'Badge', sourcePath: 'src/components/ui/badge.tsx',
        description: 'Compact status or category label.',
        sample: (
            <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
            </div>
        ),
        imports: `import { Badge } from '@/components/ui/badge';`,
        design: `Full-round pill (radius full), 12px semibold text, 2px/10px padding. Default Graphite fill #1c1917 with Warm Paper text #fafaf9; secondary Stone Mist #f5f5f4; destructive Signal Red #ef4444; outline transparent with Ink text. Flat — no shadow.`,
        code: `<div className="flex flex-wrap gap-2">
  <Badge>Default</Badge>
  <Badge variant="secondary">Secondary</Badge>
  <Badge variant="outline">Outline</Badge>
  <Badge variant="destructive">Destructive</Badge>
</div>`,
        dos: [
            'Use to label status or category concisely.',
            'Use outline / secondary for neutral metadata.',
            'Label AI-generated content explicitly ("Κείμενο από ΤΝ").',
        ],
        donts: [
            "Don't use the destructive variant for non-critical states.",
            "Don't tint badges Civic Flame for decoration.",
            "Don't stack many badges that compete for attention.",
        ],
    },
    {
        slug: 'input', name: 'Input', sourcePath: 'src/components/ui/input.tsx',
        description: 'Single-line text field.',
        sample: <Input placeholder="Αναζήτηση…" className="max-w-xs" />,
        imports: `import { Input } from '@/components/ui/input';`,
        design: `40px tall, sharp corners (radius 0), 1px Cloud Border #e7e5e4 stroke on Paper, 14px Label text with 12px horizontal padding. Placeholder in Soft Ink #78716c. Focus shows a 2px Ink ring offset 2px; disabled at 50% opacity with not-allowed cursor.`,
        code: `<Input placeholder="Αναζήτηση…" className="max-w-xs" />`,
        dos: [
            'Always pair with a <Label>.',
            'Keep the visible focus ring.',
            'Use placeholders for examples, not instructions.',
        ],
        donts: [
            "Don't rely on the placeholder as the only label.",
            "Don't use orange borders at rest.",
            "Don't remove the focus outline.",
        ],
    },
    {
        slug: 'textarea', name: 'Textarea', sourcePath: 'src/components/ui/textarea.tsx',
        description: 'Multi-line text field.',
        sample: <Textarea placeholder="Σχόλιο…" className="max-w-xs" />,
        imports: `import { Textarea } from '@/components/ui/textarea';`,
        design: `Multi-line field sharing the input vocabulary: sharp corners (radius 0), 1px Cloud Border #e7e5e4 on Paper, 14px Label text, 12px padding, Soft Ink placeholder. Focus shows a 2px Ink ring offset 2px; resizes vertically.`,
        code: `<Textarea placeholder="Σχόλιο…" className="max-w-xs" />`,
        dos: [
            'Pair with a label.',
            'Allow vertical resize.',
            'Size to the expected content.',
        ],
        donts: [
            "Don't use it for single-line input.",
            "Don't fix a tiny height that hides content.",
            "Don't disable the focus ring.",
        ],
    },
    {
        slug: 'checkbox', name: 'Checkbox', sourcePath: 'src/components/ui/checkbox.tsx',
        description: 'Binary, multi-select choice.',
        sample: (
            <div className="flex items-center gap-2">
                <Checkbox id="ds-cb" />
                <Label htmlFor="ds-cb">Δημόσιο</Label>
            </div>
        ),
        imports: `import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';`,
        design: `Small square box, sharp corners, 1px Cloud Border #e7e5e4 on Paper at rest; checked state fills Graphite with a white check. Paired with a 14px Label (500). Focus shows a 2px Ink ring offset 2px; never tinted orange at rest.`,
        code: `<div className="flex items-center gap-2">
  <Checkbox id="ds-cb" />
  <Label htmlFor="ds-cb">Δημόσιο</Label>
</div>`,
        dos: [
            'Pair with a clickable label (htmlFor).',
            'Group related options together.',
            'Keep the hit target ≥40px.',
        ],
        donts: [
            "Don't use a checkbox for mutually exclusive choices (use radio).",
            "Don't leave it unlabeled.",
            "Don't tint it orange at rest.",
        ],
    },
    {
        slug: 'switch', name: 'Switch', sourcePath: 'src/components/ui/switch.tsx',
        description: 'Instant on/off setting.',
        sample: (
            <div className="flex items-center gap-2">
                <Switch id="ds-sw" />
                <Label htmlFor="ds-sw">Ειδοποιήσεις</Label>
            </div>
        ),
        imports: `import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';`,
        design: `Full-round pill track with a sliding Paper thumb; off track in Stone Mist #f5f5f4 / Cloud Border, on track fills Graphite. Paired with a 14px Label (500). Thumb glides in 150–300ms; focus shows a 2px Ink ring offset 2px.`,
        code: `<div className="flex items-center gap-2">
  <Switch id="ds-sw" />
  <Label htmlFor="ds-sw">Ειδοποιήσεις</Label>
</div>`,
        dos: [
            'Use for instant on/off settings.',
            'Label the setting, not the state.',
            'Reflect the change immediately.',
        ],
        donts: [
            "Don't use it where a submit is required.",
            "Don't use it where a form checkbox is expected.",
            "Don't animate beyond 150–300ms.",
        ],
    },
    {
        slug: 'select', name: 'Select', sourcePath: 'src/components/ui/select.tsx',
        description: 'Choose one from many options.',
        sample: (
            <Select>
                <SelectTrigger className="max-w-xs"><SelectValue placeholder="Δήμος" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="athens">Αθήνα</SelectItem>
                    <SelectItem value="thessaloniki">Θεσσαλονίκη</SelectItem>
                </SelectContent>
            </Select>
        ),
        imports: `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';`,
        design: `Trigger mirrors the input: 40px tall, sharp corners, 1px Cloud Border #e7e5e4 on Paper, 14px Label text, Soft Ink placeholder, 2px Ink focus ring offset 2px. Content panel is a Paper overlay with sharp corners and Float shadow (shadow-lg); items highlight on a Stone Mist hover.`,
        code: `<Select>
  <SelectTrigger className="max-w-xs"><SelectValue placeholder="Δήμος" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="athens">Αθήνα</SelectItem>
    <SelectItem value="thessaloniki">Θεσσαλονίκη</SelectItem>
  </SelectContent>
</Select>`,
        dos: [
            'Use for five or more options.',
            'Provide a clear placeholder.',
            'Keep option labels short.',
        ],
        donts: [
            "Don't use it for 2–3 options (use a toggle / radio).",
            "Don't nest long scrolling lists without search (use command).",
            "Don't omit a label.",
        ],
    },
    {
        slug: 'card', name: 'Card', sourcePath: 'src/components/ui/card.tsx',
        description: 'Grouped, scannable surface.',
        sample: (
            <Card className="max-w-sm">
                <CardHeader>
                    <CardTitle>Συνεδρίαση</CardTitle>
                    <CardDescription>Δημοτικό Συμβούλιο · Σήμερα</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Περιεχόμενο κάρτας.</CardContent>
            </Card>
        ),
        imports: `import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';`,
        design: `Paper surface, 8px corners, framed by a 1.5px gradient border resting as quiet gray (gray-300→gray-200→gray-300) that ignites to the Civic Flame→Marble Blue gradient on hover (300ms, 5s loop); Whisper shadow (shadow-sm) at rest; 24px (p-6) padding. Title in Headline type (24px/600), description in Soft Ink.`,
        code: `<Card className="max-w-sm">
  <CardHeader>
    <CardTitle>Συνεδρίαση</CardTitle>
    <CardDescription>Δημοτικό Συμβούλιο · Σήμερα</CardDescription>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">Περιεχόμενο κάρτας.</CardContent>
</Card>`,
        dos: [
            'Use for grouped, scannable content.',
            'Keep 24px (p-6) padding.',
            'Let the hairline border + whisper shadow carry structure.',
        ],
        donts: [
            "Don't add thick coloured left-border stripes.",
            "Don't round beyond 8px (12px only for featured).",
            "Don't stack heavy shadows.",
        ],
    },
    {
        slug: 'alert', name: 'Alert', sourcePath: 'src/components/ui/alert.tsx',
        description: 'Contextual in-page message.',
        sample: (
            <Alert className="max-w-md">
                <AlertTitle>Σημείωση</AlertTitle>
                <AlertDescription>Κείμενο από ΤΝ — υπόκειται στο επίσημο πρακτικό.</AlertDescription>
            </Alert>
        ),
        imports: `import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';`,
        design: `Paper surface with a 1px Cloud Border #e7e5e4 hairline, sharp corners, p-4 padding, flat (no shadow). Title in Label weight, body in Soft Ink #78716c. Destructive variant uses Signal Red #ef4444 text/border; urgency colours reserved for genuine errors, not routine notes.`,
        code: `<Alert className="max-w-md">
  <AlertTitle>Σημείωση</AlertTitle>
  <AlertDescription>Κείμενο από ΤΝ — υπόκειται στο επίσημο πρακτικό.</AlertDescription>
</Alert>`,
        dos: [
            'Use for contextual, in-page messages.',
            'Keep one clear message.',
            'Label AI content explicitly.',
        ],
        donts: [
            "Don't stack multiple competing alerts.",
            "Don't use it for transient feedback (use toast).",
            "Don't use urgency colours for routine notes.",
        ],
    },
    {
        slug: 'tabs', name: 'Tabs', sourcePath: 'src/components/ui/tabs.tsx',
        description: 'Switch between peer views.',
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
        imports: `import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';`,
        design: `List sits on a Stone Mist #f5f5f4 track; the active trigger lifts to a Paper surface with a Whisper shadow and Ink text, inactive triggers stay Soft Ink. Labels in 14px Label type (500); focus shows a 2px Ink ring offset 2px. Selection never tinted orange.`,
        code: `<Tabs defaultValue="transcript" className="max-w-md">
  <TabsList>
    <TabsTrigger value="transcript">Απομαγνητοφώνηση</TabsTrigger>
    <TabsTrigger value="subjects">Θέματα</TabsTrigger>
  </TabsList>
  <TabsContent value="transcript" className="text-sm text-muted-foreground">Κείμενο…</TabsContent>
  <TabsContent value="subjects" className="text-sm text-muted-foreground">Θέματα…</TabsContent>
</Tabs>`,
        dos: [
            'Use to switch between peer views of one context (transcript / subjects / video).',
            'Keep labels short.',
            'Preserve scroll position per tab.',
        ],
        donts: [
            "Don't use tabs for sequential steps.",
            "Don't hide critical actions behind a tab.",
            "Don't exceed a handful of tabs on mobile.",
        ],
    },
    {
        slug: 'dialog', name: 'Dialog', sourcePath: 'src/components/ui/dialog.tsx',
        description: 'Focused, interrupting task.',
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
        imports: `import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';`,
        design: `Paper overlay centered over a dim scrim, sharp corners, Float shadow (shadow-lg) as it sits literally above the page, p-6 padding. Title in Headline type (24px/600), description in Soft Ink #78716c. Close affordance returns focus to the trigger.`,
        code: `<Dialog>
  <DialogTrigger asChild><Button variant="outline">Άνοιγμα</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Τίτλος</DialogTitle>
      <DialogDescription>Περιγραφή διαλόγου.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
        dos: [
            'Use for focused, interrupting tasks.',
            'Give a clear title and description.',
            'Return focus to the trigger on close.',
        ],
        donts: [
            "Don't use it for non-blocking info (use popover / alert).",
            "Don't nest dialogs.",
            "Don't trap the user without a clear close.",
        ],
    },
    {
        slug: 'tooltip', name: 'Tooltip', sourcePath: 'src/components/ui/tooltip.tsx',
        description: 'Supplementary hint on hover/focus.',
        sample: (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild><Button variant="ghost">Hover</Button></TooltipTrigger>
                    <TooltipContent>Βοήθεια</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ),
        imports: `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';`,
        design: `Small Graphite-on-dark bubble (or Paper with Cloud Border, per theme) with sharp corners and Float shadow as an overlay; short 14px Label text. Appears on hover/focus in 150ms; never holds essential information or interactive content.`,
        code: `<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button variant="ghost">Hover</Button></TooltipTrigger>
    <TooltipContent>Βοήθεια</TooltipContent>
  </Tooltip>
</TooltipProvider>`,
        dos: [
            'Use for supplementary hints on icons / controls.',
            'Keep the text short.',
            'Ensure keyboard and focus access.',
        ],
        donts: [
            "Don't put essential information only in a tooltip.",
            "Don't use it on touch-only targets.",
            "Don't include interactive content.",
        ],
    },
    {
        slug: 'separator', name: 'Separator', sourcePath: 'src/components/ui/separator.tsx',
        description: 'Divides unrelated groups.',
        sample: (
            <div className="max-w-xs">
                <p className="text-sm">Πάνω</p>
                <Separator className="my-2" />
                <p className="text-sm">Κάτω</p>
            </div>
        ),
        imports: `import { Separator } from '@/components/ui/separator';`,
        design: `A single 1px hairline rule in Cloud Border #e7e5e4 — the structural line of the system. Never thick or coloured; pairs with spacing rather than replacing it.`,
        code: `<div className="max-w-xs">
  <p className="text-sm">Πάνω</p>
  <Separator className="my-2" />
  <p className="text-sm">Κάτω</p>
</div>`,
        dos: [
            'Use to divide unrelated groups.',
            'Prefer spacing first, separators second.',
            'Use the hairline Cloud Border colour.',
        ],
        donts: [
            "Don't box every item with rules.",
            "Don't use thick or coloured rules.",
            "Don't replace whitespace entirely.",
        ],
    },
    {
        slug: 'skeleton', name: 'Skeleton', sourcePath: 'src/components/ui/skeleton.tsx',
        description: 'Loading placeholder mirroring content.',
        sample: (
            <div className="space-y-2 max-w-xs">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        ),
        imports: `import { Skeleton } from '@/components/ui/skeleton';`,
        design: `Stone Mist #f5f5f4 placeholder blocks that mirror the shape and size of the loading content, sharp corners, with a gentle pulse; flat (no shadow). Respects prefers-reduced-motion with a static alternative.`,
        code: `<div className="space-y-2 max-w-xs">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-2/3" />
</div>`,
        dos: [
            'Mirror the shape and size of the loading content.',
            'Keep durations short.',
            'Provide a reduced-motion alternative.',
        ],
        donts: [
            "Don't show skeletons for instant loads.",
            "Don't mismatch the final layout (causing shift).",
            "Don't animate aggressively.",
        ],
    },
];
