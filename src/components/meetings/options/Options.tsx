"use client"

import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useTranscriptOptions } from './OptionsContext';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Mic2, SlidersHorizontal, PlayCircle } from "lucide-react";
import { useVideo } from '../VideoProvider';

const Setting = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
        <div>
            <label className="text-sm font-medium leading-none">{label}</label>
            {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
        </div>
        {children}
    </div>
);

export function Options({ editable }: { editable: boolean }) {
    const t = useTranslations('TranscriptOptions');
    const { options, updateOptions } = useTranscriptOptions();
    const { handleSpeedChange } = useVideo();

    const handleSettingChange = (key: keyof typeof options) => (checked: boolean) => {
        updateOptions({ [key]: checked });
    };

    const handleSliderChange = (value: number[]) => {
        updateOptions({ maxUtteranceDrift: value[0] });
    };

    const handlePlaybackSpeedChange = (value: number[]) => {
        const speed = value[0];
        updateOptions({ playbackSpeed: speed });
        handleSpeedChange(speed.toString());
    };

    return (
        <div className="flex flex-col w-full p-6">
            <section className="w-full max-w-4xl mx-auto space-y-8">
                <div>
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <PlayCircle className="w-4 h-4" />
                                    <CardTitle>Ρυθμίσεις αναπαραγωγής</CardTitle>
                                </div>
                                <CardDescription>
                                    Ρυθμίσεις για την αναπαραγωγή του βίντεο
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Setting
                                    label="Ταχύτητα αναπαραγωγής"
                                    description="Προσαρμόστε την ταχύτητα αναπαραγωγής του βίντεο"
                                >
                                    <div className="relative flex items-center gap-4">
                                        <Slider
                                            id="playback-speed"
                                            min={0.5}
                                            max={4}
                                            step={0.1}
                                            value={[options.playbackSpeed]}
                                            onValueChange={handlePlaybackSpeedChange}
                                            className="w-[200px]"
                                        />
                                        <span className="text-sm font-medium w-12">
                                            {options.playbackSpeed.toFixed(2)}x
                                        </span>
                                    </div>
                                </Setting>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Mic2 className="w-4 h-4" />
                                    <CardTitle>Ρυθμίσεις απομαγνητοφώνησης</CardTitle>
                                </div>
                                <CardDescription>
                                    Ρυθμίσεις της απομαγνητοφώνησης
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {options.editsAllowed && (
                                    <Setting
                                        label={t('editMode.label')}
                                        description={t('editMode.description')}
                                    >
                                        <Switch
                                            id="edit-mode"
                                            checked={options.editable}
                                            onCheckedChange={handleSettingChange('editable')}
                                        />
                                    </Setting>
                                )}
                                <Setting
                                    label={t('highlightUncertain.label')}
                                    description={t('highlightUncertain.description')}
                                >
                                    <Switch
                                        id="highlight-uncertain"
                                        checked={options.highlightLowConfidenceWords}
                                        onCheckedChange={handleSettingChange('highlightLowConfidenceWords')}
                                    />
                                </Setting>
                            </CardContent>
                        </Card>

                        {options.editable && (
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4" />
                                        <CardTitle>Προχωρημένες ρυθμίσεις</CardTitle>
                                    </div>
                                    <CardDescription>
                                        Τεχνικές ρυθμίσεις για προχωρημένους χρήστες
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Setting
                                        label={t('maxUtteranceDrift.label')}
                                        description={t('maxUtteranceDrift.description')}
                                    >
                                        <div className="relative flex items-center gap-4">
                                            <Slider
                                                id="max-utterance-drift"
                                                min={1}
                                                max={500}
                                                step={1}
                                                value={[options.maxUtteranceDrift]}
                                                onValueChange={handleSliderChange}
                                                className="w-[200px]"
                                            />
                                            <span className="text-sm font-medium w-12">
                                                {options.maxUtteranceDrift.toFixed(1)}
                                            </span>
                                        </div>
                                    </Setting>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
