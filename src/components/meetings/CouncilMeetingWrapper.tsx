"use client"

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { BarDataProvider } from '@/components/meetings/bar/BarDataContext';
import { BarHighlightProvider } from '@/components/meetings/bar/BarHighlightContext';
import { BarModeProvider } from '@/components/meetings/bar/PlaybackBar';
import { VideoProvider } from './VideoProvider'
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

const LayoutContext = createContext<{ isWide: boolean }>({ isWide: false });
export const useLayout = () => useContext(LayoutContext);

export default function CouncilMeetingWrapper({ meetingData, editable, canCreateHighlights, children }: CouncilMeetingWrapperProps) {
    const [isWide, setIsWide] = useState(false);

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

        return () => window.removeEventListener('resize', checkSize)
    }, [])

    return (
        <LayoutContext.Provider value={{ isWide }}>
            <CouncilMeetingDataProvider data={meetingData}>
                <TranscriptOptionsProvider editable={editable} canCreateHighlights={canCreateHighlights}>
                    <VideoProvider meeting={memoizedMeeting} utterances={memoizedUtterances}>
                        <BarDataProvider>
                        <BarHighlightProvider>
                        <BarModeProvider>
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
                        </BarModeProvider>
                        </BarHighlightProvider>
                        </BarDataProvider>
                    </VideoProvider>
                </TranscriptOptionsProvider>
            </CouncilMeetingDataProvider>
        </LayoutContext.Provider>
    )
}
