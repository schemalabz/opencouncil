"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
    ChevronRight,
    ChevronDown,
    Pencil,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Offer } from "@prisma/client";
import OfferForm from "./offer-form";
import { getOffers } from "@/lib/db/offers";
import { calculateOfferTotals, formatCurrency } from "@/lib/utils";
import {
    categorizeCities,
    calculateARR,
    calculateTotalValue,
    getOfferState,
    isSigned,
    type CityGroup as CityGroupType,
    type OfferState,
} from "@/lib/offers/state";

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function DiscountBadge({ discount }: { discount: number }) {
    if (discount === 0) return null;
    return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            {discount}% off
        </span>
    );
}

function StateBadge({ state }: { state: OfferState }) {
    const config: Record<OfferState, { label: string; cls: string }> = {
        active: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
        upcoming: { label: "Upcoming", cls: "bg-sky-100 text-sky-800" },
        expired: { label: "Expired", cls: "bg-gray-100 text-gray-700" },
        pending: { label: "Pending", cls: "bg-amber-100 text-amber-800" },
    };
    const { label, cls } = config[state];
    return (
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
            {label}
        </span>
    );
}

function MissingAdamBadge() {
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-900"
            title="Agreed but no ΑΔΑΜ filed"
        >
            <AlertTriangle className="h-3 w-3" />
            no ΑΔΑΜ
        </span>
    );
}

