import { ReportForm, ReportContract } from "@/components/admin/reports/ReportForm";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { getOfferState } from "@/lib/offers/state";
import { CUSTOMER_CITY_WHERE } from "@/lib/cityStatus";

export default async function Page() {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.city.findMany({
        where: CUSTOMER_CITY_WHERE,
        select: { id: true, name: true, name_municipality: true },
        orderBy: { name: 'asc' }
    });

    // The contract a report is about: the city's in-effect offer, falling back
    // to its most recent one. Drives the default period, the half-year presets
    // and the ΑΔΑΜ prefill.
    const offers = await prisma.offer.findMany({
        where: { cityId: { in: cities.map(c => c.id) } },
        orderBy: { createdAt: 'desc' },
    });

    const contracts: Record<string, ReportContract> = {};
    for (const city of cities) {
        const cityOffers = offers.filter(o => o.cityId === city.id);
        const contract = cityOffers.find(o => getOfferState(o) === 'active') ?? cityOffers[0];
        if (contract) {
            contracts[city.id] = {
                startDate: contract.startDate.toISOString(),
                endDate: contract.endDate.toISOString(),
                adam: contract.adam,
            };
        }
    }

    return <ReportForm cities={cities} contracts={contracts} />;
}
