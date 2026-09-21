"use client"
/**
 * What a body's decision documents state, and how — the profile the survey
 * wrote, shown so a person can correct it and confirm it. Until someone
 * confirms, derivation flags every meeting of the body with
 * CONVENTIONS_UNCONFIRMED.
 */
import { CheckCircle2, Loader2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
    CONVENTION_FIELDS,
    CONVENTION_FLAGS,
    isConfirmedByPerson,
    normalizeAnchors,
    type AttendanceChangeAnchor,
    type DecisionConventions,
} from '@/lib/decisionConventions'

interface DecisionConventionsFieldsProps {
    value: DecisionConventions | null;
    onChange: (value: DecisionConventions) => void;
    onConfirm: () => void;
    confirming: boolean;
    /** Starts the profiling task. Absent = the caller offers no profiling. */
    onProfile?: () => void;
    profiling?: boolean;
}

/** The anchors are the one field that holds a set; the others hold one value. */
const ANCHORS = 'attendanceChangeAnchors';
const FIELDS = Object.keys(CONVENTION_FIELDS) as (keyof typeof CONVENTION_FIELDS)[];

/** ISO timestamps as the day they name; the exact minute says nothing here. */
function day(iso: string | undefined): string {
    return iso ? iso.slice(0, 10) : '';
}

export default function DecisionConventionsFields({ value, onChange, onConfirm, confirming, onProfile, profiling }: DecisionConventionsFieldsProps) {
    const t = useTranslations('admin.conventions')

    const profileButton = onProfile ? (
        <Button type="button" variant="outline" onClick={onProfile} disabled={profiling}>
            {profiling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('form.profile')}
        </Button>
    ) : null

    // A body nobody profiled has nothing to show or confirm — only something to start.
    if (!value) {
        if (!profileButton) return null
        return (
            <div className="space-y-2 rounded-lg border p-3">
                <h4 className="text-sm font-medium">{t('form.title')}</h4>
                {profileButton}
            </div>
        )
    }

    const anchors = normalizeAnchors(value.attendanceChangeAnchors ?? [])
    const confirmed = isConfirmedByPerson(value)

    const toggleAnchor = (anchor: AttendanceChangeAnchor, checked: boolean) => {
        const next = checked ? [...anchors, anchor] : anchors.filter(a => a !== anchor)
        onChange({ ...value, attendanceChangeAnchors: normalizeAnchors(next) })
    }

    return (
        <div className="space-y-4 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium">{t('form.title')}</h4>
                <span className="text-xs text-muted-foreground">
                    {confirmed
                        ? t('provenance.manual', { who: value.provenance.confirmedBy ?? '', date: day(value.provenance.confirmedAt) })
                        : t('provenance.profile', { n: value.provenance?.documentsSampled ?? 0, date: day(value.provenance?.profiledAt) })}
                </span>
            </div>

            {FIELDS.map(field => (
                <div key={field} className="space-y-1">
                    <Label htmlFor={`conventions-${field}`}>{t(`${field}.fieldLabel`)}</Label>
                    {field === ANCHORS ? (
                        <div className="space-y-2 pt-1">
                            {CONVENTION_FIELDS[field].map(anchor => (
                                <div key={anchor} className="flex items-start gap-2">
                                    <Checkbox
                                        id={`conventions-${field}-${anchor}`}
                                        checked={anchors.includes(anchor)}
                                        onCheckedChange={(checked) => toggleAnchor(anchor, checked === true)}
                                    />
                                    <div className="space-y-0.5">
                                        <Label htmlFor={`conventions-${field}-${anchor}`} className="font-normal">
                                            {t(`${field}.${anchor}.label`)}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">{t(`${field}.${anchor}.description`)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <Select
                                value={value[field]}
                                onValueChange={(v) => onChange({ ...value, [field]: v } as DecisionConventions)}
                            >
                                <SelectTrigger id={`conventions-${field}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONVENTION_FIELDS[field].map(option => (
                                        <SelectItem key={option} value={option}>{t(`${field}.${option}.label`)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{t(`${field}.${value[field]}.description`)}</p>
                        </>
                    )}
                </div>
            ))}

            {CONVENTION_FLAGS.map(flag => (
                <div key={flag} className="flex flex-row items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="space-y-0.5">
                        <Label htmlFor={`conventions-${flag}`}>{t(`${flag}.label`)}</Label>
                        <p className="text-xs text-muted-foreground">{t(`${flag}.description`)}</p>
                    </div>
                    <Switch
                        id={`conventions-${flag}`}
                        checked={!!value[flag]}
                        onCheckedChange={(checked) => onChange({ ...value, [flag]: checked })}
                    />
                </div>
            ))}

            <div className="space-y-1">
                <Label htmlFor="conventions-notes">{t('form.notes')}</Label>
                <Textarea
                    id="conventions-notes"
                    value={value.notes ?? ''}
                    onChange={(e) => onChange({ ...value, notes: e.target.value })}
                />
            </div>

            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onConfirm} disabled={confirming}>
                    {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('form.confirm')}
                </Button>
                {profileButton}
                {confirmed && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('form.confirmed')}
                    </span>
                )}
            </div>
        </div>
    )
}
