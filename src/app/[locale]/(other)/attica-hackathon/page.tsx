"use client";

import { useState } from "react";
import WordRotate from "@/components/ui/word-rotate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import atticaData from "./Περιφέρεια Αττικής.json";
import { addToWaitlist } from "@/lib/db/waitlist";
import { Check, X } from "lucide-react";
import Map from "@/components/map/map";

export default function AtticaHackathon() {
    const [email, setEmail] = useState("");
    const [selectedMunicipalities, setSelectedMunicipalities] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);

    const municipalities = atticaData.map(m => m.name);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || selectedMunicipalities.length === 0) return;

        setIsSubmitting(true);
        try {
            const municipalityIds = selectedMunicipalities
                .map(name => atticaData.find(m => m.name === name)?.code || "")
                .filter(Boolean)
                .join(",");

            await addToWaitlist(email, municipalityIds);
            setEmail("");
            setSelectedMunicipalities([]);
            setSubmitStatus("success");
            setTimeout(() => setSubmitStatus(null), 2000);
        } catch (error) {
            setSubmitStatus("error");
            setTimeout(() => setSubmitStatus(null), 2000);
        }
        setIsSubmitting(false);
    };

    const handleMunicipalitySelect = (municipality: string | null) => {
        if (!municipality) return;

        setSelectedMunicipalities(prev => {
            if (prev.includes(municipality)) {
                return prev.filter(m => m !== municipality);
            }
            return [...prev, municipality];
        });
    };

    if (submitStatus) {
        return (
            <>
                <Map
                    className="fixed inset-0 -z-10"
                    center={[23.7275, 37.9838]}
                    zoom={12}
                    pitch={45}
                    animateRotation={true}
                />
                <div className="min-h-screen flex items-center justify-center">
                    {submitStatus === "success" ? (
                        <Check className="w-32 h-32 text-green-500 animate-in fade-in" />
                    ) : (
                        <X className="w-32 h-32 text-red-500 animate-in fade-in" />
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            <Map
                className="fixed inset-0 -z-10"
                center={[23.7275, 37.9838]}
                zoom={12}
                pitch={45}
                animateRotation={true}
            />
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full space-y-8 bg-white/80 backdrop-blur-sm rounded-lg p-8">
                    <div className="text-center">
                        <WordRotate
                            className="text-4xl font-bold"
                            words={[
                                "Η γειτονιά σου",
                                "Ο δρόμος σου",
                                "Η πόλη σου",
                                "Το πάρκο σου",
                                "Ο δήμος σου",
                                "Το σχολείο σου"
                            ]}
                        />
                        <h2 className="mt-2 text-xl text-gray-600">σε νοιάζει</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                Email
                            </label>
                            <Input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                disabled={isSubmitting}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Επιλέξτε Δήμους
                            </label>
                            <div className="space-y-2">
                                <span>combobox removed to avoid maintainance</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {selectedMunicipalities.map((municipality) => (
                                        <Button
                                            key={municipality}
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleMunicipalitySelect(municipality)}
                                            className="flex items-center gap-1"
                                        >
                                            {municipality}
                                            <X className="h-3 w-3" />
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting || !email || selectedMunicipalities.length === 0}
                            className="w-full"
                        >
                            {isSubmitting ? "Υποβάλλεται..." : "Εγγραφή"}
                        </Button>
                    </form>
                </div>
            </div>
        </>
    );
}
