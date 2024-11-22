import Offers from "@/components/admin/offers/offers";
import { withUserAuthorizedToEdit } from "@/lib/auth";

export default function Page() {
    withUserAuthorizedToEdit({ root: true });
    return <Offers />
}
