import { CitiesList } from "@/components/cities/CitiesList"
import PilotPage from '@/components/PilotPage';
import { getCities } from '@/lib/db/cities';

export default async function CitiesPage() {
    const cities = await getCities();

    return (
        <CitiesList cities={cities} />
    )
}