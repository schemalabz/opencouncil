"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { voiceprintNeedsOwnConsent } from "@/lib/utils/bodyTier";
import { useState, useMemo } from "react";
import { Check, Search, UserCheck, X } from "lucide-react";
import { PeopleStats } from "@/components/admin/people/people-stats";
import { Input } from "@/components/ui/input";
import { PersonWithVoicePrints } from "@/lib/db/people";
import type { VoicePrintConsentStatus } from "@/lib/db/personConsent";
import { VoicePrintConsentControl } from "@/components/persons/VoicePrintConsentControl";
import { useTranslations } from "next-intl";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { VoiceprintActions } from "./voiceprint-actions";
import { BulkVoiceprintDialog } from "./bulk-voiceprint-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { BadgePicker } from "@/components/ui/badge-picker";
import { CouncilQrStripsButton } from "@/components/admin/cities/CouncilQrStripsButton";
import { getBodyOptions, personSitsOnBody } from "@/lib/utils/administrativeBodies";
import { isRoleActive } from "@/lib/utils/roles";
import { bulkActionScope, headerCheckState, toggleAll } from "@/lib/utils/bulkSelection";

interface PeopleProps {
    people: PersonWithVoicePrints[];
    /** The voiceprint consent in force, by person id; a person with none has no entry. */
    consents: Record<string, VoicePrintConsentStatus>;
    currentCityName: string;
    /** Who a QR strip can be printed for; the strips route applies the same rule. */
    qrEligibleIds: string[];
}

