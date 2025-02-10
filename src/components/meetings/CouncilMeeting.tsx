"use client"

import { useState, useEffect, useRef, useMemo } from 'react'
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu, ChartArea, BarChart, BarChart2, BarChart3, MessageSquareQuote } from "lucide-react"
import { SpeakerTag, Utterance, Word, CouncilMeeting, City, Person, Party, HighlightedUtterance } from '@prisma/client'
import AdminActions from './admin/Admin'
import Navbar from './Navbar'
import TranscriptControls from './TranscriptControls'
import { useVideo, VideoProvider } from './VideoProvider'
import Header from './Header'
import { motion, AnimatePresence } from 'framer-motion'
import Transcript from './transcript/Transcript'
import { Options } from './options/Options'
import { TranscriptOptionsProvider } from './options/OptionsContext'
import { CouncilMeetingDataProvider } from './CouncilMeetingDataContext'
import { Transcript as TranscriptType } from '@/lib/db/transcript'
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../ui/button'
import { ChatInterface } from './Chat'
import { Statistics } from './Statistics'
import ShareC from './Share'
import Summary from './Summary'
import Highlights from '../Highlights'
import { HighlightWithUtterances } from '@/lib/db/highlights'
import { SubjectWithRelations } from '@/lib/db/subject'
import Subjects from './Subjects'
import { MeetingData } from '@/lib/getMeetingData'

type CouncilMeetingCProps = {
    editable: boolean,
    meetingData: MeetingData
}

export default function CouncilMeetingC({ meetingData, editable }: CouncilMeetingCProps) {
    const [isWide, setIsWide] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<'transcript' | 'highlights'>('transcript');
    const highlightId = typeof window !== 'undefined' && window.location.hash.startsWith('#h-')
        ? window.location.hash.slice(3)
        : null;

    const memoizedUtterances = useMemo(() => {
        return meetingData.transcript.map((u) => u.utterances).flat()
    }, [meetingData.transcript]);

    const memoizedMeeting = useMemo(() => meetingData.meeting, [meetingData.meeting]);

    useEffect(() => {
        const checkSize = () => {
            setIsWide(window.innerWidth > window.innerHeight)
        }

        checkSize()
        window.addEventListener('resize', checkSize)
        setLoading(false)

        // Check if URL hash starts with #h- and set mode to 'highlights' if it does
        if (typeof window !== 'undefined' && window.location.hash.startsWith('#h-')) {
            setMode('highlights');
        }

        return () => window.removeEventListener('resize', checkSize)
    }, [])

    const sections = [
        { title: "Τοποθετήσεις", icon: <MessageSquareQuote />, content: <Summary /> },
        { title: "Θέματα", icon: <LayoutList />, content: <Subjects /> },
        { title: "Στατιστικά", icon: <BarChart3 />, content: <Statistics /> },
        { title: "Κοινοποίηση", icon: <Share />, content: <ShareC /> },
        { title: "Επιλογές", icon: <Settings2 />, content: <Options editable={editable} /> },
    ]

    if (editable) {
        sections.push({ title: "Highlights", icon: <Sparkles />, content: <Highlights highlights={meetingData.highlights} /> })
        sections.push({ title: "Admin", icon: <CheckCircle />, content: <AdminActions /> })
    }

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

    console.log("Rendering VideoProvider");
    return (
        <CouncilMeetingDataProvider data={meetingData}>
            <TranscriptOptionsProvider editable={editable}>
                <VideoProvider meeting={memoizedMeeting} utterances={memoizedUtterances}>
                    {mode === 'transcript' ? (
                        <div className="flex flex-col overflow-hidden absolute inset-0 h-[100dvh]">
                            <div className={`flex-grow flex overflow-hidden ${isWide ? '' : 'ml-12'}`}>
                                <div className={`${isWide && activeSection ? 'w-1/2' : 'w-full'} flex flex-col scrollbar-hide`} style={{ backgroundColor: '#fefef9' }}>
                                    <div className='flex-grow overflow-y-auto scrollbar-hide pb-24'>
                                    </div>
                                </div>

                                {isWide && activeSection && (
                                    <div className="w-1/2 border-l flex flex-col overflow-y-auto">
                                        <div className="flex-grow overflow-y-auto scrollbar-hide p-4 pb-24">
                                            {sections.find(section => section.title === activeSection)?.content}
                                        </div>
                                    </div>
                                )}
                            </div>


                            {!isWide && activeSection && (
                                <div className="fixed bottom-0 left-0 right-0 h-[70vh] bg-background z-50 overflow-y-auto border-t-2 border-gray-200">
                                    <div className="sticky top-0 z-10 bg-background py-4">
                                        <Navbar
                                            sections={sections}
                                            activeSection={activeSection}
                                            setActiveSection={setActiveSection}
                                            showClose={true}
                                            className='justify-center'
                                        />
                                    </div>
                                    <div className="p-4 overflow-y-auto" style={{ height: 'calc(70vh - 48px)' }}>
                                        {sections.find(section => section.title === activeSection)?.content}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (<></>
                    )}
                </VideoProvider>
            </TranscriptOptionsProvider>
        </CouncilMeetingDataProvider>
    )
}
