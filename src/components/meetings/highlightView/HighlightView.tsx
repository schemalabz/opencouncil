import { CouncilMeeting, City, Person, Party, SpeakerTag, Utterance } from "@prisma/client"
import { Transcript } from "@/lib/db/transcript"
import { HighlightWithUtterances } from "@/lib/db/highlights"
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronUp, ChevronDown, Share2, ArrowUp, ArrowLeft, TriangleAlert, CheckCircle, Play, PlayCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { useVideo } from "../VideoProvider"
import { motion, AnimatePresence } from "framer-motion"
import { useCouncilMeetingData } from "../CouncilMeetingDataContext"
import MuxPlayer from "@mux/mux-player-react"
import { Video } from "../Video"
import SpeakerBadge from "@/components/SpeakerBadge"
import PartyBadge from "@/components/PartyBadge"
const SUB_SCROLL_TIMEOUT = 500; // milliseconds

// Updated Subtitles Component
const Subtitles = ({ utterance }: { utterance: Utterance & { person?: Person, party?: Party } }) => (
    <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-60 p-2 rounded-lg sm:p-4 sm:rounded-xl">
        <div className="flex flex-col space-y-2">
            <p className="text-white text-xs sm:text-sm">{utterance.text}</p>
        </div>
    </div>
)

