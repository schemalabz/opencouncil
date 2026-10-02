"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, AlertCircle, CheckCircle } from "lucide-react";
import { findEligiblePeopleForVoiceprintGeneration, requestGenerateVoiceprintsForCity } from "@/lib/tasks/generateVoiceprint";
import { useToast } from "@/hooks/use-toast";

interface BulkVoiceprintDialogProps {
    cityId: string;
    currentCityName: string;
    /** The people in the page's scope who have no voiceprint yet: its selection, else what it shows. */
    personIds: string[];
}

type BulkResult = Awaited<ReturnType<typeof requestGenerateVoiceprintsForCity>>;

const VOICEPRINT_RULE = "A person needs a confirmed speaker segment of at least 30 seconds and no voiceprint yet.";

interface Alert {
    variant?: "default" | "destructive" | "warning" | "success";
    title: string;
    description: React.ReactNode;
    icon?: React.ReactNode;
}

export function BulkVoiceprintDialog({ cityId, currentCityName, personIds }: BulkVoiceprintDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<BulkResult | null>(null);
    /** Who of `personIds` can get a voiceprint; null while the check runs. */
    const [eligibleIds, setEligibleIds] = useState<string[] | null>(null);
    const [checkFailed, setCheckFailed] = useState(false);
    // A slow answer from an earlier opening must not overwrite this one.
    const checkRun = useRef(0);
    const router = useRouter();
    const { toast } = useToast();

    const handleOpenChange = async (open: boolean) => {
        setIsOpen(open);
        if (!open) return;
        const run = ++checkRun.current;
        setResult(null);
        setEligibleIds(null);
        setCheckFailed(false);
        try {
            const { eligiblePeople } = await findEligiblePeopleForVoiceprintGeneration(cityId, personIds);
            if (run === checkRun.current) setEligibleIds(eligiblePeople.map(person => person.id));
        } catch (error) {
            console.error("Error checking eligible people:", error);
            if (run === checkRun.current) setCheckFailed(true);
        }
    };

    const handleGenerateVoiceprints = async () => {
        if (!eligibleIds) return;
        setIsLoading(true);
        try {
            const result = await requestGenerateVoiceprintsForCity(cityId, eligibleIds);
            setResult(result);
            setIsLoading(false);

            toast({
                title: "Voiceprint generation started",
                description: `Started ${result.successful} voiceprint generation tasks. Failed: ${result.failed}`,
            });

            // Refresh the page after a longer delay to ensure users see the confirmation
            setTimeout(() => {
                router.refresh();
            }, 3000);
        } catch (error) {
            console.error("Error generating voiceprints:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to generate voiceprints",
                variant: "destructive",
            });
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        if (result) {
            router.refresh();
        }
        setIsOpen(false);
    };

    // Custom Alert component since we don't have the standard one
    const CustomAlert = ({ variant = "default", title, description, icon }: Alert) => {
        const colorClasses = {
            default: "bg-gray-100 border-gray-200 text-gray-800",
            destructive: "bg-red-100 border-red-400 text-red-700",
            warning: "bg-amber-100 border-amber-400 text-amber-800",
            success: "bg-green-100 border-green-400 text-green-800"
        };

        return (
            <div className={`rounded-md border p-4 ${colorClasses[variant]}`}>
                {icon && <div className="flex items-center mb-2">{icon}</div>}
                {title && <h5 className="font-medium mb-1">{title}</h5>}
                <div className="text-sm">{description}</div>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {/* Off when everyone in scope has a voiceprint, so the dialog never
                    opens on a check that can only say none. */}
                <Button variant="outline" size="sm" className="gap-2" disabled={personIds.length === 0}>
                    <Volume2 className="h-4 w-4" />
                    Generate Voiceprints
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Bulk Voiceprint Generation</DialogTitle>
                    <DialogDescription>
                        Generate voiceprints for the people you chose in {currentCityName}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-6">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400 mb-4" />
                        <p className="text-center text-slate-600">Starting voiceprint generation tasks...</p>
                        <p className="text-center text-slate-600 text-sm mt-2">This may take a moment</p>
                    </div>
                ) : result ? (
                    <div className="space-y-4">
                        <CustomAlert
                            variant={result.failed > 0 ? "warning" : "success"}
                            title="Voiceprint Generation Started"
                            description={
                                <>
                                    <div className="flex items-center mb-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                                        <p className="font-medium">Tasks successfully initiated!</p>
                                    </div>
                                    <p>Started {result.successful} voiceprint generation tasks.</p>
                                    {result.failed > 0 ? (
                                        <p className="text-amber-700 mt-2">Failed to start {result.failed} tasks.</p>
                                    ) : (
                                        <p className="text-gray-600 mt-2">You can track individual task progress from each person&apos;s voiceprint dialog.</p>
                                    )}
                                    <p className="text-gray-600 mt-2 text-sm">This page will refresh in a moment...</p>
                                </>
                            }
                        />
                    </div>
                ) : checkFailed ? (
                    <CustomAlert
                        variant="destructive"
                        title="Error"
                        description="Failed to check eligible people. Please try again."
                        icon={<AlertCircle className="h-4 w-4" />}
                    />
                ) : eligibleIds === null ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400 mr-2" />
                        <span className="text-slate-600">Checking who can get a voiceprint...</span>
                    </div>
                ) : eligibleIds.length === 0 ? (
                    <CustomAlert
                        title="No Eligible People"
                        description={`None of the ${personIds.length} people can get a voiceprint. ${VOICEPRINT_RULE}`}
                        icon={<AlertCircle className="h-4 w-4" />}
                    />
                ) : (
                    <div className="space-y-4">
                        <CustomAlert
                            variant="warning"
                            title={`${eligibleIds.length} of the ${personIds.length} people can get a voiceprint`}
                            description={
                                <>
                                    {eligibleIds.length < personIds.length && (
                                        <p className="mb-2">{personIds.length - eligibleIds.length} cannot. {VOICEPRINT_RULE}</p>
                                    )}
                                    <p className="mt-2">This operation:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-1">
                                        <li>Requires significant processing time</li>
                                        <li>May incur additional processing costs</li>
                                        <li>Will run as background tasks</li>
                                    </ul>
                                </>
                            }
                            icon={<AlertCircle className="h-4 w-4" />}
                        />
                    </div>
                )}

                <DialogFooter className="flex justify-between sm:justify-between">
                    <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                        {result ? "Close" : "Cancel"}
                    </Button>

                    {!result && eligibleIds && eligibleIds.length > 0 && (
                        <Button
                            variant="default"
                            onClick={handleGenerateVoiceprints}
                            disabled={isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generate {eligibleIds.length} Voiceprints
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 