"use client"

import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu } from "lucide-react"
import { SpeakerTag, Utterance, Word, CouncilMeeting, City } from '@prisma/client'
import AdminActions from './admin/Admin'
import Navbar from './Navbar'
import TranscriptControls from './TranscriptControls'
import { VideoProvider } from './VideoProvider'
import Header from './Header'
import { motion, AnimatePresence } from 'framer-motion'
import Transcript from './transcript/Transcript'
import { Options } from './options/Options'
import { TranscriptOptionsProvider } from './options/OptionsContext'

export default function CouncilMeetingC({ meeting, editable, city }: { meeting: CouncilMeeting & { taskStatuses: any[], utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] }, editable: boolean, city: City }) {
    const [isWide, setIsWide] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const speakerSegments: Array<{ speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] }> = [];
    const speakerTimes: Array<{ speakerTag: SpeakerTag, start: number, end: number }> = [];
    const utteranceTimes: Array<{ id: string, start: number, end: number }> = [];
    let currentSegment: { speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] } | null = null;

    for (const utterance of meeting.utterances) {
        if (!currentSegment || currentSegment.speakerTag.id !== utterance.speakerTag.id) {
            if (currentSegment) {
                speakerTimes.push({
                    speakerTag: currentSegment.speakerTag,
                    start: currentSegment.utterances[0].startTimestamp,
                    end: currentSegment.utterances[currentSegment.utterances.length - 1].endTimestamp,
                });
            }
            currentSegment = {
                speakerTag: utterance.speakerTag,
                utterances: []
            };
            speakerSegments.push(currentSegment);
        }
        currentSegment.utterances.push(utterance);

        utteranceTimes.push({
            id: utterance.id,
            start: utterance.startTimestamp,
            end: utterance.endTimestamp,
        });
    }

    if (currentSegment) {
        speakerTimes.push({
            speakerTag: currentSegment.speakerTag,
            start: currentSegment.utterances[0].startTimestamp,
            end: currentSegment.utterances[currentSegment.utterances.length - 1].endTimestamp,
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
        <TranscriptOptionsProvider>
            <VideoProvider meeting={meeting} utteranceTimes={utteranceTimes}>
                <div className="flex flex-col overflow-hidden">
                    <Header city={city} meeting={meeting} isWide={isWide} activeSection={activeSection} setActiveSection={setActiveSection} sections={sections} />

                    <div className={`flex-grow flex overflow-hidden ${isWide ? '' : 'ml-16'}`}>
                        <div className={`${isWide && activeSection ? 'w-1/2' : 'w-full'} flex flex-col`}>
                            <div className='flex-grow'>
                                <Transcript utterances={meeting.utterances} />
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

                    <TranscriptControls isWide={isWide} className={!isWide ? "top-24 bottom-4" : ""} speakerTimes={speakerTimes} />

                    <AnimatePresence>
                        {!isWide && activeSection && (
                            <Sheet open={!!activeSection} onOpenChange={() => setActiveSection(null)}>
                                <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
                                    {sections.find(section => section.title === activeSection)?.content}
                                </SheetContent>
                            </Sheet>
                        )}
                    </AnimatePresence>
                </div>
            </VideoProvider>
        </TranscriptOptionsProvider>
    )
}
