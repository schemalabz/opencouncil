"use client";
import { useVideo } from './VideoProvider';
import { useState, useEffect } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { CheckCircle, CopyIcon, FileDown, LinkIcon } from "lucide-react";
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useTranscriptOptions } from './options/OptionsContext';
import { MeetingExportButtons } from './MeetingExportButtons';
export default function ShareC() {
    const { currentTime } = useVideo();
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const { options } = useTranscriptOptions();

    useEffect(() => {
        setUrl(window.location.href);
    }, []);

    const getShareableUrl = () => {
        if (includeTimestamp) {
            const timeParam = `t=${Math.floor(currentTime)}`;
            return url.includes('?') ? `${url}&${timeParam}` : `${url}?${timeParam}`;
        }
        return url;
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getShareableUrl());
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const { meeting, transcript, people, parties, speakerTags, city } = useCouncilMeetingData();

    const getMeetingData = () => ({
        city, 
        meeting, 
        transcript, 
        people, 
        parties, 
        speakerTags 
    });

    return (
        <div className="flex flex-col w-full p-6">
            <section className="w-full max-w-4xl mx-auto space-y-8">
                <div>
                    <h3 className="text-xl font-bold text-left mb-2">
                        <LinkIcon className="w-4 h-4 inline-block mr-2" />
                        Κοινοποίηση
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Μοιραστείτε αυτή τη συνεδρίαση με άλλους
                    </p>

                    <div className="space-y-4">
                        <div className="flex">
                            <Input
                                value={getShareableUrl()}
                                readOnly
                                className="flex-grow mr-2"
                            />
                            <Button onClick={copyToClipboard} className="flex-shrink-0" disabled={copySuccess}>
                                {copySuccess ? (
                                    <span className="flex items-center text-center">
                                        <CheckCircle className="w-4 h-4 mr-2 inline-block" />
                                        <span className="hidden md:inline-block">Αντιγράφηκε</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center">
                                        <CopyIcon className="w-4 h-4 mr-2 inline-block" />
                                        <span className="hidden md:inline-block">Αντιγραφή</span>
                                    </span>
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="timestamp"
                                checked={includeTimestamp}
                                onCheckedChange={(checked) => setIncludeTimestamp(checked as boolean)}
                            />
                            <label
                                htmlFor="timestamp"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Ξεκίνημα στο {formatTimestamp(currentTime)}
                            </label>
                        </div>
                    </div>
                </div>

                {options.editsAllowed && (
                    <div>
                        <h3 className="text-xl font-bold text-left mb-2">
                            <FileDown className="w-4 h-4 inline-block mr-2" />
                            Εξαγωγή
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Κατεβάστε την απομαγνητοφώνηση της συνεδρίασης
                        </p>

                        <MeetingExportButtons
                            getMeetingData={getMeetingData}
                            cityId={city.id}
                            meetingId={meeting.id}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}