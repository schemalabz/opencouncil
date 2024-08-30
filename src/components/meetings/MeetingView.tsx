import React from 'react';
import { CouncilMeeting } from '@prisma/client';

interface MeetingViewProps {
    meeting: CouncilMeeting;
}

const MeetingView: React.FC<MeetingViewProps> = ({ meeting }) => {
    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Main content area */}
            <div className="flex-grow">
                {/* Add your main meeting content here */}
            </div>

            {/* Timeline container */}
            <div className="absolute bottom-0 left-0 right-0 bg-gray-100 p-4 shadow-lg">
                <h2 className="text-lg font-semibold mb-2">TIMELINE</h2>
                {/* Add your timeline content here */}
            </div>
        </div>
    );
};

export default MeetingView;
