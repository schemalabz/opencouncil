'use client'
import { useState, useEffect } from 'react';
import { City, CouncilMeeting } from '@prisma/client';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../ui/card";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, Trash } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import CityForm from './CityForm';
import { CityCard } from './CityCard';
import { useTranslations } from 'next-intl';
import FormSheet from '../FormSheet';
import { useSession } from 'next-auth/react';

interface CitiesListProps {
    cities: (City & { councilMeetings: CouncilMeeting[] })[];
}

export function CitiesList({ cities }: CitiesListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCity, setSelectedCity] = useState<City | null>(null);
    const t = useTranslations('CitiesList');
    const { data: session } = useSession()

    const filteredCities = cities.filter(city =>
        city.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <Input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-grow mr-4"
                />
                {session?.user?.isSuperAdmin && (
                    <FormSheet FormComponent={CityForm} formProps={{}} title={t('addCity')} type="add" />
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCities.length === 0 ? (
                    <div className="col-span-full text-center">
                        <p className="text-muted-foreground">{t('noCitiesFound')}</p>
                    </div>
                ) : (
                    filteredCities.map((city) => (
                        <CityCard key={city.id} city={city} />
                    ))
                )}
            </div>
            {session?.user?.isSuperAdmin && (
                <Sheet>
                    <SheetContent>
                        <SheetHeader>
                            <SheetTitle>{t('editCity')}</SheetTitle>
                        </SheetHeader>
                        <CityForm city={selectedCity!} onSuccess={() => setSelectedCity(null)} />
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}