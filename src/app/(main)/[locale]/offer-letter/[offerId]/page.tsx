import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/db/offers'
import { formatCurrency } from '@/lib/utils'
import OfferLetter from '@/components/offer-letter/offer-letter'

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

    return <OfferLetter offer={offer} />;
}
