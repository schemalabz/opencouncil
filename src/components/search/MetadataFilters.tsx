import { useEffect, useState, useMemo, useCallback } from "react";
import Combobox from "../Combobox";
import { cn } from "@/lib/utils";
import { getCities, getCity } from "@/lib/db/cities";
import { getPartiesForCity } from "@/lib/db/parties";
import { City, Party, Person } from "@prisma/client";
import { getPeopleForCity } from "@/lib/db/people";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilterIcon, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

export type Filters = {
    cityId?: City["id"];
    partyId?: Party["id"];
    personId?: Person["id"];
}

export default function MetadataFilters({ className, filters, setFilters }: { className?: string, filters: Filters, setFilters: (filters: Filters) => void }) {
    const [cities, setCities] = useState<City[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [isMobile, setIsMobile] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Check if we're on mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768); // 768px is the standard md breakpoint
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const fetchCities = useCallback(async () => {
        try {
            const fetchedCities = await getCities();
            let allCities = [...fetchedCities];

            // If there's a selected city that's not in the default list, try to fetch it
            if (filters.cityId && !fetchedCities.some(city => city.id === filters.cityId)) {
                const additionalCity = await getCity(filters.cityId);
                if (additionalCity) {
                    allCities.push(additionalCity);
                } else {
                    console.log(`City with ID ${filters.cityId} not found`);
                }
            }

            setCities(allCities);
        } catch (error) {
            console.error('Error fetching cities:', error);
        }
    }, [filters.cityId]);

    const fetchParties = async (cityId: City["id"]) => {
        const fetchedParties = await getPartiesForCity(cityId);
        setParties(fetchedParties);
    }

    const fetchPeople = async (cityId: City["id"]) => {
        const fetchedPeople = await getPeopleForCity(cityId);
        setPeople(fetchedPeople);
    }

    useEffect(() => {
        fetchCities();
    }, [filters.cityId, fetchCities]);

    useEffect(() => {
        if (cities.length > 0 && filters.cityId) {
            fetchParties(filters.cityId);
            fetchPeople(filters.cityId);
        }
    }, [cities, filters.cityId]);

    const onCityChange = (cityName: string | null) => {
        const cityId = cityName ? cities.find(c => c.name === cityName)?.id : undefined;
        setFilters({ cityId, partyId: undefined, personId: undefined });
    }

    const onPartyChange = (partyName: string | null) => {
        const partyId = partyName ? parties.find(p => p.name_short === partyName)?.id : undefined;
        setFilters({ ...filters, partyId, personId: undefined });
    }

    const onPersonChange = (personName: string | null) => {
        const person = people.find(p => p.name_short === personName);
        if (person) {
            setFilters({ ...filters, personId: person.id, partyId: person.partyId ?? undefined });
        } else {
            setFilters({ ...filters, personId: undefined });
        }
    }

    const selectedPartyId = filters.partyId;
    const availablePeople = selectedPartyId ? people.filter(p => p.partyId === selectedPartyId) : people;

    // Memoize selected values
    const selectedCity = useMemo(() => 
        cities.find(c => c.id === filters.cityId) ?? null,
        [cities, filters.cityId]
    );

    const selectedParty = useMemo(() => 
        parties.find(p => p.id === filters.partyId) ?? null,
        [parties, filters.partyId]
    );

    const selectedPerson = useMemo(() => 
        people.find(p => p.id === filters.personId) ?? null,
        [people, filters.personId]
    );

    const clearFilters = () => {
        setFilters({
            cityId: undefined,
            partyId: undefined,
            personId: undefined
        });
    };

    const hasActiveFilters = filters.cityId || filters.partyId || filters.personId;

    const renderFilters = (className?: string) => (
        <div className={cn("space-y-4", className)}>
            <div className="space-y-2">
                <label className="text-sm font-medium">Πόλη</label>
                <Combobox
                    items={cities}
                    value={selectedCity}
                    onChange={(city) => onCityChange(city?.name ?? null)}
                    placeholder="Επιλέξτε πόλη"
                    loading={cities.length === 0}
                    className="w-full"
                    getItemLabel={(city) => city.name}
                    getItemValue={(city) => city.name}
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium">Παράταξη</label>
                <Combobox
                    items={parties}
                    value={selectedParty}
                    onChange={(party) => onPartyChange(party?.name_short ?? null)}
                    placeholder="Επιλέξτε παράταξη"
                    disabled={!filters.cityId}
                    loading={filters.cityId !== undefined && parties.length === 0}
                    className="w-full"
                    getItemLabel={(party) => party.name_short}
                    getItemValue={(party) => party.name_short}
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium">Πρόσωπο</label>
                <Combobox
                    items={availablePeople}
                    value={selectedPerson}
                    onChange={(person) => onPersonChange(person?.name_short ?? null)}
                    placeholder="Επιλέξτε πρόσωπο"
                    disabled={!filters.cityId}
                    loading={filters.cityId !== undefined && people.length === 0}
                    className="w-full"
                    getItemLabel={(person) => person.name_short}
                    getItemValue={(person) => person.name_short}
                />
            </div>
            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                    <X className="w-4 h-4 mr-2" />
                    Καθαρισμός φίλτρων
                </Button>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <>
                <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setIsOpen(true)}
                >
                    <FilterIcon className="mr-2 h-4 w-4" />
                    Φίλτρα
                    {hasActiveFilters && (
                        <Badge variant="secondary" className="ml-2">
                            {[filters.cityId, filters.partyId, filters.personId].filter(Boolean).length}
                        </Badge>
                    )}
                </Button>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Φίλτρα</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-[400px] pr-4">
                            {renderFilters()}
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    return (
        <div className={className}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Φίλτρα</h3>
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Καθαρισμός
                    </Button>
                )}
            </div>
            {renderFilters()}
        </div>
    );
}