// Updated HighlightCard Component
const HighlightCard = ({
    utterances,
    name,
    onEnded,
    meeting,
    currentUtteranceIndex,
    setCurrentUtteranceIndex
}: {
    utterances: (Utterance & { person?: Person, party?: Party })[],
    name: string,
    onEnded: () => void,
    meeting: CouncilMeeting,
    currentUtteranceIndex: number,
    setCurrentUtteranceIndex: React.Dispatch<React.SetStateAction<number>>
}) => {
    const { currentTime, seekTo, isSeeking, isPlaying, setIsPlaying, playerRef } = useVideo()
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false);

    useEffect(() => {
        seekTo(utterances[0].startTimestamp)
        setCurrentUtteranceIndex(0);
        setHasStartedPlaying(true);
        setTimeout(() => {
            setIsPlaying(true)
        }, 100);
    }, [utterances]);

    useEffect(() => {
        if (isSeeking || !hasStartedPlaying) return;

        if (currentTime > utterances[currentUtteranceIndex].endTimestamp) {
            if (currentUtteranceIndex < utterances.length - 1) {
                if (Math.abs(currentTime - utterances[currentUtteranceIndex + 1].startTimestamp) > 0.5) {
                    seekTo(utterances[currentUtteranceIndex + 1].startTimestamp)
                }
                setCurrentUtteranceIndex(prevIndex => prevIndex + 1);
            } else {
                console.log("ENDED");
                onEnded()
            }
        }
    }, [currentTime, isSeeking, hasStartedPlaying])

    return (
        <div className="bg-gray-900 text-white h-full w-full snap-start flex flex-col justify-center p-4">
            <h2 className="text-xl font-semibold mb-2 text-center">{name}</h2>
            <div className="aspect-video bg-gray-800 w-full max-w-4xl mx-auto flex items-center justify-center text-3xl font-bold relative overflow-hidden">
                <div className="absolute inset-0">
                    <Video />
                </div>

                {/* Person Badge - Upper Left Corner */}
                {utterances[currentUtteranceIndex].person && (
                    <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
                        <SpeakerBadge
                            speakerTag={{
                                label: utterances[currentUtteranceIndex].person.name_short,
                                personId: utterances[currentUtteranceIndex].person.id
                            }}
                            person={utterances[currentUtteranceIndex].person}
                            party={utterances[currentUtteranceIndex].party}
                            className="text-xs sm:text-sm"
                        />
                    </div>
                )}

                {/* Party Badge - Upper Right Corner */}
                {utterances[currentUtteranceIndex].party && (
                    <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                        <PartyBadge
                            party={utterances[currentUtteranceIndex].party}
                            shortName={true}
                            className="text-xs sm:text-sm"
                        />
                    </div>
                )}

                {currentUtteranceIndex < utterances.length && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50">
                        <Subtitles utterance={utterances[currentUtteranceIndex]} />
                    </div>
                )}
            </div>
            <div className="w-full max-w-4xl mx-auto mt-4 bg-gray-700 h-1 flex">
                {utterances.map((utterance, index) => {
                    const isCompleted = index < currentUtteranceIndex;
                    const partyColor = utterance.party?.colorHex || 'gray';
                    const brightness = isCompleted ? 'brightness-125' : 'brightness-75';
                    return (
                        <div
                            key={utterance.id}
                            className={`flex-1 h-full ${brightness}`}
                            style={{ backgroundColor: partyColor }}
                        />
                    )
                })}
            </div>
        </div>
    )
}
const SuperHeader = ({ currentIndex, totalHighlights, meeting, city, switchToTranscript }: { currentIndex: number, totalHighlights: number, meeting: CouncilMeeting, city: City, switchToTranscript: () => void }) => {
    const [isWarningExpanded, setIsWarningExpanded] = useState(false);

    return (
        <div
            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent text-white p-4 z-20"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
            <div className="flex justify-between items-center">
                <Button variant='ghost' onClick={() => switchToTranscript()} className='text-xs'>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Πλήρης συνεδρίαση
                </Button>
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
                            <p className="text-lg mb-4">Τα αποσμάτα απομαγνητοφωνήθηκαν και επιλέχτηκαν αυτόματα, και ενδεχομένως να περιέχουν λάθη, ή να είναι ελλειπή</p>
                            <p className="text-sm italic">Κάντε κλικ οπουδήποτε για να κλείσετε</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function HighlightView({ initialHighlightId, data, switchToTranscript }: {
    initialHighlightId: string,
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
    const [direction, setDirection] = useState<'up' | 'down'>('down')
    const [isLinkCopied, setIsLinkCopied] = useState(false)
    const [showReels, setShowReels] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const touchStartY = useRef<number | null>(null);
    const [currentUtteranceIndex, setCurrentUtteranceIndex] = useState(0);
    const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);

    const { getPerson } = useCouncilMeetingData();

    const utteranceById = useMemo(() => {
        return data.transcript.flatMap(segment => segment.utterances).reduce((acc, utterance) => {
            acc[utterance.id] = utterance;
            return acc;
        }, {} as Record<string, Utterance>);
    }, [data.transcript]);

    const highlightUtterances = useMemo(() => {
        return data.highlights.map((highlight) => {
            return highlight.highlightedUtterances.map(hu => {
                const utterance = utteranceById[hu.utteranceId];
                const speakerSegment = data.transcript.find(segment =>
                    segment.utterances.some(u => u.id === utterance.id)
                );

                if (!speakerSegment) {
                    console.error(`No speaker segment found for utterance ${utterance.id}`);
                    return { ...utterance, person: undefined, party: undefined };
                }

                const person = getPerson(speakerSegment.speakerTag.personId || '');

                if (!person) {
                    console.error(`No person found for speaker tag ${speakerSegment.speakerTag.id}`);
                    return { ...utterance, person: undefined, party: undefined };
                }

                return {
                    ...utterance,
                    person,
                    party: data.parties.find(p => p.id === person.partyId)
                };
            }).sort((a, b) => a.startTimestamp - b.startTimestamp);
        });
    }, [data.highlights, utteranceById, data.transcript, getPerson, data.parties]);

    const getCurrentIndex = useCallback(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#h-')) {
            const highlightId = hash.slice(3);
            const index = data.highlights.findIndex(h => h.id === highlightId);
            return index !== -1 ? index : 0;
        }
        return 0;
    }, [data.highlights]);

    const setCurrentIndex = useCallback((index: number) => {
        const highlight = data.highlights[index];
        if (highlight) {
            window.history.pushState({}, '', `#h-${highlight.id}`);
        }
    }, [data.highlights]);

    const handleScroll = useCallback((scrollDirection: 'up' | 'down') => {
        if (isScrolling) return; // Prevent multiple scrolls

        setScrollDirection(scrollDirection); // Set the direction for the indicator
        const currentIndex = getCurrentIndex();
        if (scrollDirection === 'down' && currentIndex > 0) {
            setDirection('up'); // Changed from 'down' to 'up'
            setCurrentIndex(currentIndex - 1);
            setIsScrolling(true);
            // Delay the scrolling action until after the animation
            setTimeout(() => {
                setIsScrolling(false);
                setScrollDirection(null); // Reset after scroll
            }, SUB_SCROLL_TIMEOUT);
        } else if (scrollDirection === 'up' && currentIndex < data.highlights.length - 1) {
            setDirection('down'); // Changed from 'up' to 'down'
            setCurrentIndex(currentIndex + 1);
            setIsScrolling(true);
            setTimeout(() => setIsScrolling(false), SUB_SCROLL_TIMEOUT);
        }
    }, [getCurrentIndex, setCurrentIndex, data.highlights.length, isScrolling]);

    const handleWheel = useCallback((event: React.WheelEvent) => {
        if (!showReels) return;
        if (event.deltaY > 50) {
            handleScroll('up')
        } else if (event.deltaY < -50) {
            handleScroll('down')
        }
    }, [handleScroll, showReels])

    const handleTouchStart = useCallback((event: React.TouchEvent) => {
        const touch = event.touches[0];
        touchStartY.current = touch.clientY;
    }, []);

    const handleTouchEnd = useCallback((event: React.TouchEvent) => {
        if (!touchStartY.current) return;

        const touch = event.changedTouches[0];
        const deltaY = touch.clientY - touchStartY.current;

        if (deltaY > 50) {
            // Swipe down
            handleScroll('down');
        } else if (deltaY < -50) {
            // Swipe up
            handleScroll('up');
        }

        touchStartY.current = null;
    }, [handleScroll]);

    const handleShare = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const url = window.location.href;

        if (navigator.share && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            // Mobile device
            navigator.share({
                title: 'Share this highlight',
                url: url
            }).catch(console.error);
        } else {
            // Desktop
            navigator.clipboard.writeText(url).then(() => {
                setIsLinkCopied(true)
                setTimeout(() => setIsLinkCopied(false), 3000)
            })
        }
    }

    const variants = {
        enter: (direction: 'up' | 'down') => ({
            y: direction === 'up' ? '100%' : '-100%', // Changed 'down' to 'up' and vice versa
            opacity: 0,
        }),
        center: {
            y: "0%",
            opacity: 1,
        },
        exit: (direction: 'up' | 'down') => ({
            y: direction === 'up' ? '-100%' : '100%', // Changed 'down' to 'up' and vice versa
            opacity: 0,
        }),
    }

    useEffect(() => {
        if (initialHighlightId) {
            const index = data.highlights.findIndex(h => h.id === initialHighlightId);
            if (index !== -1) {
                setCurrentIndex(index);
            }
        } else if (data.highlights.length > 0 && !window.location.hash.startsWith('#h-')) {
            // If no initial highlight and no hash, set to the first highlight
            const firstHighlightId = data.highlights[0].id;
            window.history.pushState({}, '', `#h-${firstHighlightId}`);
            setCurrentIndex(0);
        }
    }, [initialHighlightId, data.highlights, setCurrentIndex]);

    useEffect(() => {
        const handleHashChange = () => {
            const newIndex = getCurrentIndex();
            const previousIndex = currentIndexRef.current;
            if (newIndex > previousIndex) {
                setDirection('down'); // Changed from 'up' to 'down'
            } else {
                setDirection('up'); // Changed from 'down' to 'up'
            }
            currentIndexRef.current = newIndex;
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
            // Remove the hash from the URL on unmount
            window.history.pushState(null, '', window.location.pathname + window.location.search);
        };
    }, [data.highlights, getCurrentIndex]);

    const currentIndexRef = useRef(getCurrentIndex());

    useEffect(() => {
        currentIndexRef.current = getCurrentIndex();
    }, [getCurrentIndex]);

    const currentIndex = getCurrentIndex();
    const currentHighlight = data.highlights[currentIndex]
    const progressPercentage = ((currentIndex + 1) / data.highlights.length) * 100;

    return (
        <div
            className="relative min-h-screen w-full overflow-hidden bg-black flex flex-col"
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <SuperHeader switchToTranscript={switchToTranscript} currentIndex={currentIndex} totalHighlights={data.highlights.length} meeting={data.meeting} city={data.city} />

            <div className="flex-1 flex flex-col relative">
                {showReels ? (
                    <>
                        <button
                            className="absolute top-28 left-0 right-0 bg-gradient-to-b from-black to-transparent text-white p-4 z-10 flex justify-center items-center"
                            style={{ top: 'env(safe-area-inset-top) + 70px' }}
                            onClick={() => handleScroll('down')}
                            disabled={isScrolling}
                        >
                            <ChevronUp className="w-8 h-8" />
                        </button>

                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <AnimatePresence custom={direction} mode="wait">
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
                                    onAnimationComplete={() => {
                                        // Ensure that scrolling state is handled after animation
                                        setIsScrolling(false);
                                    }}
                                >
                                    {currentIndex < data.highlights.length && currentHighlight &&
                                        <HighlightCard
                                            meeting={data.meeting}
                                            key={currentIndex}
                                            utterances={highlightUtterances[currentIndex]}
                                            name={currentHighlight.name}
                                            onEnded={() => handleScroll('up')}
                                            currentUtteranceIndex={currentUtteranceIndex}
                                            setCurrentUtteranceIndex={setCurrentUtteranceIndex}
                                        />}

                                    {currentIndex >= data.highlights.length &&
                                        <div className="absolute w-full h-full bg-black flex flex-col items-center justify-center space-y-4">
                                            <p className="text-white text-xl font-bold">Τέλος</p>
                                            <Button onClick={switchToTranscript} variant='ghost' className='text-white text-sm'>Δείτε όλη τη συνεδρίαση</Button>
                                        </div>
                                    }
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent text-white p-4 pb-safe z-10 flex flex-col items-center space-y-4"
                            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                        >
                            <button
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-all duration-200 z-20"
                                onClick={handleShare}
                                disabled={isScrolling}
                            >
                                {isLinkCopied ? (
                                    <>
                                        <CheckCircle className="w-6 h-6" />
                                        <span>Link copied</span>
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-6 h-6" />
                                        <span>Share</span>
                                    </>
                                )}
                            </button>
                            <button
                                className="flex justify-center items-center"
                                onClick={() => handleScroll('up')}
                                disabled={isScrolling}
                            >
                                <ChevronDown className="w-8 h-8" />
                            </button>
                        </div>

                        {/* Updated Vertical progress bar */}
                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 h-3/5 w-2 bg-gray-700 rounded-full overflow-hidden flex flex-col">
                            {data.highlights.map((highlight, idx) => {
                                const isCompleted = idx < currentIndex;
                                const isCurrent = idx === currentIndex;
                                const brightness = isCompleted ? 'brightness-125' : 'brightness-75';
                                const indicatorClass = isCurrent
                                    ? 'bg-white' // Highlight the current section
                                    : 'bg-gray-500'; // Neutral color for others

                                return (
                                    <div
                                        key={highlight.id}
                                        className={`flex-1 ${brightness} ${indicatorClass} transition-opacity duration-300`}
                                    />
                                )
                            })}
                        </div>
                    </>
                ) : (
                    <div
                        className="flex-grow flex items-center justify-center cursor-pointer"
                        onClick={() => setShowReels(true)}
                    >
                        <div className="flex flex-col items-center justify-center w-full h-full text-white hover:bg-black hover:text-white/50 transition-all duration-200">
                            <PlayCircle className="w-24 h-24 mb-4" />
                            <span className="text-2xl font-bold">Start </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}