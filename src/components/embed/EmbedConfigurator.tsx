'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AdministrativeBodyType } from '@prisma/client';
// @ts-ignore
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Button } from '@/components/ui/button';
import { getLocalizedName } from '@/lib/formatters/name';
import { urlPrefixForLocale } from '@/i18n/config';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminBodyPicker, type AdminBodyGroup } from '@/components/ui/admin-body-picker';
import { EmbedLocationInput, type EmbedLocation } from '@/components/embed/EmbedLocationInput';
import { Check, Copy, Code, Sun, Moon } from 'lucide-react';
import { type EmbedRadius } from '@/lib/utils/embedTheme';
import { EMBED_SUMMARY_LIMITS } from '@/lib/utils/embedParams';
import { formatDate } from '@/lib/formatters/time';

/** An admin-body type and its individual bodies that have public meetings. */
export interface EmbedBodyGroup {
    type: AdministrativeBodyType;
    bodies: { id: string; name: string; name_en: string }[];
}

/** A released past meeting the summary widget can be pinned to. */
export interface EmbedRecentMeeting {
    id: string;
    name: string;
    name_en: string;
    /** ISO string: crosses the server/client boundary as text. */
    dateTime: string;
}

type EmbedWidgetType = 'meetings' | 'subjects' | 'summary';

/** Select value for "the latest meetings" in the summary widget's meeting picker. */
const LATEST_MEETINGS = 'latest';

interface EmbedConfiguratorProps {
    cityId: string;
    /** City name — biases the location-filter address search. */
    cityName?: string;
    /** For the dates in the summary widget's meeting picker. */
    cityTimezone?: string;
    /** Only types/bodies that have released meetings — pre-filtered server-side. */
    bodyGroups: EmbedBodyGroup[];
    /** Released past meetings, newest first — choices for the summary widget's meeting picker. */
    recentMeetings: EmbedRecentMeeting[];
}

