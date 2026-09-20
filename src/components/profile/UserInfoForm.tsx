"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { User, VoicePrintConsentSource } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { PhoneField, PhoneFieldValidity } from "@/components/ui/phone-field";
import { formatNumericDateTime } from "@/lib/formatters/time";
import { setVoicePrintConsent } from "@/lib/actions/personConsent";
import { cn } from "@/lib/utils";
import { DPO_EMAIL } from "@/lib/dpo";
import { FieldError, SaveStatus } from "@/components/profile/SettingsChrome";
import { postProfile } from "@/components/profile/profile-api";

// Server phone rejections that have their own message in the Profile namespace.
const PHONE_ERROR_KEYS: Record<string, string> = {
    phone_empty: "phoneInvalid",
    phone_invalid: "phoneInvalid",
    phone_not_mobile: "phoneNotMobile",
    phone_in_use: "phoneInUse",
};

/** How long the "Saved" tick stays under the form. */
const SAVED_FOR_MS = 3000;

/** A person this account administers: the consent box is theirs, not the account's. */
export interface ConsentPerson {
    id: string;
    name: string;
    /** By a QR scan: the account is this person, not an editor a superadmin added. */
    claimed: boolean;
    /**
     * The consent in force, by who recorded it; null when none is. The person
     * revokes an ADMIN consent by email, not here.
     */
    consent: VoicePrintConsentSource | null;
}

interface UserInfoFormProps {
    user: Pick<User, "name" | "email" | "phone" | "updatedAt">;
    isOnboarded: boolean;
    persons?: ConsentPerson[];
}

/**
 * The personal details: name, the email that signs the account in, the
 * mobile number Νότης writes to, and the voiceprint consent of every person
 * the account is. Inside the settings it is the body of a card; on the
 * first visit it is the whole onboarding page, and the one button on it
 * completes the registration.
 */
