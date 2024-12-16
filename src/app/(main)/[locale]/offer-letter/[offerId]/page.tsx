import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/db/offers'
import { formatCurrency } from '@/lib/utils'
import OfferLetter from '@/components/offer-letter/offer-letter'
import SupersededOffer from '@/components/offer-letter/superseded-offer'

interface Props {
    params: {
        offerId: string
    }
}
export default async function OfferLetterPage({ params }: Props) {
    const offer = await getOffer(params.offerId)

    if (!offer) {
        notFound()
    }

    // Check if offer is superseded by a newer one
    if ('oldId' in offer) {
        return <SupersededOffer oldId={offer.oldId} newId={offer.newId} />
    }

    return <OfferLetter offer={offer} />;
}