function SignedBadge() {
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800"
            title="Signed (ΑΔΑΜ filed)"
        >
            <CheckCircle2 className="h-3 w-3" />
            signed
        </span>
    );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: "emerald" | "sky" | "amber";
}) {
    const accentCls = {
        emerald: "text-emerald-700",
        sky: "text-sky-700",
        amber: "text-amber-700",
    } as const;
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div
                    className={`text-2xl font-semibold mt-1 ${accent ? accentCls[accent] : ""}`}
                >
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// OfferLine — single offer row, with optional edit Sheet
// ---------------------------------------------------------------------------

function OfferLine({
    offer,
    editable,
    onChanged,
}: {
    offer: Offer;
    editable: boolean;
    onChanged: () => void;
}) {
    const [editOpen, setEditOpen] = useState(false);
    const totals = calculateOfferTotals(offer);
    const state = getOfferState(offer);
    const showMissingAdamWarning =
        (state === "active" || state === "upcoming") && offer.agreed && !offer.adam;

    return (
        <div className="flex justify-between items-center py-2 px-4 hover:bg-accent/30">
            <div className="flex items-center gap-3 flex-wrap">
                <a
                    href={`/offer-letter/${offer.id}`}
                    className="hover:underline font-medium"
                >
                    {offer.recipientName}
                </a>
                <StateBadge state={state} />
                {offer.adam && <SignedBadge />}
                {showMissingAdamWarning && <MissingAdamBadge />}
                <DiscountBadge discount={offer.discountPercentage} />
                <span className="text-xs text-muted-foreground">
                    {offer.startDate.toLocaleDateString()} →{" "}
                    {offer.endDate.toLocaleDateString()}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <span className="font-medium">{formatCurrency(totals.total)}</span>
                {editable && (
                    <Sheet open={editOpen} onOpenChange={setEditOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="h-full overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle>Edit Offer</SheetTitle>
                            </SheetHeader>
                            <OfferForm
                                offer={offer}
                                onSuccess={() => {
                                    setEditOpen(false);
                                    onChanged();
                                }}
                            />
                        </SheetContent>
                    </Sheet>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// CityCard — one card per city in a section
// ---------------------------------------------------------------------------

function CityCard({
    group,
    showRenew,
    onChanged,
}: {
    group: CityGroupType;
    showRenew: boolean;
    onChanged: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [renewOpen, setRenewOpen] = useState(false);
    const primary = group.primaryOffer;
    const primaryState = getOfferState(primary);
    const primaryTotals = calculateOfferTotals(primary);

    const showMissingAdam =
        (primaryState === "active" || primaryState === "upcoming") &&
        primary.agreed &&
        !primary.adam;

    return (
        <Card className="mb-3">
            <CardHeader
                className="cursor-pointer hover:bg-accent/40 py-3"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        <CardTitle className="text-base">{group.cityId}</CardTitle>
                        <CardDescription>
                            {group.offers.length} offer
                            {group.offers.length === 1 ? "" : "s"}
                        </CardDescription>
                        {primary.adam && <SignedBadge />}
                        {showMissingAdam && <MissingAdamBadge />}
                        {group.pendingRenewals.length > 0 && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                {group.pendingRenewals.length} renewal
                                {group.pendingRenewals.length === 1 ? "" : "s"} pending
                            </span>
                        )}
                        <DiscountBadge discount={primary.discountPercentage} />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="font-semibold">
                            {formatCurrency(primaryTotals.total)}
                        </span>
                        {showRenew && (
                            <Sheet open={renewOpen} onOpenChange={setRenewOpen}>
                                <SheetTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <RefreshCw className="h-4 w-4 mr-1" />
                                        Renew
                                    </Button>
                                </SheetTrigger>
                                <SheetContent
                                    className="h-full overflow-y-auto"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <SheetHeader>
                                        <SheetTitle>Renew Offer · {group.cityId}</SheetTitle>
                                    </SheetHeader>
                                    <OfferForm
                                        renewFrom={primary}
                                        onSuccess={() => {
                                            setRenewOpen(false);
                                            onChanged();
                                        }}
                                    />
                                </SheetContent>
                            </Sheet>
                        )}
                    </div>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0 pb-2 border-t">
                    {group.offers.map((offer) => (
                        <OfferLine
                            key={offer.id}
                            offer={offer}
                            editable
                            onChanged={onChanged}
                        />
                    ))}
                </CardContent>
            )}
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Section — header + list of city cards
// ---------------------------------------------------------------------------

function Section({
    title,
    description,
    groups,
    showRenew,
    onChanged,
}: {
    title: string;
    description?: string;
    groups: CityGroupType[];
    showRenew: boolean;
    onChanged: () => void;
}) {
    if (groups.length === 0) return null;
    return (
        <section className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
                <h2 className="text-xl font-semibold">{title}</h2>
                <span className="text-sm text-muted-foreground">
                    {groups.length} {groups.length === 1 ? "city" : "cities"}
                </span>
            </div>
            {description && (
                <p className="text-sm text-muted-foreground mb-3">{description}</p>
            )}
            {groups.map((group) => (
                <CityCard
                    key={group.cityId}
                    group={group}
                    showRenew={showRenew}
                    onChanged={onChanged}
                />
            ))}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Offers({ initialOffers }: { initialOffers: Offer[] }) {
    const [offers, setOffers] = useState<Offer[]>(initialOffers);
    const [createOpen, setCreateOpen] = useState(false);

    const refresh = async () => {
        const fresh = await getOffers();
        setOffers(fresh);
    };

    const categorized = useMemo(() => categorizeCities(offers), [offers]);

    // Stats
    const activeOffers = categorized.active.map((g) => g.primaryOffer);
    const pendingOffers = offers.filter((o) => !isSigned(o));

    const arr = calculateARR(activeOffers);
    const pendingPipeline = calculateTotalValue(pendingOffers);

    return (
        <div className="container mx-auto py-8 max-w-6xl">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Offers</h1>
                <Sheet open={createOpen} onOpenChange={setCreateOpen}>
                    <SheetTrigger asChild>
                        <Button>Add Offer</Button>
                    </SheetTrigger>
                    <SheetContent className="h-full overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>Add New Offer</SheetTitle>
                        </SheetHeader>
                        <OfferForm
                            onSuccess={() => {
                                setCreateOpen(false);
                                refresh();
                            }}
                        />
                    </SheetContent>
                </Sheet>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <StatCard label="ARR" value={formatCurrency(arr)} accent="emerald" />
                <StatCard
                    label="Pending pipeline"
                    value={formatCurrency(pendingPipeline)}
                    accent="amber"
                />
            </div>

            <Section
                title="Active"
                description="Cities with a signed contract currently in effect, sorted by soonest expiring."
                groups={categorized.active}
                showRenew
                onChanged={refresh}
            />

            <Section
                title="Upcoming"
                description="Signed contracts that haven't started yet, sorted by soonest starting."
                groups={categorized.upcoming}
                showRenew={false}
                onChanged={refresh}
            />

            <Section
                title="Expired"
                description="Cities whose signed contracts have all ended."
                groups={categorized.expired}
                showRenew
                onChanged={refresh}
            />

            <Section
                title="Prospects"
                description="Cities with only pending offers (never agreed)."
                groups={categorized.prospects}
                showRenew={false}
                onChanged={refresh}
            />

            {categorized.noCity.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-3">
                        Offers without a city
                    </h2>
                    <Card>
                        <CardContent className="py-2">
                            {categorized.noCity.map((offer) => (
                                <OfferLine
                                    key={offer.id}
                                    offer={offer}
                                    editable
                                    onChanged={refresh}
                                />
                            ))}
                        </CardContent>
                    </Card>
                </section>
            )}
        </div>
    );
}
