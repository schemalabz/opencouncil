"use client";
import { useState, Suspense, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import List from "@/components/List";
import { Offer } from '@prisma/client'
import OfferForm from "./offer-form";
import { createOffer, getOffer, getOffers } from "@/lib/db/offers";
function OfferCard({ item: offer }: { item: Offer }) {
    return (
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
            <a href={`/offer-letter/${offer.id}`}>
                <CardHeader>
                    <CardTitle>{offer.recipientName}</CardTitle>
                    <CardDescription>{offer.type}</CardDescription>
                </CardHeader>
            </a>
        </Card>
    );
}

export default function Offers() {
    const t = useTranslations('Offer');
    const [offers, setOffers] = useState<Offer[]>([]);
    useEffect(() => {
        getOffers().then(setOffers);
    }, []);

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Offers</h1>
            </div>

            <Suspense fallback={
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            }>
                <List
                    items={offers}
                    editable={true}
                    ItemComponent={OfferCard}
                    FormComponent={OfferForm}
                    formProps={{
                        onSuccess: async (data: any) => {
                            try {
                                const newOffer = await createOffer(data);
                                setOffers([...offers, newOffer]);
                            } catch (error) {
                                console.error('Error creating offer:', error);
                            }
                        }
                    }}
                    t={t}
                />
            </Suspense>
        </div>
    );
}
