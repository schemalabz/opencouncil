import { ReportForm, ReportContract } from "@/components/admin/reports/ReportForm";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { getReportContract } from "@/lib/offers/state";
import { CUSTOMER_CITY_WHERE } from "@/lib/cityStatus";

export default async function Page() {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.city.findMany({
        where: CUSTOMER_CITY_WHERE,
        select: { id: true, name: true, name_municipality: true },
        orderBy: { name: 'asc' }
    });

    // The contract a report is about drives the default period, the half-year
    // presets and the ΑΔΑΜ prefill.
    const offers = await prisma.offer.findMany({
        where: { cityId: { in: cities.map(c => c.id) } },
    });

    const contracts: Record<string, ReportContract> = {};
    for (const city of cities) {
        const contract = getReportContract(offers.filter(o => o.cityId === city.id));
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
