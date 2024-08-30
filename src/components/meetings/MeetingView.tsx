import React from 'react';
import { CouncilMeeting, SpeakerDiarization } from '@prisma/client';
import Controls from './Controls';

interface MeetingViewProps {
    meeting: CouncilMeeting & { speakerDiarizations: SpeakerDiarization[] };
    editable: boolean;
}

const MeetingView: React.FC<MeetingViewProps> = ({ meeting, editable }) => {
    return (
        <div className="">
            <Controls meeting={meeting} />
        </div>
    );
};

export default MeetingView;
