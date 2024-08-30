import { PrismaClient } from '@prisma/client'
import { Button } from "@/components/ui/button"
import { CitiesList } from "@/components/cities/CitiesList"

const prisma = new PrismaClient()

export default async function CitiesPage() {
    const cities = await prisma.city.findMany()

    return (
        <CitiesList cities={cities} editable={true} />
    )
}