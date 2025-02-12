"use client"

import { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react'
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Play, Pause, MessageSquare, FileText, CheckCircle, BotMessageSquare, NotepadText, Settings2, LayoutList, Sparkles, X, Wrench, Share, Loader, Menu, ChartArea, BarChart, BarChart2, BarChart3, MessageSquareQuote } from "lucide-react"
import AdminActions from './admin/Admin'
import { useVideo, VideoProvider } from './VideoProvider'
import { motion, AnimatePresence } from 'framer-motion'
import { Options } from './options/Options'
import { TranscriptOptionsProvider } from './options/OptionsContext'
import { CouncilMeetingDataProvider } from './CouncilMeetingDataContext'
import { Statistics } from './Statistics'
import ShareC from './Share'
import Summary from './Summary'
import Highlights from '../Highlights'
import { HighlightWithUtterances } from '@/lib/db/highlights'
import HighlightView from './highlightView/HighlightView'
import { SubjectWithRelations } from '@/lib/db/subject'
import Subjects from './Subjects'
import { MeetingData } from '@/lib/getMeetingData'
import { KeyboardShortcuts } from './KeyboardShortcuts'

type CouncilMeetingWrapperProps = {
    editable: boolean,
    meetingData: MeetingData,
    children: React.ReactNode
}

const LayoutContext = createContext<{ isWide: boolean }>({ isWide: false });
export const useLayout = () => useContext(LayoutContext);

export default function CouncilMeetingWrapper({ meetingData, editable, children }: CouncilMeetingWrapperProps) {
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

    return (
        <LayoutContext.Provider value={{ isWide }}>
            <CouncilMeetingDataProvider data={meetingData}>
                <TranscriptOptionsProvider editable={editable}>
                    <VideoProvider meeting={memoizedMeeting} utterances={memoizedUtterances}>
                        <KeyboardShortcuts />
                        {children}
                    </VideoProvider>
                </TranscriptOptionsProvider>
            </CouncilMeetingDataProvider>
        </LayoutContext.Provider>
    )
}