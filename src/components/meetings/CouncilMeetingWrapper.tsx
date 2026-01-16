"use client"

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { Loader } from 'lucide-react'
import { VideoProvider } from './VideoProvider'
import { motion } from 'framer-motion'
import { TranscriptOptionsProvider } from './options/OptionsContext'
import { CouncilMeetingDataProvider } from './CouncilMeetingDataContext'
import { HighlightProvider } from './HighlightContext'
import { MeetingData } from '@/lib/getMeetingData'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { KeyboardShortcutsProvider } from '@/contexts/KeyboardShortcutsContext'
import { EditingProvider } from './EditingContext'


type CouncilMeetingWrapperProps = {
    editable: boolean,
    canCreateHighlights: boolean,
    meetingData: MeetingData,
    children: React.ReactNode
}

const LayoutContext = createContext<{ isWide: boolean }>({ isWide: false });
export const useLayout = () => useContext(LayoutContext);

export default function CouncilMeetingWrapper({ meetingData, editable, canCreateHighlights, children }: CouncilMeetingWrapperProps) {
    const [isWide, setIsWide] = useState(false);
    const [loading, setLoading] = useState(true);

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

        return () => window.removeEventListener('resize', checkSize)
    }, [])

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
                <TranscriptOptionsProvider editable={editable} canCreateHighlights={canCreateHighlights}>
                    <VideoProvider meeting={memoizedMeeting} utterances={memoizedUtterances}>
                        <HighlightProvider>
                            <KeyboardShortcutsProvider>
                                <EditingProvider>
                                    <KeyboardShortcuts />
                                    {children}
                                </EditingProvider>
                            </KeyboardShortcutsProvider>
                        </HighlightProvider>
                    </VideoProvider>
                </TranscriptOptionsProvider>
            </CouncilMeetingDataProvider>
        </LayoutContext.Provider>
    )
}