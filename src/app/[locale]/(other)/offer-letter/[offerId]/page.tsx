import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/db/offers'
import { formatCurrency } from '@/lib/utils'
import OfferLetter from '@/components/offer-letter/offer-letter'
import SupersededOffer from '@/components/offer-letter/superseded-offer'
import { getPostHogClient } from '@/lib/posthog-server'

interface Props {
    params: Promise<{
        offerId: string
    }>
}
export default async function OfferLetterPage(props: Props) {
    const params = await props.params;
    const offer = await getOffer(params.offerId)

    if (!offer) {
        notFound()
    }

    const posthog = getPostHogClient();
    posthog.capture({
        distinctId: "anonymous",
        event: "offer_letter_viewed",
        properties: { offer_id: params.offerId },
    });

    // Check if offer is superseded by a newer one
    if ('oldId' in offer) {
        return <SupersededOffer oldId={offer.oldId} newId={offer.newId} />
    }

    return <OfferLetter offer={offer} />;
}