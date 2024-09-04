"use client"

import { useState, useEffect } from 'react'
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu } from "lucide-react"
import { SpeakerTag, Utterance, Word, CouncilMeeting, City } from '@prisma/client'
import SpeakerSegment from './transcript/SpeakerSegment'
import { Button } from '../ui/button'
import AdminActions from './admin/Admin'
import Navbar from './Navbar'
import TranscriptControls from './TranscriptControls'
import { VideoProvider } from './VideoProvider'
import { Link } from "@/i18n/routing"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Home } from "lucide-react"
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import Transcript from './transcript/Transcript'

export default function CouncilMeetingC({ meeting, editable, city }: { meeting: CouncilMeeting & { taskStatuses: any[], utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] }, editable: boolean, city: City }) {
    const [isWide, setIsWide] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const speakerSegments: { speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[] })[] }[] =
        meeting.utterances.reduce((segments, utterance) => {
            const lastSegment = segments[segments.length - 1];
            if (lastSegment && lastSegment.speakerTag.id === utterance.speakerTag.id) {
                lastSegment.utterances.push(utterance);
            } else {
                segments.push({
                    speakerTag: utterance.speakerTag,
                    utterances: [utterance]
                });
            }
            return segments;
        }, [] as { speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[] })[] }[]);

    const speakerTimes = speakerSegments.map(({ speakerTag, utterances }) => {
        return {
            speakerTag,
            start: utterances[0].startTimestamp,
            end: utterances[utterances.length - 1].endTimestamp,
        }
    })

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
        { title: "Settings", icon: <Settings2 />, content: <p>Settings</p> },
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
        <VideoProvider meeting={meeting}>
            <motion.div
                className="min-h-screen flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <Header city={city} meeting={meeting} isWide={isWide} activeSection={activeSection} setActiveSection={setActiveSection} sections={sections} />

                <main className={`flex-grow flex overflow-hidden ${isWide ? '' : 'ml-16'}`}>
                    <Transcript utterances={meeting.utterances} />
                    <AnimatePresence>
                        {isWide && activeSection && (
                            <motion.div
                                className="w-1/2 p-4 border-l"
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 20, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <h3 className="text-lg font-semibold mb-4">{activeSection}</h3>
                                {sections.find(section => section.title === activeSection)?.content}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
                <AnimatePresence>
                    {!isWide && activeSection && (
                        <Sheet open={!!activeSection} onOpenChange={() => setActiveSection(null)}>
                            <SheetContent side="bottom" className="h-[70vh]">
                                <motion.div
                                    className="mb-4 flex justify-between"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: 20, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <Navbar sections={sections} showClose={false} setActiveSection={setActiveSection} activeSection={activeSection} />
                                </motion.div>
                                <motion.h3
                                    className="text-lg font-semibold mb-4"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                >
                                    {activeSection}
                                </motion.h3>
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.3, delay: 0.2 }}
                                >
                                    {sections.find(section => section.title === activeSection)?.content}
                                </motion.div>
                            </SheetContent>
                        </Sheet>
                    )}
                </AnimatePresence>
                <TranscriptControls isWide={isWide} className={!isWide ? "top-24 bottom-4" : ""} speakerTimes={speakerTimes} />
            </motion.div>
        </VideoProvider>
    )
}

function Header({ city, meeting, isWide, activeSection, setActiveSection, sections }: { city: City, meeting: CouncilMeeting, isWide: boolean, activeSection: string | null, setActiveSection: (section: string | null) => void, sections: { title: string, icon: React.ReactNode, content: React.ReactNode }[] }) {
    return (
        <motion.header
            className={`sticky top-0 z-10 bg-background border-b p-4 flex justify-evenly items-center`}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div className='flex-row justify-between'>
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link href="/">
                                    <Image width={12} height={12} src='/logo.png' alt='logo' />
                                    <span className="sr-only">Home</span>
                                </Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link href={`/${meeting.cityId}`}>{city.name}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{meeting.dateTime.toLocaleDateString()}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                <motion.h1
                    className="flex-1 text-md font-bold"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    {meeting.name}
                </motion.h1>
            </div>

            <div className="flex-1">
                {isWide ? (
                    <Navbar sections={sections} showClose={true} setActiveSection={setActiveSection} activeSection={activeSection} />
                ) : (
                    <motion.div
                        className="flex justify-end"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Button variant="ghost" size="icon" onClick={() => setActiveSection('Summary')}>
                            <Menu className="h-6 w-6" />
                        </Button>
                    </motion.div>
                )}
            </div>
        </motion.header>
    )
}