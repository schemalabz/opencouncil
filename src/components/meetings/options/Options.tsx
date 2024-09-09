import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useTranscriptOptions } from './OptionsContext';

const Setting = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-2">
        <div>
            <label className="text-sm font-medium leading-none">{label}</label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {children}
    </div>
);

export function Options() {
    const { options, updateOptions } = useTranscriptOptions();

    const handleSettingChange = (key: keyof typeof options) => (checked: boolean) => {
        updateOptions({ [key]: checked });
    };

    const handleSliderChange = (value: number[]) => {
        updateOptions({ maxUtteranceDrift: value[0] });
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Transcript Options</h3>
            <div className="space-y-2">
                <Setting label="Edit Mode" description="Allow editing of the transcript">
                    <Switch
                        id="edit-mode"
                        checked={options.editable}
                        onCheckedChange={handleSettingChange('editable')}
                    />
                </Setting>
                <Setting label="Highlight Uncertain Words" description="Highlight words with low confidence">
                    <Switch
                        id="highlight-uncertain"
                        checked={options.highlightLowConfidenceWords}
                        onCheckedChange={handleSettingChange('highlightLowConfidenceWords')}
                    />
                </Setting>
                {options.editable && (
                    <Setting label="Max Utterance Drift" description="Set the maximum allowed drift for utterances">
                        <div className="relative flex items-center">
                            <Slider
                                id="max-utterance-drift"
                                min={1}
                                max={100}
                                step={1}
                                value={[options.maxUtteranceDrift]}
                                onValueChange={handleSliderChange}
                                className="w-[200px] mr-2"
                            />
                            <span className="text-sm">{options.maxUtteranceDrift.toFixed(1)}</span>
                        </div>
                    </Setting>
                )}
            </div>
        </div>
    );
}