export default function People({ people, consents, currentCityName, qrEligibleIds }: PeopleProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [bodyId, setBodyId] = useState<string | null>(null);
    // Kept across searches: an admin may search, tick, search again and tick
    // more. A body is another list, so changing it clears them; ticks left from
    // the council would otherwise ride along into a community's sheet. The
    // header names how many are ticked.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const t = useTranslations("Person");
    const tCommon = useTranslations("Common");

    const qrEligible = useMemo(() => new Set(qrEligibleIds), [qrEligibleIds]);
    // Who may still get a voiceprint. Whether their speech is long enough is
    // the dialog's question: answering it here would read every speaker
    // segment of the city on each load.
    const withoutVoiceprint = useMemo(
        () => new Set(people.filter(person => person.voicePrints.length === 0).map(person => person.id)),
        [people],
    );
    const selectable = (id: string) => qrEligible.has(id) || withoutVoiceprint.has(id);

    // The bodies people sit on now, as /admin/meetings offers its bodies.
    const activeBodies = useMemo(
        () => people.flatMap(person => person.roles.filter(isRoleActive).map(role => role.administrativeBody)),
        [people],
    );
    const bodyOptions = useMemo(() => getBodyOptions(activeBodies), [activeBodies]);
    const selectedBody = bodyId ? activeBodies.find(body => body?.id === bodyId) ?? null : null;

    const filteredPeople = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return people.filter(person =>
            (!selectedBody || personSitsOnBody(person, selectedBody)) &&
            (!query || person.name.toLowerCase().includes(query) || person.name_en.toLowerCase().includes(query)),
        );
    }, [people, searchQuery, selectedBody]);

    const visibleIds = useMemo(() => filteredPeople.map(p => p.id), [filteredPeople]);
    const qrScope = useMemo(() => bulkActionScope(selected, visibleIds, qrEligible), [selected, visibleIds, qrEligible]);
    const voiceprintScope = useMemo(
        () => bulkActionScope(selected, visibleIds, withoutVoiceprint),
        [selected, visibleIds, withoutVoiceprint],
    );

    const visibleSelectable = visibleIds.filter(selectable);
    const headerState = headerCheckState(visibleSelectable, selected);
    const toggleOne = (id: string, on: boolean) => {
        const next = new Set(selected);
        if (on) next.add(id); else next.delete(id);
        setSelected(next);
    };

    const stats = useMemo(
        () => ({
            totalPeople: filteredPeople.length,
            peopleWithRoles: filteredPeople.filter(person => person.roles.length > 0).length,
            peopleWithImages: filteredPeople.filter(person => person.image !== null).length,
            peopleWithVoiceprints: filteredPeople.filter(person => person.voicePrints && person.voicePrints.length > 0).length,
            peopleWithAccounts: filteredPeople.filter(person => person._count.administrators > 0).length,
            peopleWithVoiceprintConsent: filteredPeople.filter(person => consents[person.id]).length,
        }),
        [filteredPeople, consents],
    );

    // Get the cityId from the first person or use empty string as fallback
    const cityId = people.length > 0 ? people[0].cityId : "";

    return (
        <>
            <div className='relative flex-1 mb-6'>
                <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                    placeholder={t("searchItems")}
                    className='pl-8'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {bodyOptions.length > 1 && (
                <BadgePicker
                    options={bodyOptions}
                    selectedValues={bodyId ? [bodyId] : []}
                    onSelectionChange={values => {
                        setBodyId(values.length > 0 ? values[0] : null);
                        setSelected(new Set());
                    }}
                    allLabel={tCommon("allBodies")}
                    collapsible={false}
                    className="mb-4"
                />
            )}

            <PeopleStats
                totalPeople={stats.totalPeople}
                peopleWithRoles={stats.peopleWithRoles}
                peopleWithImages={stats.peopleWithImages}
                peopleWithVoiceprints={stats.peopleWithVoiceprints}
                peopleWithAccounts={stats.peopleWithAccounts}
                peopleWithVoiceprintConsent={stats.peopleWithVoiceprintConsent}
            />

            <Card>
                <CardHeader>
                    <CardTitle className='flex justify-between items-center gap-4 flex-wrap'>
                        <div className='flex items-center gap-3'>
                            <span>People</span>
                            {selected.size > 0 && (
                                <span className='inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm font-normal'>
                                    {selected.size} selected
                                    <Button
                                        variant='ghost'
                                        size='sm'
                                        className='h-5 w-5 p-0 text-muted-foreground'
                                        onClick={() => setSelected(new Set())}
                                        aria-label='Clear selection'
                                    >
                                        <X className='h-3.5 w-3.5' />
                                    </Button>
                                </span>
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                            {cityId && <CouncilQrStripsButton cityId={cityId} labelled personIds={qrScope} fileLabel={selectedBody?.name} />}
                            {cityId && <BulkVoiceprintDialog cityId={cityId} currentCityName={currentCityName} personIds={voiceprintScope} />}
                            <span className='text-muted-foreground text-sm ml-2'>{currentCityName}</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredPeople.length === 0 ? (
                        <div className='text-center py-8 text-muted-foreground'>{t("noItems")}</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className='w-10'>
                                        <Checkbox
                                            checked={headerState}
                                            onCheckedChange={() => setSelected(toggleAll(visibleSelectable, selected))}
                                            disabled={visibleSelectable.length === 0}
                                            aria-label='Select everyone shown'
                                        />
                                    </TableHead>
                                    <TableHead>Name</TableHead>
                                    {/* The tick is a value, so it gets a column, and the
                                        header says what it means. The two dialogs stay in
                                        Actions. Same split as ReviewsTable. */}
                                    <TableHead className='w-16 text-center'>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className='inline-flex cursor-help'>
                                                        <UserCheck className='h-4 w-4' aria-label='Connected account' />
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    An account administers this person&apos;s page.
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableHead>
                                    <TableHead className='text-right'>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPeople.map(person => (
                                    <TableRow key={person.id} data-state={selected.has(person.id) ? "selected" : undefined}>
                                        <TableCell className='w-10'>
                                            <Checkbox
                                                checked={selected.has(person.id)}
                                                onCheckedChange={on => toggleOne(person.id, on === true)}
                                                disabled={!selectable(person.id)}
                                                aria-label={selectable(person.id) ? `Select ${person.name}` : `Nothing to export for ${person.name}`}
                                                title={selectable(person.id) ? undefined : "No QR code or voiceprint applies: no sign-up code can be printed, and the person has a voiceprint already."}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <PersonBadge person={person} size='sm' />
                                        </TableCell>
                                        <TableCell className='w-16 text-center'>
                                            {person._count.administrators > 0 && (
                                                <Check
                                                    className='h-4 w-4 text-green-600 inline-block'
                                                    aria-label='Has a connected account'
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className='text-right'>
                                            <div className='flex justify-end gap-2 items-center'>
                                                <VoicePrintConsentControl
                                                    personId={person.id}
                                                    personName={person.name}
                                                    status={consents[person.id] ?? null}
                                                    ownConsentOnly={voiceprintNeedsOwnConsent(person.roles)}
                                                />
                                                <VoiceprintActions
                                                    personId={person.id}
                                                    personName={person.name}
                                                    voicePrint={(person.voicePrints && person.voicePrints[0]) || null}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
