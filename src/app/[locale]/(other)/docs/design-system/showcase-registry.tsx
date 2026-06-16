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
