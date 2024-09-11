import { CouncilMeeting, City, Person, Party, SpeakerTag, Utterance } from "@prisma/client"
import { Transcript } from "@/lib/db/transcript"
import { HighlightWithUtterances } from "@/lib/db/highlights"
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronUp, ChevronDown, Share2, ArrowUp, ArrowLeft, TriangleAlert } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { useVideo } from "../VideoProvider"
import { motion, AnimatePresence } from "framer-motion"
import { useCouncilMeetingData } from "../CouncilMeetingDataContext"

const AnimatedText = ({ text }: { text: string }) => {
    const [currentText, setCurrentText] = useState('')
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setCurrentText(prevText => prevText + text[currentIndex])
                setCurrentIndex(prevIndex => prevIndex + 1)
            }, 100)
            return () => clearTimeout(timeout)
        } else {
            const timeout = setTimeout(() => {
                setCurrentText('')
                setCurrentIndex(0)
            }, 1000)
            return () => clearTimeout(timeout)
        }
    }, [currentIndex, text])

    return <span>{currentText}</span>
}

const Subtitles = ({ utterance }: { utterance: Utterance }) => (
    <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 p-2 rounded">
        <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold">
                speakerName
            </div>
            <div className="flex-1">
                <p className="text-white text-sm">{utterance.text}</p>
            </div>
        </div>
    </div>
)

const HighlightCard = ({ highlight, onEnded }: { highlight: HighlightWithUtterances, onEnded: () => void }) => {
    if (!highlight) return null;
    const { currentTime, seekTo, isPlaying, setIsPlaying } = useVideo()
    const [currentUtteranceIndex, setCurrentUtteranceIndex] = useState(0)
    const [highlightProgress, setHighlightProgress] = useState(0)
    const { transcript } = useCouncilMeetingData()
    const utterances = highlight.highlightedUtterances.map(hu =>
        transcript.flatMap(segment => segment.utterances).find(u => u.id === hu.utteranceId)
    ).filter((u): u is NonNullable<typeof u> => u !== undefined)

    useEffect(() => {
        if (!utterances || utterances.length === 0) return;

        console.log("Setting up playback")
        seekTo(utterances[0].startTimestamp);
        setCurrentUtteranceIndex(0);
        setIsPlaying(true);
    }, [highlight])

    useEffect(() => {
        if (!utterances || utterances.length === 0) return;

        const currentUtterance = utterances[currentUtteranceIndex];
        if (currentTime >= currentUtterance.endTimestamp) {
            if (currentUtteranceIndex < utterances.length - 1) {
                setCurrentUtteranceIndex(prevIndex => prevIndex + 1);
            } else {
                onEnded();
            }
        } else if (currentTime < currentUtterance.startTimestamp) {
            seekTo(currentUtterance.startTimestamp);
        }
    }, [currentTime, currentUtteranceIndex, utterances])

    useEffect(() => {
        const totalDuration = utterances.reduce(
            (total, utterance) => total + (utterance.endTimestamp - utterance.startTimestamp),
            0
        );
        const elapsedDuration = utterances.slice(0, currentUtteranceIndex).reduce(
            (total, utterance) => total + (utterance.endTimestamp - utterance.startTimestamp),
            0
        ) + Math.max(0, currentTime - utterances[currentUtteranceIndex].startTimestamp);
        setHighlightProgress((elapsedDuration / totalDuration) * 100);
    }, [currentTime, currentUtteranceIndex, utterances]);

    return (
        <div className="bg-gray-900 text-white h-screen w-full snap-start flex flex-col justify-center p-4">
            <h2 className="text-xl font-semibold mb-2 text-center">{highlight.name}</h2>
            <div className="aspect-video bg-gray-800 w-full max-w-4xl mx-auto flex items-center justify-center text-3xl font-bold relative">
                <AnimatedText text="<video here>" />
                {currentUtteranceIndex < utterances.length && (
                    <Subtitles utterance={utterances[currentUtteranceIndex]} />
                )}
            </div>
            <div className="w-full max-w-4xl mx-auto mt-4 bg-gray-700 h-1">
                <div
                    className="bg-white h-full transition-all duration-300 ease-linear"
                    style={{ width: `${highlightProgress}%` }}
                />
            </div>
        </div>
    )
}