export function EmbedConfigurator({ cityId, cityName, cityTimezone, bodyGroups, recentMeetings }: EmbedConfiguratorProps) {
    const t = useTranslations('EmbedConfigurator');
    const tCommon = useTranslations('Common');
    const locale = useLocale();

    // Configuration state
    const [widgetType, setWidgetType] = useState<EmbedWidgetType>('meetings');
    const [accent, setAccent] = useState('#3b82f6');
    const [mode, setMode] = useState<'light' | 'dark'>('light');
    const [limit, setLimit] = useState(5);
    const [showSubjects, setShowSubjects] = useState(true);
    const [radius, setRadius] = useState<EmbedRadius>('rounded');
    // Summary widget: a pinned meeting (null = the latest ones), how many of those, and cards per meeting.
    const [summaryMeetingId, setSummaryMeetingId] = useState<string | null>(null);
    const [summaryLimit, setSummaryLimit] = useState<number>(EMBED_SUMMARY_LIMITS.meetings.default);
    const [subjectsPerMeeting, setSubjectsPerMeeting] = useState<number>(EMBED_SUMMARY_LIMITS.subjects.default);
    // Body filter: a single type (level 1) plus an optional specific body (level 2).
    const [selectedType, setSelectedType] = useState<AdministrativeBodyType | null>(null);
    const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
    // Optional location filter (subjects widget only) — address resolved to a geohash-6.
    const [geoLocation, setGeoLocation] = useState<EmbedLocation | null>(null);
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    // Localize the server-provided groups into the shared picker's shape.
    const bodyPickerGroups = useMemo<AdminBodyGroup[]>(
        () => bodyGroups.map(g => ({
            type: g.type,
            typeLabel: tCommon(`adminBodyType_${g.type}`),
            bodies: g.bodies.map(b => ({ value: b.id, label: getLocalizedName(b, locale) })),
        })),
        [bodyGroups, tCommon, locale]
    );

    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    // A pinned meeting is shown whatever its body; the body filter only narrows "the latest meetings".
    const bodyFilterApplies = widgetType !== 'summary' || summaryMeetingId === null;

    // Build the embed URL
    const embedUrl = useMemo(() => {
        if (!origin) return '';
        const params = new URLSearchParams();
        params.set('cityId', cityId);
        if (accent !== '#3b82f6') params.set('accent', accent.replace('#', ''));
        if (mode !== 'light') params.set('mode', mode);
        if (widgetType === 'summary') {
            if (summaryMeetingId) {
                params.set('meetingId', summaryMeetingId);
            } else if (summaryLimit !== EMBED_SUMMARY_LIMITS.meetings.default) {
                params.set('limit', String(summaryLimit));
            }
            if (subjectsPerMeeting !== EMBED_SUMMARY_LIMITS.subjects.default) {
                params.set('subjects', String(subjectsPerMeeting));
            }
        } else if (limit !== 5) {
            params.set('limit', String(limit));
        }
        if (widgetType === 'meetings' && !showSubjects) params.set('showSubjects', 'false');
        // The subjects widget's cards have fixed corners.
        if (widgetType !== 'subjects' && radius !== 'rounded') params.set('radius', radius);
        // A specific body (id) wins over the broader type filter.
        if (bodyFilterApplies) {
            if (selectedBodyId) {
                params.set('bodyIds', selectedBodyId);
            } else if (selectedType) {
                params.set('bodies', selectedType);
            }
        }
        // Location filter is subjects-only.
        if (widgetType === 'subjects' && geoLocation) {
            params.set('geohash', geoLocation.geohash);
        }
        return `${origin}/${urlPrefixForLocale(locale)}/embed/${widgetType}?${params.toString()}`;
    }, [origin, locale, cityId, widgetType, accent, mode, limit, showSubjects, radius, selectedType, selectedBodyId, geoLocation, bodyFilterApplies, summaryMeetingId, summaryLimit, subjectsPerMeeting]);

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

                {/* Widget type */}
                <div className="space-y-2">
                    <Label>{t('widgetType')}</Label>
                    <div className="flex gap-2">
                        {([
                            { value: 'meetings', label: t('typeMeetings') },
                            { value: 'subjects', label: t('typeSubjects') },
                            { value: 'summary', label: t('typeSummary') },
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setWidgetType(opt.value)}
                                className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                                    widgetType === opt.value
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-foreground border-border hover:bg-muted'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
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

                {/* Meeting picker — summary widget only */}
                {widgetType === 'summary' && (
                    <div className="space-y-2">
                        <Label>{t('summaryMeeting')}</Label>
                        <Select
                            value={summaryMeetingId ?? LATEST_MEETINGS}
                            onValueChange={(value) => setSummaryMeetingId(value === LATEST_MEETINGS ? null : value)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={LATEST_MEETINGS}>{t('summaryLatest')}</SelectItem>
                                {recentMeetings.map((meeting) => (
                                    <SelectItem key={meeting.id} value={meeting.id}>
                                        {getLocalizedName(meeting, locale)} · {formatDate(new Date(meeting.dateTime), cityTimezone, locale)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Number of cards — for the summary widget, how many of the latest meetings */}
                {widgetType !== 'summary' ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>{widgetType === 'subjects' ? t('numberOfSubjects') : t('numberOfMeetings')}</Label>
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
                ) : summaryMeetingId === null && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>{t('numberOfMeetings')}</Label>
                            <span className="text-sm font-medium tabular-nums">{summaryLimit}</span>
                        </div>
                        <Slider
                            value={[summaryLimit]}
                            onValueChange={([v]) => setSummaryLimit(v)}
                            min={EMBED_SUMMARY_LIMITS.meetings.min}
                            max={EMBED_SUMMARY_LIMITS.meetings.max}
                            step={1}
                        />
                    </div>
                )}

                {/* Subject cards per meeting — summary widget only */}
                {widgetType === 'summary' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>{t('subjectsPerMeeting')}</Label>
                            <span className="text-sm font-medium tabular-nums">{subjectsPerMeeting}</span>
                        </div>
                        <Slider
                            value={[subjectsPerMeeting]}
                            onValueChange={([v]) => setSubjectsPerMeeting(v)}
                            min={EMBED_SUMMARY_LIMITS.subjects.min}
                            max={EMBED_SUMMARY_LIMITS.subjects.max}
                            step={1}
                        />
                    </div>
                )}

                {/* Location filter — subjects widget only */}
                {widgetType === 'subjects' && (
                    <div className="space-y-2">
                        <Label>{t('locationLabel')}</Label>
                        <p className="text-xs text-muted-foreground">{t('locationHint')}</p>
                        <EmbedLocationInput
                            cityName={cityName}
                            value={geoLocation}
                            onChange={setGeoLocation}
                        />
                    </div>
                )}

                {/* Show subjects — only relevant for the meetings widget */}
                {widgetType === 'meetings' && (
                    <div className="flex items-center justify-between">
                        <Label htmlFor="subjects-switch">{t('showSubjects')}</Label>
                        <Switch
                            id="subjects-switch"
                            checked={showSubjects}
                            onCheckedChange={setShowSubjects}
                        />
                    </div>
                )}

                {/* Border radius — subjects cards have fixed corners, so not for that widget */}
                {widgetType !== 'subjects' && (
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
                )}

                {/* Administrative body filter — type (level 1) + specific body (level 2) */}
                {bodyFilterApplies && (
                    <AdminBodyPicker
                        groups={bodyPickerGroups}
                        selectedType={selectedType}
                        onTypeChange={type => { setSelectedType(type); setSelectedBodyId(null); }}
                        selectedBodyId={selectedBodyId}
                        onBodyChange={setSelectedBodyId}
                        allTypesLabel={tCommon('allMeetings')}
                        allBodiesLabel={tCommon('allBodies')}
                        label={t('administrativeBodies')}
                    />
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
                        <li>{widgetType === 'summary' ? t('troubleshootingHeightSummary') : t('troubleshootingHeight')}</li>
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
