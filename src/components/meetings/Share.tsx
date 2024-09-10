import ReactPDF from '@react-pdf/renderer';
import { pdf } from '@react-pdf/renderer';
import { CouncilMeetingDocument } from './pdf/CouncilMeetingDocument';
import { useVideo } from './VideoProvider';
import { useState, useEffect } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { CheckCircle, CopyIcon, FileDown, Loader2 } from "lucide-react";
import { useCouncilMeetingData } from './CouncilMeetingDataContext';

export function ShareC() {
    const { currentTime } = useVideo();
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

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

    const handleExportToPDF = async () => {
        setIsExporting(true);
        const pdfDocument = <CouncilMeetingDocument city={city} meeting={meeting} transcript={transcript} people={people} parties={parties} speakerTags={speakerTags} />;
        const pdfBlob = await pdf(pdfDocument).toBlob();
        const blobUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'council_meeting.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setIsExporting(false);
    };

    return (<div className="space-y-8">
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center">
                <h3 className="text-md md:text-lg font-medium w-full sm:w-1/4 mb-2 sm:mb-0">Σύνδεσμος</h3>
                <div className="w-full sm:w-3/4 space-y-2">
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
        </div>

        <div className="flex items-center">
            <h3 className="text-md md:text-lg font-medium w-1/4">Εξαγωγή</h3>
            <div className="w-3/4 flex justify-end">
                <Button onClick={handleExportToPDF} className='max-w-48' disabled={isExporting}>
                    {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                    <span className="hidden md:inline">Εξαγωγή σε PDF</span>
                </Button>
            </div>
        </div>
    </div>
    );
}