const SuperHeader = ({ currentIndex, totalHighlights, meeting, city, switchToTranscript }: { currentIndex: number, totalHighlights: number, meeting: CouncilMeeting, city: City, switchToTranscript: () => void }) => {
    const [isWarningExpanded, setIsWarningExpanded] = useState(false);

    return (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent text-white p-4 z-20">
            <div className="flex justify-between items-center">
                <Button variant='ghost' onClick={() => switchToTranscript()} className='text-xs'><ArrowLeft className="w-4 h-4 mr-2" /> Πλήρης συνεδρίαση</Button>
                <motion.span
                    className="text-xs text-gray-300 border-2 border-yellow-600 px-2 py-1 rounded-full cursor-pointer flex items-center"
                    onClick={() => setIsWarningExpanded(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <TriangleAlert className='w-4 h-4 mr-1' />
                    <span>Προσοχή!</span>
                </motion.span>
            </div>
            <h1 className="text-lg font-bold text-center mb-1">{meeting.name}</h1>
            <p className='text-sm text-center'>{city.name_municipality}</p>

            <AnimatePresence>
                {isWarningExpanded && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                        onClick={() => setIsWarningExpanded(false)}
                    >
                        <motion.div
                            className="p-8 rounded-lg text-center shadow-lg border-4 border-yellow-600 bg-black/20"
                            initial={{ y: -50, rotate: -5 }}
                            animate={{ y: 0, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 100 }}
                        >
                            <h2 className="text-3xl font-bold mb-4">Προσοχή!</h2>
                            <p className="text-lg mb-4">Αυτό το περιεχόμενο είναι σε πειραματικό στάδιο.</p>
                            <p className="text-sm italic">Κάντε κλικ οπουδήποτε για να κλείσετε</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function HighlightView({ data, switchToTranscript }: {
    data: {
        meeting: CouncilMeeting & { taskStatuses: any[] },
        transcript: Transcript,
        city: City,
        people: Person[],
        parties: Party[]
        speakerTags: SpeakerTag[]
        highlights: HighlightWithUtterances[]
    }
    switchToTranscript: () => void
}) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [direction, setDirection] = useState<'up' | 'down'>('down')
    const handleScroll = useCallback((scrollDirection: 'up' | 'down') => {
        if (scrollDirection === 'down' && currentIndex > 0) {
            setCurrentIndex(prevIndex => prevIndex - 1)
            setDirection('down')
        } else if (scrollDirection === 'up' && currentIndex < data.highlights.length - 1) {
            setCurrentIndex(prevIndex => prevIndex + 1)
            setDirection('up')
        }
    }, [currentIndex, data.highlights.length])

    const handleWheel = useCallback((event: React.WheelEvent) => {
        if (event.deltaY > 0) {
            handleScroll('up')
        } else if (event.deltaY < 0) {
            handleScroll('down')
        }
    }, [handleScroll])

    const handleShare = () => {
        console.log('Share button clicked')
    }

    const variants = {
        enter: (direction: 'up' | 'down') => ({
            y: direction === 'down' ? '-100%' : '100%',
            opacity: 0,
        }),
        center: {
            y: 0,
            opacity: 1,
        },
        exit: (direction: 'up' | 'down') => ({
            y: direction === 'down' ? '100%' : '-100%',
            opacity: 0,
        }),
    }

    const currentHighlight = data.highlights[currentIndex]
    const progressPercentage = ((currentIndex + 1) / data.highlights.length) * 100

    console.log(`current index is ${currentIndex}`)
    console.log(progressPercentage)
    return (
        <div
            className="relative h-screen w-full overflow-hidden bg-black flex flex-col"
            onWheel={handleWheel}
        >
            <SuperHeader switchToTranscript={switchToTranscript} currentIndex={currentIndex} totalHighlights={data.highlights.length} meeting={data.meeting} city={data.city} />

            <div className="flex-grow flex flex-col relative">
                <button
                    className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent text-white p-4 z-10 flex justify-center items-center"
                    onClick={() => handleScroll('up')}
                >
                    <ChevronUp className="w-8 h-8" />
                </button>

                <div className="flex-grow flex items-center justify-center overflow-hidden">
                    <AnimatePresence initial={false} custom={direction}>
                        <motion.div
                            key={currentIndex}
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{
                                y: { type: "spring", stiffness: 300, damping: 30 },
                                opacity: { duration: 0.2 },
                            }}
                            className="absolute w-full h-full"
                        >
                            {currentIndex < data.highlights.length &&
                                <HighlightCard highlight={data.highlights[currentIndex]} onEnded={() => handleScroll('up')} />}

                            {currentIndex >= data.highlights.length &&
                                <div className="absolute w-full h-full bg-black flex flex-col items-center justify-center space-y-4">
                                    <p className="text-white text-xl font-bold">Τέλος</p>
                                    <Button onClick={switchToTranscript} variant='ghost' className='text-white text-sm'>Δείτε όλη τη συνεδρίαση</Button>
                                </div>
                            }
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent text-white p-4 z-10 flex flex-col items-center space-y-4">
                    <button
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-all duration-200 z-20"
                        onClick={handleShare}
                    >
                        <Share2 className="w-6 h-6" />
                        <span>Share</span>
                    </button>
                    <button
                        className="flex justify-center items-center"
                        onClick={() => handleScroll('down')}
                    >
                        <ChevronDown className="w-8 h-8" />
                    </button>
                </div>
            </div>

            {/* Vertical progress bar */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 h-3/5 w-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="bg-blue-500 w-full rounded-full transition-all duration-300 ease-out"
                    style={{ height: `${progressPercentage}%` }}
                ></div>
            </div>
        </div>
    )
}