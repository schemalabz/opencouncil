import React from 'react';
import { CouncilMeeting, SpeakerDiarization } from '@prisma/client';
import Controls from './Controls';
import { VideoProvider } from './VideoProvider';
import PlaybackControls from './PlaybackControls';

interface MeetingViewProps {
    meeting: CouncilMeeting & { speakerDiarizations: SpeakerDiarization[] };
    editable: boolean;
}

const MeetingView: React.FC<MeetingViewProps> = ({ meeting, editable }) => {
    console.log(`Meeting is ${meeting.video}`)
    return (
        <VideoProvider meeting={meeting}>
            <div className="">
                <Controls meeting={meeting} />
            </div>
        </VideoProvider>
    );
};

export default MeetingView;
