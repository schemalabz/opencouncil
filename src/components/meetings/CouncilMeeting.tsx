"use client"

import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu } from "lucide-react"
import { SpeakerTag, Utterance, Word, CouncilMeeting, City, Person, Party } from '@prisma/client'
import AdminActions from './admin/Admin'
import Navbar from './Navbar'
import TranscriptControls from './TranscriptControls'
import { VideoProvider } from './VideoProvider'
import Header from './Header'
import { motion, AnimatePresence } from 'framer-motion'
import Transcript from './transcript/Transcript'
import { Options } from './options/Options'
import { TranscriptOptionsProvider } from './options/OptionsContext'
import { CouncilMeetingDataProvider } from './CouncilMeetingDataContext'

type CouncilMeetingCProps = {
    meeting: CouncilMeeting & { taskStatuses: any[], utterances: (Utterance & { words: Word[] })[] },
    editable: boolean,
    city: City,
    people: Person[],
    parties: Party[]
    speakerTags: SpeakerTag[]
}

export default function CouncilMeetingC({ meeting, city, people, parties, speakerTags, editable }: CouncilMeetingCProps) {
    const [isWide, setIsWide] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const speakerSegments: Array<{ speakerTagId: SpeakerTag["id"], utterances: (Utterance & { words: Word[] })[], start: number, end: number }> = [];
    const utteranceTimes: Array<{ id: string, start: number, end: number }> = [];
    let currentSegment: (typeof speakerSegments[number] | null) = null;
    for (const utterance of meeting.utterances) {
        if (!currentSegment ||
            currentSegment.speakerTagId !== utterance.speakerTagId ||
            utterance.startTimestamp - currentSegment.end > 5) {
            currentSegment = {
                speakerTagId: utterance.speakerTagId,
                utterances: [],
                start: utterance.startTimestamp,
                end: utterance.endTimestamp
            };
            speakerSegments.push(currentSegment);
        }
        currentSegment.utterances.push(utterance);
        currentSegment.end = utterance.endTimestamp;

        utteranceTimes.push({
            id: utterance.id,
            start: utterance.startTimestamp,
            end: utterance.endTimestamp,
        });
    }

    useEffect(() => {
        const checkSize = () => {
            setIsWide(window.innerWidth > window.innerHeight)
        }

        checkSize()
        window.addEventListener('resize', checkSize)
        setLoading(false)

        return () => window.removeEventListener('resize', checkSize)
    }, [])

    const sections = [
        { title: "Summary", icon: <LayoutList />, content: <p>Summary</p> },
        { title: "Chat", icon: <BotMessageSquare />, content: <p>Chat</p> },
        { title: "Highlights", icon: <Sparkles />, content: <p>Highlights</p> },
        { title: "Share", icon: <Share />, content: <p>Share</p> },
        { title: "Options", icon: <Settings2 />, content: <Options /> },
        { title: "Admin", icon: <CheckCircle />, content: <AdminActions meeting={meeting} /> },
    ]

    if (loading) return (
        <motion.div
            className="flex justify-center items-center h-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <Loader className="animate-spin h-10 w-10" />
        </motion.div>
    )

    return (
        <CouncilMeetingDataProvider data={{ meeting, city, people, parties, speakerTags }}>
            <TranscriptOptionsProvider>
                <VideoProvider meeting={meeting} utteranceTimes={utteranceTimes}>
                    <div className="flex flex-col overflow-hidden absolute inset-0">
                        <Header city={city} meeting={meeting} isWide={isWide} activeSection={activeSection} setActiveSection={setActiveSection} sections={sections} />
                        <div className={`flex-grow flex overflow-hidden ${isWide ? '' : 'ml-16'}`}>
                            <div className={`${isWide && activeSection ? 'w-1/2' : 'w-full'} flex flex-col scrollbar-hide`} style={{ backgroundColor: '#fefef9' }}>
                                <div className='flex-grow overflow-y-scroll scrollbar-hide'>
                                    <Transcript utterances={meeting.utterances} speakerSegments={speakerSegments} />
                                </div>
                            </div>

                            {isWide && activeSection && (
                                <div className="w-1/2 border-l flex flex-col">
                                    <h3 className="text-lg font-semibold p-4 border-b">{activeSection}</h3>
                                    <div className="p-4">
                                        {sections.find(section => section.title === activeSection)?.content}
                                    </div>
                                </div>
                            )}
                        </div>

                        <TranscriptControls isWide={isWide} className={!isWide ? "top-24 bottom-4" : ""} speakerSegments={speakerSegments} />

                    </div>

                    <AnimatePresence>
                        {!isWide && activeSection && (
                            <Sheet open={!!activeSection} onOpenChange={() => setActiveSection(null)}>
                                <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
                                    {sections.find(section => section.title === activeSection)?.content}
                                </SheetContent>
                            </Sheet>
                        )}
                    </AnimatePresence>
                </VideoProvider>
            </TranscriptOptionsProvider>
        </CouncilMeetingDataProvider>
    )
}
