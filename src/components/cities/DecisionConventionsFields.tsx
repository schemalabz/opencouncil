"use client"
/**
 * What a body's decision documents state, and how, shown so a person can
 * correct it and confirm it. A record whose provenance says `profile` came from
 * the 2026-09-13 survey; until someone confirms it, derivation flags every
 * meeting of the body with CONVENTIONS_UNCONFIRMED. A body with no record gets
 * an empty one to fill: confirming it stores it as `manual`. The poll asks for
 * no extraction of a body's pages until it has a record.
 */
import { useState } from "react"
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
    onConfirm: (value: DecisionConventions) => void;
    confirming: boolean;
}

/** The anchors are the one field that holds a set; the others hold one value. */
const ANCHORS = 'attendanceChangeAnchors';
const FIELDS = Object.keys(CONVENTION_FIELDS) as (keyof typeof CONVENTION_FIELDS)[];

/**
 * A record a person is starting. The single-choice fields have no neutral value,
 * so they start unset, and the record cannot be confirmed until each is chosen.
 */
type ChoiceField = Exclude<(typeof FIELDS)[number], typeof ANCHORS>;
export type ConventionsDraft = Omit<DecisionConventions, ChoiceField> & Partial<Pick<DecisionConventions, ChoiceField>>;

const EMPTY_DRAFT: ConventionsDraft = {
    version: 1,
    attendanceChangeAnchors: [],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    mayorStatedSeparately: false,
    listOmitsSecretary: false,
    provenance: { source: 'manual' },
};

/** The draft as a record, once every single-choice field holds a value. */
export function completeDraft(draft: ConventionsDraft): DecisionConventions | null {
    const { rollCallLayout, presentListMeaning, namedVoters } = draft
    if (!rollCallLayout || !presentListMeaning || !namedVoters) return null
    return { ...draft, rollCallLayout, presentListMeaning, namedVoters }
}

/** ISO timestamps as the day they name; the exact minute says nothing here. */
function day(iso: string | undefined): string {
    return iso ? iso.slice(0, 10) : '';
}

export default function DecisionConventionsFields({ value, onChange, onConfirm, confirming }: DecisionConventionsFieldsProps) {
    const t = useTranslations('admin.conventions')
    // A stored record is edited in the caller's form. A new one stays here until
    // it is confirmed, because it is not a whole record until then.
    const [draft, setDraft] = useState<ConventionsDraft | null>(null)
    const record: ConventionsDraft | null = value ?? draft

    if (!record) {
        return (
            <div className="space-y-2 rounded-lg border p-3">
                <h4 className="text-sm font-medium">{t('form.title')}</h4>
                <p className="text-xs text-muted-foreground">{t('form.none')}</p>
                <Button type="button" variant="outline" onClick={() => setDraft(EMPTY_DRAFT)}>
                    {t('form.start')}
                </Button>
            </div>
        )
    }

    const update = (patch: Partial<DecisionConventions>) => {
        if (value) onChange({ ...value, ...patch })
        else setDraft({ ...record, ...patch })
    }
    const complete = value ?? completeDraft(record)
    const anchors = normalizeAnchors(record.attendanceChangeAnchors ?? [])
    const confirmed = isConfirmedByPerson(value)

    const toggleAnchor = (anchor: AttendanceChangeAnchor, checked: boolean) => {
        const next = checked ? [...anchors, anchor] : anchors.filter(a => a !== anchor)
        update({ attendanceChangeAnchors: normalizeAnchors(next) })
    }

    return (
        <div className="space-y-4 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium">{t('form.title')}</h4>
                <span className="text-xs text-muted-foreground">
                    {!value
                        ? t('form.draft')
                        : confirmed
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
                                value={record[field] ?? ''}
                                onValueChange={(v) => update({ [field]: v } as Pick<DecisionConventions, ChoiceField>)}
                            >
                                <SelectTrigger id={`conventions-${field}`}>
                                    <SelectValue placeholder={t('form.choose')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONVENTION_FIELDS[field].map(option => (
                                        <SelectItem key={option} value={option}>{t(`${field}.${option}.label`)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {record[field] && (
                                <p className="text-xs text-muted-foreground">{t(`${field}.${record[field]}.description`)}</p>
                            )}
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
                        checked={!!record[flag]}
                        onCheckedChange={(checked) => update({ [flag]: checked })}
                    />
                </div>
            ))}

            <div className="space-y-1">
                <Label htmlFor="conventions-notes">{t('form.notes')}</Label>
                <Textarea
                    id="conventions-notes"
                    value={record.notes ?? ''}
                    onChange={(e) => update({ notes: e.target.value })}
                />
            </div>

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => { if (complete) onConfirm(complete) }}
                    disabled={confirming || !complete}
                >
                    {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('form.confirm')}
                </Button>
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
