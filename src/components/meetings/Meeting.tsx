"use client"

import { CouncilMeeting, DiarizationRequest, SpeakerDiarization, TranscriptionRequest } from "@prisma/client"
import React from "react"
import MeetingView from "./MeetingView"
import { diarizeSpeakers } from "@/lib/diarizeSpeakers"
import { requestTranscription } from "@/lib/transcribe"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import TimeAgo from "react-timeago"

export default function Meeting({ meeting, editable }: {
    meeting: CouncilMeeting & {
        speakerDiarizations: SpeakerDiarization[],
        transcriptionRequest: TranscriptionRequest,
        speakerDiarizationRequest: DiarizationRequest
    },
    editable: boolean
}) {
    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">{meeting.name}</h1>
                {editable && <AdminActions meeting={meeting} />}
            </div>
            <MeetingView meeting={meeting} editable={editable} />
        </>
    )
}

const AdminActions: React.FC<{
    meeting: CouncilMeeting & {
        transcriptionRequest: TranscriptionRequest,
        speakerDiarizationRequest: DiarizationRequest
    }
}> = ({ meeting }) => {
    const [isProcessing, setIsProcessing] = React.useState(false);

    const handleDiarize = async () => {
        setIsProcessing(true);
        try {
            await diarizeSpeakers(meeting.id, meeting.cityId);
            // You might want to add some success feedback here
        } catch (error) {
            console.error("Error diarizing speakers:", error);
            // You might want to add some error feedback here
        } finally {
            setIsProcessing(false);
        }
    };

    const handleTranscribe = async () => {
        setIsProcessing(true);
        try {
            await requestTranscription(meeting.id, meeting.cityId);
            // You might want to add some success feedback here
        } catch (error) {
            console.error("Error requesting transcription:", error);
            // You might want to add some error feedback here
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline">
                    Admin Actions
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-6 bg-white rounded-lg shadow-lg">
                <div className="space-y-6">
                    <div>
                        <h4 className="text-lg font-semibold mb-2">Diarization Request</h4>
                        <div className="space-y-2">
                            <p className="text-sm">
                                Status: <Badge>{meeting.speakerDiarizationRequest?.status || 'Not started'}</Badge>
                            </p>
                            <p className="text-sm">
                                Created: {meeting.speakerDiarizationRequest?.createdAt ? <TimeAgo date={meeting.speakerDiarizationRequest.createdAt} /> : 'N/A'}
                            </p>
                            <p className="text-sm">
                                Updated: {meeting.speakerDiarizationRequest?.updatedAt ? <TimeAgo date={meeting.speakerDiarizationRequest.updatedAt} /> : 'N/A'}
                            </p>
                            <p className="text-sm">
                                Job ID: <code>{meeting.speakerDiarizationRequest?.jobId || 'N/A'}</code>
                            </p>
                        </div>
                        <Button
                            onClick={handleDiarize}
                            disabled={isProcessing}
                            className="w-full mt-3"
                        >
                            {meeting.speakerDiarizationRequest ? 'Re-diarize' : 'Diarize'} Speakers
                        </Button>
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold mb-2">Transcription Request</h4>
                        <p className="text-sm mb-3">
                            Status: <Badge>{meeting.transcriptionRequest?.status || 'Not started'}</Badge>
                        </p>
                        <Button
                            onClick={handleTranscribe}
                            disabled={isProcessing}
                            className="w-full"
                        >
                            {meeting.transcriptionRequest ? 'Re-transcribe' : 'Transcribe'} Meeting
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
