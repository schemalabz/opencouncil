"use client"

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { Loader } from 'lucide-react'
import { VideoProvider } from './VideoProvider'
import { motion } from 'framer-motion'
import { TranscriptOptionsProvider } from './options/OptionsContext'
import { CouncilMeetingDataProvider } from './CouncilMeetingDataContext'
import { HighlightProvider } from './HighlightContext'
import { UtteranceExpansionProvider } from './subject/UtteranceExpansionContext'
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

const LayoutContext = createContext<{
    isWide: boolean;
    isControlsVisible: boolean;
    setIsControlsVisible: (next: boolean | ((prev: boolean) => boolean)) => void;
}>({
    isWide: false,
    isControlsVisible: true,
    setIsControlsVisible: () => { },
});
export const useLayout = () => useContext(LayoutContext);

export default function CouncilMeetingWrapper({ meetingData, editable, canCreateHighlights, children }: CouncilMeetingWrapperProps) {
    const [isWide, setIsWide] = useState(false);
    // Lifted from TranscriptControls so other floating buttons (e.g. FisheyeToggle)
    // can position themselves relative to the show/hide-bar toggle on mobile.
    const [isControlsVisible, setIsControlsVisible] = useState(false);
    const [loading, setLoading] = useState(true);

    const memoizedUtterances = useMemo(() => {
        return meetingData.transcript.map((u) => u.utterances).flat()
    }, [meetingData.transcript]);

    const memoizedMeeting = useMemo(() => meetingData.meeting, [meetingData.meeting]);

    useEffect(() => {
        const checkSize = () => {
            const wide = window.innerWidth > window.innerHeight;
            setIsWide(wide);
            // Wide (landscape) viewports show the controls; narrow viewports
            // keep the user's current choice (default `false` on first mount).
            // Resize never force-collapses — incidental height changes (soft
            // keyboard, DevTools) would otherwise hide a bar the user opened.
            if (wide) setIsControlsVisible(true);
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
        <LayoutContext.Provider value={{ isWide, isControlsVisible, setIsControlsVisible }}>
            <CouncilMeetingDataProvider data={meetingData}>
                <TranscriptOptionsProvider editable={editable} canCreateHighlights={canCreateHighlights}>
                    <VideoProvider meeting={memoizedMeeting} utterances={memoizedUtterances}>
                        <UtteranceExpansionProvider>
                            <HighlightProvider>
                                <KeyboardShortcutsProvider>
                                    <EditingProvider>
                                        <KeyboardShortcuts />
                                        {children}
                                    </EditingProvider>
                                </KeyboardShortcutsProvider>
                            </HighlightProvider>
                        </UtteranceExpansionProvider>
                    </VideoProvider>
                </TranscriptOptionsProvider>
            </CouncilMeetingDataProvider>
        </LayoutContext.Provider>
    )
}