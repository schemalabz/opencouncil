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
import { BarChart, Bar, XAxis, YAxis, Legend, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart";

type GroupedOffers = {
    [key: string]: Offer[]; // cityId -> offers
    noCity: Offer[];
}

function DiscountBadge({ discount }: { discount: number }) {
    return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            {discount}% off
        </span>
    );
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
                <DiscountBadge discount={offer.discountPercentage} />
            </div>
            <div>{formatCurrency(totals.total)}</div>
        </div>
    );
}

function CityGroup({ cityId, offers }: { cityId: string, offers: Offer[] }) {
    const [isExpanded, setIsExpanded] = useState(false);
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
                        <DiscountBadge discount={mostRecentOffer.discountPercentage} />
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

export default function Offers({ initialOffers }: { initialOffers: Offer[] }) {
    const [offers, setOffers] = useState<Offer[]>(initialOffers);
    const [groupedOffers, setGroupedOffers] = useState<GroupedOffers>({ noCity: [] });
    const [showCharts, setShowCharts] = useState(false);

    useEffect(() => {
        // Group offers by cityId
        const grouped = offers.reduce((acc: GroupedOffers, offer) => {
            const key = offer.cityId || 'noCity';
            acc[key] = acc[key] || [];
            acc[key].push(offer);
            return acc;
        }, { noCity: [] });

        setGroupedOffers(grouped);
    }, [offers]);

    // Calculate total amount (only most recent offer per city)
    const totalAmount = Object.entries(groupedOffers).reduce((total, [cityId, cityOffers]) => {
        if (cityOffers.length === 0) return total;

        const mostRecent = [...cityOffers].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        return total + calculateOfferTotals(mostRecent).total;
    }, 0);

    // Prepare data for charts
    const cityTotals = Object.entries(groupedOffers).map(([cityId, cityOffers]) => {
        if (cityId === 'noCity') return null;
        const mostRecent = [...cityOffers].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        const totals = calculateOfferTotals(mostRecent);
        return {
            name: cityId,
            total: totals.total,
            platformTotal: totals.platformTotal,
            ingestionTotal: totals.ingestionTotal,
            discount: totals.discount,
        };
    }).filter(Boolean);

    const correctnessGuaranteeData = offers.reduce(
        (acc: { withGuarantee: number; withoutGuarantee: number }, offer) => {
            if (offer.correctnessGuarantee) {
                acc.withGuarantee++;
            } else {
                acc.withoutGuarantee++;
            }
            return acc;
        },
        { withGuarantee: 0, withoutGuarantee: 0 }
    );

    const pieChartData = [
        { name: 'With Guarantee', value: correctnessGuaranteeData.withGuarantee },
        { name: 'Without Guarantee', value: correctnessGuaranteeData.withoutGuarantee },
    ];

    const COLORS = ['#0088FE', '#00C49F'];

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Offers</h1>
                <div className="text-2xl font-semibold">
                    Total Value: {formatCurrency(totalAmount)}
                </div>
            </div>

            <Card className="mb-8">
                <CardHeader
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => setShowCharts(!showCharts)}
                >
                    <div className="flex items-center gap-2">
                        {showCharts ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <CardTitle>Analytics</CardTitle>
                    </div>
                </CardHeader>
                {showCharts && (
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Offer Totals by City</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer
                                        config={{
                                            total: {
                                                label: "Total",
                                                color: "hsl(var(--chart-1))",
                                            },
                                            platformPrice: {
                                                label: "Platform Price",
                                                color: "hsl(var(--chart-2))",
                                            },
                                            ingestionCost: {
                                                label: "Ingestion Cost",
                                                color: "hsl(var(--chart-3))",
                                            },
                                            discount: {
                                                label: "Discount",
                                                color: "hsl(var(--chart-4))",
                                            },
                                        }}
                                        className="h-[300px]"
                                    >
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={cityTotals}>
                                                <XAxis dataKey="name" />
                                                <YAxis />
                                                <ChartTooltip content={<ChartTooltipContent />} />
                                                <Legend />
                                                <Bar dataKey="total" fill="var(--color-total)" />
                                                <Bar dataKey="platformTotal" fill="var(--color-platformPrice)" />
                                                <Bar dataKey="ingestionTotal" fill="var(--color-ingestionCost)" />
                                                <Bar dataKey="discount" fill="var(--color-discount)" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </ChartContainer>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Correctness Guarantee Distribution</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={pieChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {pieChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                )}
            </Card>

            <Suspense fallback={
                <div className="flex justify-center items-center h-full">
                    <div className="w-4 h-4 border-t-2 border-b-2 border-gray-900 rounded-full animate-spin"></div>
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
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            // Mock form submission
                            const formData = new FormData(e.target as HTMLFormElement);
                            const newOffer: Offer = {
                                id: String(offers.length + 1),
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                type: 'pilot',
                                startDate: new Date(formData.get('startDate') as string),
                                endDate: new Date(formData.get('endDate') as string),
                                recipientName: formData.get('recipientName') as string,
                                platformPrice: parseFloat(formData.get('platformPrice') as string),
                                ingestionPerHourPrice: parseFloat(formData.get('ingestionPerHourPrice') as string),
                                hoursToIngest: parseInt(formData.get('hoursToIngest') as string),
                                discountPercentage: parseFloat(formData.get('discountPercentage') as string),
                                meetingsToIngest: parseInt(formData.get('meetingsToIngest') as string),
                                cityId: formData.get('cityId') as string,
                                correctnessGuarantee: formData.get('correctnessGuarantee') === 'true',
                                respondToEmail: formData.get('respondToEmail') as string,
                                respondToPhone: formData.get('respondToPhone') as string,
                                respondToName: formData.get('respondToName') as string,
                            };
                            setOffers([...offers, newOffer]);
                        }} className="space-y-4 mt-4">
                            <div>
                                <label htmlFor="recipientName" className="block text-sm font-medium text-gray-700">Recipient Name</label>
                                <input type="text" id="recipientName" name="recipientName" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Start Date</label>
                                <input type="date" id="startDate" name="startDate" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">End Date</label>
                                <input type="date" id="endDate" name="endDate" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="platformPrice" className="block text-sm font-medium text-gray-700">Platform Price</label>
                                <input type="number" id="platformPrice" name="platformPrice" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="ingestionPerHourPrice" className="block text-sm font-medium text-gray-700">Ingestion Per Hour Price</label>
                                <input type="number" id="ingestionPerHourPrice" name="ingestionPerHourPrice" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="hoursToIngest" className="block text-sm font-medium text-gray-700">Hours to Ingest</label>
                                <input type="number" id="hoursToIngest" name="hoursToIngest" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="discountPercentage" className="block text-sm font-medium text-gray-700">Discount Percentage</label>
                                <input type="number" id="discountPercentage" name="discountPercentage" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="meetingsToIngest" className="block text-sm font-medium text-gray-700">Meetings to Ingest</label>
                                <input type="number" id="meetingsToIngest" name="meetingsToIngest" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="cityId" className="block text-sm font-medium text-gray-700">City</label>
                                <input type="text" id="cityId" name="cityId" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="correctnessGuarantee" className="block text-sm font-medium text-gray-700">Correctness Guarantee</label>
                                <select id="correctnessGuarantee" name="correctnessGuarantee" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="respondToEmail" className="block text-sm font-medium text-gray-700">Respond To Email</label>
                                <input type="email" id="respondToEmail" name="respondToEmail" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="respondToPhone" className="block text-sm font-medium text-gray-700">Respond To Phone</label>
                                <input type="tel" id="respondToPhone" name="respondToPhone" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <div>
                                <label htmlFor="respondToName" className="block text-sm font-medium text-gray-700">Respond To Name</label>
                                <input type="text" id="respondToName" name="respondToName" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                            </div>
                            <Button type="submit" className="w-full">Add Offer</Button>
                        </form>
                    </SheetContent>
                </Sheet>
            </Suspense>
        </div>
    );
}
