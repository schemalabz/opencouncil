"use client"

import { useState, useEffect, useRef, useMemo } from 'react'
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu, ChartArea, BarChart, BarChart2, BarChart3 } from "lucide-react"
import { SpeakerTag, Utterance, Word, CouncilMeeting, City, Person, Party } from '@prisma/client'
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
import { ShareC } from './Share'
import Summary from './Summary'

type CouncilMeetingCProps = {
    editable: boolean,
    meetingData: {
        meeting: CouncilMeeting & { taskStatuses: any[] },
        transcript: TranscriptType,
        city: City,
        people: Person[],
        parties: Party[]
        speakerTags: SpeakerTag[]
    }
}

export default function CouncilMeetingC({ meetingData, editable }: CouncilMeetingCProps) {
    const [isWide, setIsWide] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const utterances = useMemo(() => {
        return meetingData.transcript.map((u) => u.utterances).flat()
    }, [meetingData.transcript]);

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
        { title: "Τοποθετήσεις", icon: <LayoutList />, content: <Summary /> },
        { title: "Στατιστικά", icon: <BarChart3 />, content: <Statistics /> },
        { title: "Κοινοποίηση", icon: <Share />, content: <ShareC /> },
        { title: "Επιλογές", icon: <Settings2 />, content: <Options editable={editable} /> },
    ]

    if (editable) {
        sections.push({ title: "Admin", icon: <CheckCircle />, content: <AdminActions meeting={meetingData.meeting} /> })
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

    return (
        <CouncilMeetingDataProvider data={{ transcript: meetingData.transcript, meeting: meetingData.meeting, city: meetingData.city, people: meetingData.people, parties: meetingData.parties, speakerTags: meetingData.speakerTags }}>
            <TranscriptOptionsProvider editable={editable}>
                <VideoProvider meeting={meetingData.meeting} utterances={utterances}>
                    <div className="flex flex-col overflow-hidden absolute inset-0 h-[100dvh]">
                        <Header city={meetingData.city} meeting={meetingData.meeting} isWide={isWide} activeSection={activeSection} setActiveSection={setActiveSection} sections={sections} />
                        <div className={`flex-grow flex overflow-hidden ${isWide ? '' : 'ml-12'}`}>
                            <div className={`${isWide && activeSection ? 'w-1/2' : 'w-full'} flex flex-col scrollbar-hide`} style={{ backgroundColor: '#fefef9' }}>
                                <div className='flex-grow overflow-y-auto scrollbar-hide'>
                                    <Transcript speakerSegments={meetingData.transcript} />
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

                        <TranscriptControls isWide={isWide} className={!isWide ? "top-24 bottom-4" : ""} speakerSegments={meetingData.transcript} />

                        <CurrentTimeButton isWide={isWide} />
                    </div>

                    <AnimatePresence>
                        {!isWide && activeSection && (
                            <Sheet open={!!activeSection} onOpenChange={() => setActiveSection(null)}>
                                <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
                                    <div className="flex justify-center mb-4">
                                        <Navbar
                                            sections={sections}
                                            activeSection={activeSection}
                                            setActiveSection={setActiveSection}
                                            showClose={false}
                                            className='justify-center'
                                        />
                                    </div>
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

const CurrentTimeButton = ({ isWide }: { isWide: boolean }) => {
    const { currentTime, currentScrollInterval, scrollToUtterance } = useVideo();

    if (currentScrollInterval && !(currentTime >= currentScrollInterval[0] && currentTime <= currentScrollInterval[1])) {
        const isScrollingUp = currentTime < currentScrollInterval[0];
        const Icon = isScrollingUp ? ArrowUp : ArrowDown;

        return (
            <Button
                onClick={() => scrollToUtterance(currentTime)}
                className={`absolute ${isWide ? 'bottom-24 left-1/2 transform -translate-x-1/2' : 'bottom-2 left-1/2 transform -translate-x-1/2'}`}
                variant="outline"
            >
                <Icon className="w-4 h-4 mr-2" />
                Go to current time
            </Button>
        );
    } else {
        return null;
    }
}