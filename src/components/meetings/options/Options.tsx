import React from 'react';
import { Switch } from "@/components/ui/switch";
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
            </div>
        </div>
    );
}

