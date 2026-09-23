"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { Check, Search, UserCheck } from "lucide-react";
import { PeopleStats } from "@/components/admin/people/people-stats";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PersonWithVoicePrints } from "@/lib/db/people";
import type { VoicePrintConsentStatus } from "@/lib/db/personConsent";
import { VoicePrintConsentControl } from "@/components/persons/VoicePrintConsentControl";
import { useTranslations } from "next-intl";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { VoiceprintActions } from "./voiceprint-actions";
import { BulkVoiceprintDialog } from "./bulk-voiceprint-dialog";
import ElectedOrderSheet from "./ElectedOrderSheet";
import { AdministrativeBody } from "@prisma/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PeopleProps {
    people: PersonWithVoicePrints[];
    /** The voiceprint consent in force, by person id; a person with none has no entry. */
    consents: Record<string, VoicePrintConsentStatus>;
    currentCityName: string;
    administrativeBodies: AdministrativeBody[];
}

export default function People({ people, consents, currentCityName, administrativeBodies }: PeopleProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [electedOrderOpen, setElectedOrderOpen] = useState(false);
    const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
    const t = useTranslations("Person");
    const tElectedOrder = useTranslations("ElectedOrderSheet");

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

    const handleBodySelect = (bodyId: string) => {
        setSelectedBodyId(bodyId);
        // Delay opening the Sheet to let the DropdownMenu (also a Radix Dialog)
        // fully close first — otherwise two dialogs transitioning simultaneously
        // can leave pointer-events: none stuck on the body.
        requestAnimationFrame(() => setElectedOrderOpen(true));
    };

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
                    <CardTitle className='flex justify-between'>
                        <span>People</span>
                        <div className='flex items-center gap-2'>
                            {cityId && administrativeBodies.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            {tElectedOrder('triggerButton')}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {administrativeBodies.map(body => (
                                            <DropdownMenuItem
                                                key={body.id}
                                                onClick={() => handleBodySelect(body.id)}
                                            >
                                                {body.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            {cityId && <BulkVoiceprintDialog cityId={cityId} currentCityName={currentCityName} />}
                            <span className='text-muted-foreground text-sm ml-2'>{currentCityName}</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredPeople.length === 0 ? (
                        <div className='text-center py-8 text-muted-foreground'>{t("noItems")}</div>
                    ) : (
                        <div>
                            {/* The tick is a value, so it gets a column of its own; the two
                                dialogs stay in the actions group. Same split as ReviewsTable. */}
                            <div className='flex items-center border-b pb-2'>
                                <span className='flex-1 min-w-0' />
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className='w-14 flex justify-center text-muted-foreground cursor-help'>
                                                <UserCheck className='h-4 w-4' aria-label='Connected account' />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            An account administers this person&apos;s page.
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <span className='w-[248px]' />
                            </div>
                            <div className='space-y-2 pt-2'>
                                {filteredPeople.map(person => (
                                    <div key={person.id} className='flex items-center border-b pb-2'>
                                        {/* min-w-0 so a long role subtitle shrinks instead of
                                            pushing the columns out of the card. */}
                                        <div className='flex-1 min-w-0'>
                                            <PersonBadge person={person} size='sm' />
                                        </div>
                                        <span className='w-14 flex justify-center'>
                                            {person._count.administrators > 0 && (
                                                <Check
                                                    className='h-4 w-4 text-green-600'
                                                    aria-label='Has a connected account'
                                                />
                                            )}
                                        </span>
                                        <div className='w-[248px] flex justify-end gap-2 items-center'>
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {cityId && (
                <ElectedOrderSheet
                    open={electedOrderOpen && selectedBodyId !== null}
                    onOpenChange={setElectedOrderOpen}
                    people={people}
                    cityId={cityId}
                    administrativeBodyId={selectedBodyId ?? ""}
                />
            )}
        </>
    );
}
