"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "@prisma/client";
import { Switch } from "@/components/ui/switch";
import { SaveStatus, SettingsCard, SettingsRow, SettingsRows } from "@/components/profile/SettingsChrome";
import { postProfile } from "@/components/profile/profile-api";

type Preference = "allowProductUpdates" | "allowPetitionUpdates" | "allowFeedbackCalls";

const PREFERENCES: Preference[] = ["allowProductUpdates", "allowPetitionUpdates", "allowFeedbackCalls"];

/**
 * The three ways OpenCouncil may reach out, each a switch that saves as it
 * flips: the route takes a partial update, so a flip is one field and needs
 * no button. A flip the server refuses goes back where it was and says so.
 */
export function CommunicationPreferences({ user }: { user: Pick<User, Preference> }) {
    const t = useTranslations("Profile");
    const [values, setValues] = useState<Record<Preference, boolean>>({
        allowProductUpdates: user.allowProductUpdates,
        allowPetitionUpdates: user.allowPetitionUpdates,
        allowFeedbackCalls: user.allowFeedbackCalls,
    });
    const [saving, setSaving] = useState<Preference | null>(null);
    const [saveState, setSaveState] = useState<"idle" | "error">("idle");

    async function flip(key: Preference, next: boolean) {
        const previous = values[key];
        setValues((current) => ({ ...current, [key]: next }));
        setSaving(key);
        setSaveState("idle");
        const result = await postProfile({ [key]: next });
        // No refresh: nothing on this tab reads the row, and the personal tab
        // re-renders on the server when the reader navigates to it.
        if (!result.ok) {
            setValues((current) => ({ ...current, [key]: previous }));
            setSaveState("error");
        }
        setSaving(null);
    }

    return (
        <SettingsCard>
            <div className="py-1">
                <SettingsRows>
                    {PREFERENCES.map((key) => (
                        <SettingsRow
                            key={key}
                            htmlFor={key}
                            label={t(key)}
                            description={t(`${key}Description`)}
                            control={
                                <Switch
                                    id={key}
                                    checked={values[key]}
                                    disabled={saving !== null}
                                    onCheckedChange={(checked) => flip(key, checked)}
                                />
                            }
                        />
                    ))}
                </SettingsRows>
                {saveState === "error" && (
                    <div className="border-t border-border px-4 py-3 sm:px-5">
                        <SaveStatus state="error" savedLabel={t("saved")} errorLabel={t("saveError")} />
                    </div>
                )}
            </div>
        </SettingsCard>
    );
}
