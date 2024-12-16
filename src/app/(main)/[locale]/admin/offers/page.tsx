import Offers from "@/components/admin/offers/offers";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getOffers } from "@/lib/db/offers";

export default async function Page() {
    withUserAuthorizedToEdit({ root: true });
    const offers = await getOffers();
    return <Offers initialOffers={offers} />
}
