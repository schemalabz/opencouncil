import { CitiesList } from "@/components/cities/CitiesList"
import { isEditMode } from '@/lib/auth';
import PilotPage from '@/components/PilotPage';
import { getCities } from '@/lib/db/cities';

export default async function CitiesPage() {
    const cities = await getCities();

    if (!isEditMode()) {
        return (
            <PilotPage cities={cities} />
        )
    }
    return (
        <CitiesList cities={cities} editable={isEditMode()} />
    )
}