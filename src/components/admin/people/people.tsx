"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useMemo } from "react";
import { Check, Search, UserCheck } from "lucide-react";
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

interface PeopleProps {
    people: PersonWithVoicePrints[];
    /** The voiceprint consent in force, by person id; a person with none has no entry. */
    consents: Record<string, VoicePrintConsentStatus>;
    currentCityName: string;
}

export default function People({ people, consents, currentCityName }: PeopleProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const t = useTranslations("Person");

    const filteredPeople = useMemo(() => {
        if (!searchQuery) return people;

        return people.filter(
            person =>
                person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                person.name_en.toLowerCase().includes(searchQuery.toLowerCase()),
        );
    }, [people, searchQuery]);

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
                    <CardTitle className='flex justify-between items-center'>
                        <span>People</span>
                        <div className='flex items-center gap-2'>
                            {cityId && <BulkVoiceprintDialog cityId={cityId} currentCityName={currentCityName} />}
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
                                    <TableRow key={person.id}>
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
