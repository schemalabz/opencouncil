import { useEffect, useState } from "react";
import Combobox from "../Combobox";
import { cn } from "@/lib/utils";
import { getCities } from "@/lib/db/cities";
import { getPartiesForCity } from "@/lib/db/parties";
import { City, Party, Person } from "@prisma/client";
import { getPeopleForCity } from "@/lib/db/people";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FilterIcon } from "lucide-react";


export type Filters = {
    cityId?: City["id"];
    partyId?: Party["id"];
    personId?: Person["id"];
}

export default function MetadataFilters({ className, filters, setFilters }: { className?: string, filters: Filters, setFilters: (filters: Filters) => void }) {
    const [cities, setCities] = useState<City[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [people, setPeople] = useState<Person[]>([]);

    const selectedCityName = filters.cityId ? cities.find(c => c.id === filters.cityId)?.name ?? null : null;
    const selectedPartyName = filters.partyId ? parties.find(p => p.id === filters.partyId)?.name_short ?? null : null;
    const selectedPersonName = filters.personId ? people.find(p => p.id === filters.personId)?.name_short ?? null : null;

    const fetchCities = async () => {
        const fetchedCities = await getCities();
        setCities(fetchedCities);
    }

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
    }, []);

    useEffect(() => {
        if (filters.cityId) {
            fetchParties(filters.cityId);
            fetchPeople(filters.cityId);
        } else {
            setParties([]);
            setPeople([]);
        }
    }, [filters.cityId]);

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

    const renderComboboxes = (className?: string) => (
        <div className={cn("flex flex-col lg:flex-row gap-2", className)}>
            <Combobox
                options={cities.map(c => c.name)}
                value={selectedCityName}
                onChange={onCityChange}
                placeholder="Πόλη"
                loading={cities.length === 0}
                className="w-full lg:flex-1"
            />
            <Combobox
                options={parties.map(p => p.name_short)}
                value={selectedPartyName}
                onChange={onPartyChange}
                placeholder="Παράταξη"
                disabled={!filters.cityId}
                loading={filters.cityId !== undefined && parties.length === 0}
                className="w-full lg:flex-1"
            />
            <Combobox
                options={availablePeople.map(p => p.name_short)}
                value={selectedPersonName}
                onChange={onPersonChange}
                placeholder="Πρόσωπο"
                disabled={!filters.cityId}
                loading={filters.cityId !== undefined && people.length === 0}
                className="w-full lg:flex-1"
            />
        </div>
    );

    return (
        <div className={className}>
            <div className="lg:hidden">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                            <FilterIcon className="mr-2 h-4 w-4" />
                            Φίλτρα
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        {renderComboboxes()}
                    </PopoverContent>
                </Popover>
            </div>
            <div className="hidden lg:block w-full">
                {renderComboboxes()}
            </div>
        </div>
    )
}