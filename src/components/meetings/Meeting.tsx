"use client"

import { CouncilMeeting } from "@prisma/client"
import React from "react"
import { useState } from "react";
import { diarizeSpeakers } from "@/lib/diarizeSpeakers";
import { Button } from "../ui/button";
import MeetingView from "./MeetingView";

export default function Meeting({ meeting, editable }: { meeting: CouncilMeeting, editable: boolean }) {
    const [isDiarizing, setIsDiarizing] = useState(false);

    const handleDiarize = async () => {
        setIsDiarizing(true);
        try {
            await diarizeSpeakers(meeting.id, meeting.cityId);
            // You might want to add some success feedback here
        } catch (error) {
            console.error("Error diarizing speakers:", error);
            // You might want to add some error feedback here
        } finally {
            setIsDiarizing(false);
        }
    };


    return (
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{meeting.name}</h1>
            {editable && (
                <Button onClick={handleDiarize} disabled={isDiarizing}>
                    Diarize Speakers
                </Button>
            )}

            <MeetingView meeting={meeting} editable={editable} />
        </div>
    )
}