export function UserInfoForm({ user, isOnboarded, persons = [] }: UserInfoFormProps) {
    const t = useTranslations("Profile");
    const locale = useLocale();
    const router = useRouter();
    const claimed = persons.filter((p) => p.claimed);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>({
        isActive: false,
        isEmpty: true,
        isValid: false,
        reason: null,
    });
    // A rejection the server can see and the field cannot (a number held by
    // another account), keyed into PHONE_ERROR_KEYS.
    const [serverPhoneError, setServerPhoneError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        // A councillor who signed up through their QR has no name yet: start
        // from the name on their council record. Only with exactly one claimed
        // person: with more, nothing says which name is the account holder's,
        // and an editor's name is their own. Saved only with the form.
        name: user.name || (claimed.length === 1 ? claimed[0].name : ""),
        phone: user.phone || "",
    });
    // Only the boxes the user touched, never the whole set: the saved values
    // come from `persons`, which router.refresh() keeps current, so a person
    // linked from another device cannot be reverted by a stale tab.
    const [consentEdits, setConsentEdits] = useState<Record<string, boolean>>({});
    const [consentError, setConsentError] = useState(false);
    const isLocked = (person: ConsentPerson) => person.consent === "ADMIN";
    const consentOf = (person: ConsentPerson) => (isLocked(person) ? true : consentEdits[person.id] ?? person.consent !== null);
    // A box that became locked meanwhile drops its pending edit, so the edit
    // cannot come back if the recorded consent is withdrawn later.
    useEffect(() => {
        setConsentEdits((edits) => {
            const locked = persons.filter((p) => p.consent === "ADMIN" && p.id in edits);
            if (locked.length === 0) return edits;
            return Object.fromEntries(Object.entries(edits).filter(([id]) => !locked.some((p) => p.id === id)));
        });
    }, [persons]);

    useEffect(() => () => {
        if (savedTimer.current) clearTimeout(savedTimer.current);
    }, []);

    const phoneSubmitBlocked = phoneValidity.isActive && !phoneValidity.isEmpty && !phoneValidity.isValid;

    function showSaved() {
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), SAVED_FOR_MS);
    }

    // "phone": the server refused the number, and the field says why; the
    // form's own status line stays quiet so the reason is said once.
    async function saveDetails(): Promise<"saved" | "phone" | "failed"> {
        const result = await postProfile({
            name: formData.name,
            phone: phoneValidity.isEmpty ? null : formData.phone,
            onboarded: true,
        });
        if (result.ok) {
            setServerPhoneError(null);
            router.refresh();
            return "saved";
        }
        const key = result.code ? PHONE_ERROR_KEYS[result.code] : undefined;
        setServerPhoneError(key ?? null);
        return key ? "phone" : "failed";
    }

    // The consent is the person's, not the account's, so it goes through its
    // own action, next to the profile save and not inside it: a phone the
    // server refuses cannot swallow a withdrawal.
    const changedConsents = persons.filter((p) => !isLocked(p) && consentOf(p) !== (p.consent !== null));
    async function saveConsents(): Promise<boolean> {
        if (changedConsents.length === 0) return true;
        try {
            await Promise.all(changedConsents.map((p) => setVoicePrintConsent(p.id, consentOf(p))));
            setConsentEdits({});
            setConsentError(false);
            return true;
        } catch (error) {
            console.error("Failed to save voiceprint consent:", error);
            setConsentError(true);
            return false;
        } finally {
            router.refresh();
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (phoneSubmitBlocked) return;
        setIsSubmitting(true);
        setSaveState("idle");
        try {
            const [consentsSaved, outcome] = await Promise.all([saveConsents(), saveDetails()]);
            // "Saved" only when everything the button covered went through: a
            // consent that failed has its own line, and a tick beside it would
            // say the opposite.
            if (outcome === "saved" && consentsSaved) showSaved();
            else if (outcome === "failed") setSaveState("error");
        } finally {
            setIsSubmitting(false);
        }
    }

    const submitDisabled = isSubmitting || !formData.name || phoneSubmitBlocked;
    const submitLabel = isSubmitting ? t("saving") : isOnboarded ? t("savePersonalInfo") : t("completeRegistration");

    return (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-[13px] font-medium">
                    {t("fullName")}
                </Label>
                <Input
                    type="text"
                    id="name"
                    autoComplete="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-11"
                />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email" className="text-[13px] font-medium">
                        {t("email")}
                    </Label>
                    {/* Read-only rather than disabled: the address stays legible and copyable; the line under it says how it changes. */}
                    <Input
                        type="email"
                        id="email"
                        readOnly
                        value={user.email}
                        aria-describedby="email-hint"
                        className="h-11 bg-muted/60 text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <p id="email-hint" className="text-xs leading-[1.4] text-muted-foreground">{t("emailChangeTooltip")}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phone" className="text-[13px] font-medium">
                        {t("phone")}
                    </Label>
                    <PhoneField
                        value={formData.phone}
                        onChange={(phone) => {
                            setServerPhoneError(null);
                            setFormData({ ...formData, phone });
                        }}
                        onValidityChange={setPhoneValidity}
                        placeholder={t("phonePlaceholder")}
                        invalidMessage={t("phoneInvalid")}
                        notMobileMessage={t("phoneNotMobile")}
                    />
                    {serverPhoneError && <FieldError>{t(serverPhoneError)}</FieldError>}
                </div>
            </div>

            {persons.length > 0 && (
                <div role="group" aria-labelledby="voicePrintTitle" className="flex flex-col gap-3">
                    <span id="voicePrintTitle" className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                        {t("voicePrintTitle")}
                    </span>
                    {persons.map((person) => (
                        <ConsentCard
                            key={person.id}
                            id={`voicePrintConsent-${person.id}`}
                            checked={consentOf(person)}
                            locked={isLocked(person)}
                            onCheckedChange={(checked) => setConsentEdits({ ...consentEdits, [person.id]: checked })}
                            label={
                                <>
                                    {t("voicePrintConsentLabel")}
                                    {/* Only an account that is more than one person needs to know which box is whose. */}
                                    {persons.length > 1 && ` (${person.name})`}
                                </>
                            }
                            hint={t("voicePrintConsentHint")}
                            onPaper={isLocked(person) && t.rich("voicePrintConsentOnPaper", {
                                email: DPO_EMAIL,
                                mail: (chunks) => (
                                    <a href={`mailto:${DPO_EMAIL}`} className="underline underline-offset-2 text-foreground">
                                        {chunks}
                                    </a>
                                ),
                            })}
                        />
                    ))}
                    {consentError && <FieldError>{t("voicePrintConsentError")}</FieldError>}
                </div>
            )}

            <div
                className={cn(
                    "flex flex-col gap-3 border-t border-border pt-4",
                    isOnboarded ? "sm:flex-row sm:items-center sm:justify-between" : "pt-2 border-t-0",
                )}
            >
                <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                    {isOnboarded && (
                        <span>{t("lastUpdated", { date: formatNumericDateTime(new Date(user.updatedAt), undefined, locale, false) })}</span>
                    )}
                    <SaveStatus state={saveState} savedLabel={t("saved")} errorLabel={t("saveError")} />
                </div>
                <Button
                    type="submit"
                    size={isOnboarded ? "default" : "lg"}
                    disabled={submitDisabled}
                    className={cn("h-auto min-h-10 whitespace-normal", !isOnboarded && "w-full min-h-11")}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

/**
 * The voiceprint consent as a card that is a checkbox: the app's tick in a
 * box that lifts with an orange halo when it is on, the way the join flow
 * and the signup ask their questions. The label holds the sentence alone;
 * the hint and the paper note sit outside it, so a screen reader hears the
 * question first and the mail link is not inside a label.
 */
function ConsentCard({
    id,
    checked,
    locked,
    onCheckedChange,
    label,
    hint,
    onPaper,
}: {
    id: string;
    checked: boolean;
    locked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: React.ReactNode;
    hint: string;
    onPaper: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl border bg-card p-4 transition-[border-color,box-shadow] duration-300 ease-out",
                checked
                    ? "border-[hsl(var(--orange))]/60 shadow-[0_0_0_2px_hsl(var(--orange)/0.08),0_6px_18px_-12px_hsl(var(--orange)/0.35)]"
                    : "border-foreground/15",
            )}
        >
            <div className="flex items-start gap-3">
                <Checkbox
                    id={id}
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={(value) => onCheckedChange(value === true)}
                    aria-describedby={`${id}-hint`}
                    className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-[6px] border-foreground/60 [&_svg]:h-4 [&_svg]:w-4"
                />
                <div className="min-w-0 flex-1">
                    <Label htmlFor={id} className={cn("block text-[15px] font-medium leading-snug", !locked && "cursor-pointer")}>
                        {label}
                    </Label>
                    <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground">{hint}</p>
                    {onPaper && <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">{onPaper}</p>}
                </div>
            </div>
        </div>
    );
}
