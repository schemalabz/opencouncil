import { ReportForm } from "@/components/admin/reports/ReportForm";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

export default async function Page() {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.city.findMany({
        where: { officialSupport: true },
        select: { id: true, name: true, name_municipality: true },
        orderBy: { name: 'asc' }
    });

    // Fetch the most recent offer's startDate for each city
    const offers = await prisma.offer.findMany({
        where: { cityId: { in: cities.map(c => c.id) } },
        orderBy: { createdAt: 'desc' },
        distinct: ['cityId'],
        select: { cityId: true, startDate: true },
    });
    const offerStartDates: Record<string, string> = {};
    for (const offer of offers) {
        if (offer.cityId) {
            offerStartDates[offer.cityId] = offer.startDate.toISOString();
        }
    }

    return <ReportForm cities={cities} offerStartDates={offerStartDates} />;
}
