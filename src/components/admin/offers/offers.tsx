"use client";
import { useState, Suspense, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import List from "@/components/List";
import { Offer } from '@prisma/client'
import OfferForm from "./offer-form";
import { createOffer, getOffer, getOffers } from "@/lib/db/offers";
import { calculateOfferTotals, formatCurrency } from "@/lib/utils";

type GroupedOffers = {
    [key: string]: Offer[]; // cityId -> offers
    noCity: Offer[];
}

function OfferLine({ offer, isSuperseded }: { offer: Offer, isSuperseded?: boolean }) {
    const totals = calculateOfferTotals(offer);

    return (
        <div className={`flex justify-between items-center py-2 px-4 ${isSuperseded ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-4">
                <a href={`/offer-letter/${offer.id}`} className="hover:underline">
                    {offer.recipientName}
                </a>
                {isSuperseded && <span className="text-sm text-muted-foreground">(Superseded)</span>}
            </div>
            <div>{formatCurrency(totals.total)}</div>
        </div>
    );
}

function CityGroup({ cityId, offers }: { cityId: string, offers: Offer[] }) {
    const [isExpanded, setIsExpanded] = useState(false);
    // Sort offers by date, newest first
    const sortedOffers = [...offers].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const mostRecentOffer = sortedOffers[0];
    const totals = calculateOfferTotals(mostRecentOffer);

    return (
        <Card className="mb-4">
            <CardHeader
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <CardTitle>{cityId}</CardTitle>
                        <CardDescription>{offers.length} offers</CardDescription>
                    </div>
                    <div className="font-semibold">{formatCurrency(totals.total)}</div>
                </div>
            </CardHeader>
            {isExpanded && (
                <CardContent>
                    {sortedOffers.map((offer, index) => (
                        <OfferLine
                            key={offer.id}
                            offer={offer}
                            isSuperseded={index > 0}
                        />
                    ))}
                </CardContent>
            )}
        </Card>
    );
}

export default function Offers() {
    const t = useTranslations('Offer');
    const [offers, setOffers] = useState<Offer[]>([]);
    const [groupedOffers, setGroupedOffers] = useState<GroupedOffers>({ noCity: [] });

    useEffect(() => {
        getOffers().then(offers => {
            setOffers(offers);

            // Group offers by cityId
            const grouped = offers.reduce((acc: GroupedOffers, offer) => {
                const key = offer.cityId || 'noCity';
                acc[key] = acc[key] || [];
                acc[key].push(offer);
                return acc;
            }, { noCity: [] });

            setGroupedOffers(grouped);
        });
    }, []);

    // Calculate total amount (only most recent offer per city)
    const totalAmount = Object.entries(groupedOffers).reduce((total, [cityId, cityOffers]) => {
        if (cityOffers.length === 0) return total;

        const mostRecent = [...cityOffers].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        return total + calculateOfferTotals(mostRecent).total;
    }, 0);

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Offers</h1>
                <div className="text-2xl font-semibold">
                    Total Value: {formatCurrency(totalAmount)}
                </div>
            </div>

            <Suspense fallback={
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            }>
                <div className="space-y-4">
                    {Object.entries(groupedOffers).map(([cityId, offers]) => {
                        if (cityId === 'noCity') return null;
                        return (
                            <CityGroup
                                key={cityId}
                                cityId={cityId}
                                offers={offers}
                            />
                        );
                    })}

                    {groupedOffers.noCity.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Offers without city</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {groupedOffers.noCity.map(offer => (
                                    <OfferLine key={offer.id} offer={offer} />
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <Sheet>
                    <SheetTrigger asChild>
                        <Button className="mt-4">Add Offer</Button>
                    </SheetTrigger>
                    <SheetContent>
                        <SheetHeader>
                            <SheetTitle>Add New Offer</SheetTitle>
                        </SheetHeader>
                        <OfferForm
                            onSuccess={async (data: any) => {
                                try {
                                    const newOffer = await createOffer(data);
                                    setOffers([...offers, newOffer]);
                                } catch (error) {
                                    console.error('Error creating offer:', error);
                                }
                            }}
                        />
                    </SheetContent>
                </Sheet>
            </Suspense>
        </div>
    );
}
