import { PrismaClient } from '@prisma/client'
import { CitiesList } from "@/components/cities/CitiesList"
import { isEditMode } from '@/lib/auth';

const prisma = new PrismaClient()

export default async function CitiesPage() {
    const cities = await prisma.city.findMany();

    return (
        <CitiesList cities={cities} editable={isEditMode()} />
    )
}