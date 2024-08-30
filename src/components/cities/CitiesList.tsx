'use client'
import { useState } from 'react';
import Link from 'next/link';
import { City } from '@prisma/client';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../ui/card";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, Trash } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import CityForm from './CityForm';
import { CityCard } from './CityCard';

interface CitiesListProps {
    cities: City[];
    editable: boolean;
}

export function CitiesList({ cities, editable }: CitiesListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    const filteredCities = cities.filter(city =>
        city.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <Input
                    type="text"
                    placeholder="Search cities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-grow mr-4"
                />
                {editable && (
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add City
                            </Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>Add New City</SheetTitle>
                            </SheetHeader>
                            <CityForm onSuccess={() => { }} />
                        </SheetContent>
                    </Sheet>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredCities.length === 0 ? (
                    <div className="col-span-full text-center">
                        <p className="text-muted-foreground">No cities found</p>
                    </div>
                ) : (
                    filteredCities.map((city) => (
                        <CityCard key={city.id} city={city} />
                    ))
                )}
            </div>
            {editable && (
                <Sheet>
                    <SheetContent>
                        <SheetHeader>
                            <SheetTitle>Edit City</SheetTitle>
                        </SheetHeader>
                        <CityForm city={selectedCity!} onSuccess={() => setSelectedCity(null)} />
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}