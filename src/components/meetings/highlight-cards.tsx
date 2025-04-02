"use client"
import { SubjectWithRelations } from "@/lib/db/subject";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { SubjectCard } from "../subject-card";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface HighlightCardsProps {
    subjects: (SubjectWithRelations & { statistics?: any })[];
}

export function HighlightCards({ subjects }: HighlightCardsProps) {
    const { city, meeting, parties, people } = useCouncilMeetingData();
    // Filter subjects to only include those that have showcased highlights with video
    const subjectsWithVideo = subjects.filter(subject => 
        subject.highlights.some(highlight => highlight.muxPlaybackId && highlight.isShowcased)
    );

    const [currentIndex, setCurrentIndex] = useState(0);

    if (subjectsWithVideo.length === 0) {
        return null;
    }

    const currentSubject = subjectsWithVideo[currentIndex];
    const videoHighlight = currentSubject.highlights.find(h => h.muxPlaybackId && h.isShowcased) as HighlightWithUtterances;

    const handlePrevious = () => {
        setCurrentIndex((prev) => (prev === 0 ? subjectsWithVideo.length - 1 : prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev === subjectsWithVideo.length - 1 ? 0 : prev + 1));
    };

    return (
        <section className="w-full max-w-4xl mx-auto mt-8">
            <div className="flex justify-between mb-4">
                <h3 className="text-xl font-bold text-left flex items-center">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Στιγμιότυπα
                </h3>
                <p className="text-sm text-muted-foreground">
                    {currentIndex + 1} / {subjectsWithVideo.length}
                </p>
            </div>
            <div className="relative">
                <div className="relative min-h-[500px] sm:min-h-[600px]">
                    <button
                        onClick={handlePrevious}
                        className="absolute left-0 top-[250px] sm:top-[300px] -translate-y-1/2 -translate-x-2 sm:-translate-x-4 p-3 sm:p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted transition-colors shadow-lg z-10"
                        aria-label="Previous highlight"
                    >
                        <ChevronLeft className="w-6 h-6 sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={handleNext}
                        className="absolute right-0 top-[250px] sm:top-[300px] -translate-y-1/2 translate-x-2 sm:translate-x-4 p-3 sm:p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted transition-colors shadow-lg z-10"
                        aria-label="Next highlight"
                    >
                        <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5" />
                    </button>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentSubject.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="w-full"
                        >
                            <SubjectCard
                                key={currentSubject.id}
                                subject={currentSubject}
                                city={city}
                                meeting={meeting}
                                parties={parties}
                                persons={people}
                                highlight={videoHighlight}
                                fullWidth
                                disableHover
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
} 