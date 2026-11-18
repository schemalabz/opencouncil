"use client";
import { useState, useMemo } from "react";
import { addDays, parseISO } from "date-fns";
import { useTranslations } from "next-intl";
import {
    ChevronRight,
    ChevronDown,
    Pencil,
    RefreshCw,
    CalendarPlus,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Offer } from "@prisma/client";
import OfferForm from "./offer-form";
import { getOffers, updateOffer } from "@/lib/db/offers";
import { ADAM_REGEX, ADAM_FORMAT_MESSAGE } from "@/lib/zod-schemas/offer";
import { dayInputValue } from "@/lib/utils/rosterDates";
import { calculateOfferTotals, formatCurrency } from "@/lib/utils";
import { formatDate } from "@/lib/formatters/time";
import {
    categorizeCities,
    calculateARR,
    calculateTotalValue,
    getOfferState,
    getDisplayState,
    getLivePendingOffers,
    isSigned,
    type CityGroup as CityGroupType,
    type OfferDisplayState,
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

function StateBadge({ state }: { state: OfferDisplayState }) {
    const config: Record<OfferDisplayState, { label: string; cls: string }> = {
        active: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
        upcoming: { label: "Upcoming", cls: "bg-sky-100 text-sky-800" },
        expired: { label: "Expired", cls: "bg-gray-100 text-gray-700" },
        pending: { label: "Pending", cls: "bg-amber-100 text-amber-800" },
        superseded: { label: "Superseded", cls: "bg-gray-100 text-gray-500" },
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
    sublabel,
}: {
    label: string;
    value: string;
    accent?: "emerald" | "sky" | "amber";
    sublabel?: string;
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
                {sublabel && (
                    <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
                )}
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// ExtendPopover — record a contract extension on a signed offer
// ---------------------------------------------------------------------------

function ExtendPopover({ offer, onChanged }: { offer: Offer; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [day, setDay] = useState("");
    const [adam, setAdam] = useState("");
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const adamValid = !adam || ADAM_REGEX.test(adam);

    // Each open starts from the stored values: the edit form can change them,
    // and a cancelled edit here must not stay.
    const onOpenChange = (next: boolean) => {
        if (next) {
            setDay(offer.extendedUntil ? dayInputValue(offer.extendedUntil) : "");
            setAdam(offer.extensionAdam ?? "");
            setFailed(false);
        }
        setOpen(next);
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            await updateOffer(offer.id, {
                extendedUntil: parseISO(day),
                extensionAdam: adam || null,
            });
            setOpen(false);
            onChanged();
        } catch {
            setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                    <CalendarPlus className="h-4 w-4 mr-1" />
                    Extend until
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
                <form onSubmit={save} className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor={`extend-day-${offer.id}`}>Extend until</Label>
                        <Input
                            id={`extend-day-${offer.id}`}
                            type="date"
                            required
                            min={dayInputValue(addDays(offer.endDate, 1))}
                            value={day}
                            onChange={(e) => setDay(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`extend-adam-${offer.id}`}>Extension ΑΔΑΜ (optional)</Label>
                        <Input
                            id={`extend-adam-${offer.id}`}
                            value={adam}
                            onChange={(e) => setAdam(e.target.value.trim())}
                            placeholder="26SYMV019872451"
                        />
                        {!adamValid && (
                            <p className="text-xs text-destructive">{ADAM_FORMAT_MESSAGE}</p>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Prices and totals do not change.
                    </p>
                    {failed && (
                        <p className="text-xs text-destructive">The extension was not saved.</p>
                    )}
                    <Button type="submit" size="sm" disabled={saving || !day || !adamValid}>
                        Save
                    </Button>
                </form>
            </PopoverContent>
        </Popover>
    );
}

// ---------------------------------------------------------------------------
// OfferLine — single offer row, with optional edit Sheet
// ---------------------------------------------------------------------------

function OfferLine({
    offer,
    cityOffers,
    editable,
    onChanged,
    actions,
}: {
    offer: Offer;
    /** All offers of the same city — used to detect superseded pendings. */
    cityOffers?: Offer[];
    editable: boolean;
    onChanged: () => void;
    /** Extra row-level actions (e.g. Renew on the current offer). */
    actions?: React.ReactNode;
}) {
    const [editOpen, setEditOpen] = useState(false);
    const totals = calculateOfferTotals(offer);
    const state = getDisplayState(offer, cityOffers ?? []);
    const showMissingAdamWarning =
        (state === "active" || state === "upcoming") && offer.agreed && !offer.adam;

    return (
        <div
            className={`flex justify-between items-center py-2 px-4 hover:bg-accent/30 ${
                state === "superseded" ? "opacity-60" : ""
            }`}
        >
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
                    {formatDate(offer.startDate)} →{" "}
                    {formatDate(offer.endDate)}
                    {offer.extendedUntil && offer.extendedUntil > offer.endDate &&
                        ` (extended to ${formatDate(offer.extendedUntil)})`}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <span className="font-medium">{formatCurrency(totals.total)}</span>
                {actions}
                {editable && isSigned(offer) && (
                    <ExtendPopover offer={offer} onChanged={onChanged} />
                )}
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

function RenewSheet({
    group,
    onChanged,
}: {
    group: CityGroupType;
    onChanged: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Renew
                </Button>
            </SheetTrigger>
            <SheetContent className="h-full overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Renew Offer · {group.cityId}</SheetTitle>
                </SheetHeader>
                <OfferForm
                    renewFrom={group.primaryOffer}
                    onSuccess={() => {
                        setOpen(false);
                        onChanged();
                    }}
                />
            </SheetContent>
        </Sheet>
    );
}

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
                    <span className="font-semibold">
                        {formatCurrency(primaryTotals.total)}
                    </span>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0 pb-2 border-t">
                    {group.offers.map((offer) => (
                        <OfferLine
                            key={offer.id}
                            offer={offer}
                            cityOffers={group.offers}
                            editable
                            onChanged={onChanged}
                            actions={
                                showRenew && offer.id === primary.id ? (
                                    <RenewSheet group={group} onChanged={onChanged} />
                                ) : undefined
                            }
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
    // Pipeline counts live pending proposals only: not superseded by a signed
    // offer for the same period, and touched in the last 3 months (stale
    // proposals are effectively dead and shouldn't inflate it).
    const pipelineCutoff = new Date();
    pipelineCutoff.setMonth(pipelineCutoff.getMonth() - 3);
    const pendingOffers = getLivePendingOffers(offers).filter(
        (o) => o.createdAt > pipelineCutoff || o.updatedAt > pipelineCutoff
    );

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
                    sublabel="Offers created or updated in the last 3 months"
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
