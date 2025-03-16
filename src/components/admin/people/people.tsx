"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { PeopleStats } from "@/components/admin/people/people-stats";
import { Input } from "@/components/ui/input";
import { PersonWithRelations } from "@/lib/db/people";
import { useTranslations } from "next-intl";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { VoiceprintActions } from "./voiceprint-actions";
import { BulkVoiceprintDialog } from "./bulk-voiceprint-dialog";

interface PeopleProps {
    people: PersonWithRelations[];
    currentCityName: string;
}

export default function People({ people, currentCityName }: PeopleProps) {
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
            peopleWithVoiceprints: filteredPeople.filter(person => person.voicePrints && person.voicePrints.length > 0)
                .length,
        }),
        [filteredPeople],
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
            />

            <Card>
                <CardHeader>
                    <CardTitle className='flex justify-between'>
                        <span>People</span>
                        <div className='flex items-center'>
                            {cityId && <BulkVoiceprintDialog cityId={cityId} currentCityName={currentCityName} />}
                            <span className='text-muted-foreground text-sm ml-4'>{currentCityName}</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredPeople.length === 0 ? (
                        <div className='text-center py-8 text-muted-foreground'>{t("noItems")}</div>
                    ) : (
                        <div className='space-y-2'>
                            {filteredPeople.map(person => (
                                <div key={person.id} className='flex items-center justify-between border-b pb-2'>
                                    <div className='flex-1'>
                                        <PersonBadge person={person} size='sm' />
                                    </div>
                                    <div className='flex gap-2 items-center'>
                                        <VoiceprintActions
                                            personId={person.id}
                                            personName={person.name}
                                            voicePrint={(person.voicePrints && person.voicePrints[0]) || null}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
