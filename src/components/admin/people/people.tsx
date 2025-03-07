"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { PeopleStats } from "@/components/admin/people/people-stats";
import { Input } from "@/components/ui/input";
import { PersonWithRelations } from "@/lib/getMeetingData";
import { useTranslations } from "next-intl";
import { PersonBadge } from "@/components/persons/PersonBadge";

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
        }),
        [filteredPeople],
    );

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
            />

            <Card>
                <CardHeader>
                    <CardTitle className='flex justify-between'>
                        <span>People</span>
                        <span className='text-muted-foreground text-sm'>{currentCityName}</span>
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
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
