"use client";

import { useState, useEffect } from "react";
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
}

interface Alert {
    variant?: "default" | "destructive" | "warning" | "success";
    title: string;
    description: React.ReactNode;
    icon?: React.ReactNode;
}

export function BulkVoiceprintDialog({ cityId, currentCityName }: BulkVoiceprintDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [eligibleCount, setEligibleCount] = useState<number | null>(null);
    const [result, setResult] = useState<any | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    // Check for eligible people when dialog opens
    useEffect(() => {
        if (!isOpen) return;

        const checkEligiblePeople = async () => {
            setIsChecking(true);
            try {
                const { count } = await findEligiblePeopleForVoiceprintGeneration(cityId);
                setEligibleCount(count);
            } catch (error) {
                console.error("Error checking eligible people:", error);
                toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to check eligible people",
                    variant: "destructive",
                });
            } finally {
                setIsChecking(false);
            }
        };

        checkEligiblePeople();
    }, [isOpen, cityId, toast]);

    const handleGenerateVoiceprints = async () => {
        setIsLoading(true);
        try {
            const result = await requestGenerateVoiceprintsForCity(cityId);
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
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2">
                    <Volume2 className="mr-2 h-4 w-4" />
                    Generate All Voiceprints
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Bulk Voiceprint Generation</DialogTitle>
                    <DialogDescription>
                        Generate voiceprints for all eligible people in {currentCityName}
                    </DialogDescription>
                </DialogHeader>

                {isChecking ? (
                    <div className="flex justify-center items-center py-6">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                        <span className="ml-2">Checking eligible people...</span>
                    </div>
                ) : isLoading ? (
                    <div className="flex flex-col items-center justify-center py-6">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400 mb-4" />
                        <p className="text-center text-slate-600">Starting voiceprint generation tasks...</p>
                        <p className="text-center text-slate-600 text-sm mt-2">This may take a moment</p>
                    </div>
                ) : eligibleCount === null ? (
                    <CustomAlert
                        variant="destructive"
                        title="Error"
                        description="Failed to check eligible people. Please try again."
                        icon={<AlertCircle className="h-4 w-4" />}
                    />
                ) : eligibleCount === 0 ? (
                    <CustomAlert
                        title="No Eligible People"
                        description={`There are no people in ${currentCityName} eligible for voiceprint generation. People need speaker segments longer than 30 seconds and no existing voiceprint.`}
                        icon={<AlertCircle className="h-4 w-4" />}
                    />
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
                                        <p className="text-gray-600 mt-2">You can track individual task progress from each person's voiceprint dialog.</p>
                                    )}
                                    <p className="text-gray-600 mt-2 text-sm">This page will refresh in a moment...</p>
                                </>
                            }
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <CustomAlert
                            variant="warning"
                            title="Important Information"
                            description={
                                <>
                                    <p>You are about to generate voiceprints for {eligibleCount} people in {currentCityName}.</p>
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

                    {!result && eligibleCount !== null && eligibleCount > 0 && (
                        <Button
                            variant="default"
                            onClick={handleGenerateVoiceprints}
                            disabled={isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generate {eligibleCount} Voiceprints
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 