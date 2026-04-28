'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AdministrativeBodyType } from '@prisma/client';
// @ts-ignore
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { BadgePicker, type BadgePickerOption } from '@/components/ui/badge-picker';
import { Check, Copy, Code, Sun, Moon } from 'lucide-react';
import { type EmbedRadius } from '@/lib/utils/embedTheme';

interface EmbedConfiguratorProps {
    cityId: string;
    bodyTypeOptions: BadgePickerOption<AdministrativeBodyType>[];
}

export function EmbedConfigurator({ cityId, bodyTypeOptions }: EmbedConfiguratorProps) {
    const t = useTranslations('EmbedConfigurator');
    const tCommon = useTranslations('Common');
    const locale = useLocale();

    // Configuration state
    const [accent, setAccent] = useState('#3b82f6');
    const [mode, setMode] = useState<'light' | 'dark'>('light');
    const [limit, setLimit] = useState(5);
    const [showSubjects, setShowSubjects] = useState(true);
    const [radius, setRadius] = useState<EmbedRadius>('rounded');
    const [selectedBodyTypes, setSelectedBodyTypes] = useState<AdministrativeBodyType[]>([]);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    // Build the embed URL
    const embedUrl = useMemo(() => {
        if (!origin) return '';
        const params = new URLSearchParams();
        params.set('cityId', cityId);
        if (accent !== '#3b82f6') params.set('accent', accent.replace('#', ''));
        if (mode !== 'light') params.set('mode', mode);
        if (limit !== 5) params.set('limit', String(limit));
        if (!showSubjects) params.set('showSubjects', 'false');
        if (radius !== 'rounded') params.set('radius', radius);
        if (selectedBodyTypes.length > 0) params.set('bodies', selectedBodyTypes.join(','));
        return `${origin}/${locale}/embed/meetings?${params.toString()}`;
    }, [origin, locale, cityId, accent, mode, limit, showSubjects, radius, selectedBodyTypes]);

    const embedCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border-radius: 8px; border: 1px solid #e5e7eb;"\n  title="OpenCouncil"\n></iframe>`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(embedCode);
            setCopied(true);
        } catch {
            // Clipboard API unavailable — user can manually select the code
        }
    };

    const radiusOptions: { value: EmbedRadius; label: string }[] = [
        { value: 'sharp', label: t('radiusSharp') },
        { value: 'rounded', label: t('radiusRounded') },
        { value: 'pill', label: t('radiusPill') },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Controls */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold mb-1">{t('title')}</h2>
                    <p className="text-sm text-muted-foreground">{t('description')}</p>
                </div>

                {/* Accent color */}
                <div className="space-y-3">
                    <Label>{t('accentColor')}</Label>
                    <p className="text-xs text-muted-foreground">{t('accentColorHint')}</p>
                    <div className="flex gap-4 items-start">
                        <HexColorPicker color={accent} onChange={setAccent} style={{ width: 160, height: 120 }} />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">#</span>
                                <HexColorInput
                                    color={accent}
                                    onChange={setAccent}
                                    className="w-24 px-2 py-1 text-sm border rounded bg-background"
                                />
                            </div>
                            <div
                                className="w-full h-8 rounded border"
                                style={{ backgroundColor: accent }}
                            />
                        </div>
                    </div>
                </div>

                {/* Mode */}
                <div className="flex items-center justify-between">
                    <Label htmlFor="mode-switch" className="flex items-center gap-2">
                        {mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                        {t('darkMode')}
                    </Label>
                    <Switch
                        id="mode-switch"
                        checked={mode === 'dark'}
                        onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
                    />
                </div>

                {/* Number of meetings */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label>{t('numberOfMeetings')}</Label>
                        <span className="text-sm font-medium tabular-nums">{limit}</span>
                    </div>
                    <Slider
                        value={[limit]}
                        onValueChange={([v]) => setLimit(v)}
                        min={1}
                        max={10}
                        step={1}
                    />
                </div>

                {/* Show subjects */}
                <div className="flex items-center justify-between">
                    <Label htmlFor="subjects-switch">{t('showSubjects')}</Label>
                    <Switch
                        id="subjects-switch"
                        checked={showSubjects}
                        onCheckedChange={setShowSubjects}
                    />
                </div>

                {/* Border radius */}
                <div className="space-y-2">
                    <Label>{t('borderRadius')}</Label>
                    <div className="flex gap-2">
                        {radiusOptions.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setRadius(opt.value)}
                                className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                                    radius === opt.value
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-foreground border-border hover:bg-muted'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Administrative body type filter — reuses BadgePicker from meetings list */}
                {bodyTypeOptions.length > 1 && (
                    <div className="space-y-2">
                        <Label>{t('administrativeBodies')}</Label>
                        <BadgePicker
                            options={bodyTypeOptions}
                            selectedValues={selectedBodyTypes}
                            onSelectionChange={setSelectedBodyTypes}
                            allLabel={tCommon('allMeetings')}
                            collapsible={false}
                            inline
                        />
                    </div>
                )}

                {/* Embed code */}
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <Code size={16} />
                        {t('embedCode')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('embedCodeHint')}</p>
                    <div className="relative">
                        <pre className="p-3 text-xs bg-muted rounded-md overflow-x-auto whitespace-pre-wrap break-all font-mono border">
                            {embedCode}
                        </pre>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopy}
                            className="absolute top-2 right-2"
                        >
                            {copied ? (
                                <>
                                    <Check size={14} className="mr-1" />
                                    {t('copied')}
                                </>
                            ) : (
                                <>
                                    <Copy size={14} className="mr-1" />
                                    {t('copy')}
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Troubleshooting */}
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{t('troubleshootingTitle')}</p>
                    <ul className="list-disc pl-4 space-y-1 text-xs">
                        <li>{t('troubleshootingCSP')}</li>
                        <li>{t('troubleshootingWordPress')}</li>
                        <li>{t('troubleshootingHeight')}</li>
                    </ul>
                </div>
            </div>

            {/* Live preview */}
            <div className="space-y-3">
                <Label>{t('preview')}</Label>
                <div className="border rounded-lg overflow-hidden bg-muted/30 sticky top-8">
                    {embedUrl ? (
                        <iframe
                            src={embedUrl}
                            width="100%"
                            height={500}
                            className="border-0"
                            title={t('previewTitle')}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-[500px] text-muted-foreground text-sm">
                            {t('preview')}...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
