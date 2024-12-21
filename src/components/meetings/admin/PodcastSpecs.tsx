import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import SpeakerBadge from "@/components/SpeakerBadge";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { getPodcastSpecsForMeeting, PodcastSpecWithRelations } from "@/lib/db/podcasts";
import { requestSplitMediaFileForPodcast } from "@/lib/tasks/splitMediaFile";
import { useToast } from '@/hooks/use-toast';

export default function PodcastSpecs() {
    const { meeting, getSpeakerTag, getPerson, getParty, getSpeakerSegmentById } = useCouncilMeetingData();
    const [podcastSpecs, setPodcastSpecs] = useState<PodcastSpecWithRelations[]>([]);
    const [expandedSpecs, setExpandedSpecs] = useState<string[]>([]);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState<{ [key: string]: boolean }>({});
    const { toast } = useToast();

    useEffect(() => {
        const fetchPodcastSpecs = async () => {
            try {
                const specs = await getPodcastSpecsForMeeting(meeting.cityId, meeting.id);
                setPodcastSpecs(specs);
                console.log(`Got ${specs.length} podcast specs for meeting ${meeting.id}`);
                console.log(specs);
            } catch (error) {
                console.error('Error fetching podcast specs:', error);
            }
        };
        fetchPodcastSpecs();
    }, [meeting.cityId, meeting.id]);

    const toggleSpec = (specId: string) => {
        setExpandedSpecs(prev =>
            prev.includes(specId)
                ? prev.filter(id => id !== specId)
                : [...prev, specId]
        );
    };

    const handleGenerateAudioSnippets = async (podcastId: string) => {
        setIsGeneratingAudio(prev => ({ ...prev, [podcastId]: true }));
        try {
            await requestSplitMediaFileForPodcast(podcastId);
            toast({
                title: "Audio snippet generation requested",
                description: "The process has started.",
            });
        } catch (error) {
            console.error('Error requesting audio snippet generation:', error);
            toast({
                title: "Error requesting audio snippet generation",
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive'
            });
        } finally {
            setIsGeneratingAudio(prev => ({ ...prev, [podcastId]: false }));
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Podcast Specs</h2>
            {podcastSpecs.map(spec => (
                <Card key={spec.id}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Podcast Spec {spec.id}
                        </CardTitle>
                        <div className="flex space-x-2">
                            <Button
                                onClick={() => handleGenerateAudioSnippets(spec.id)}
                                disabled={isGeneratingAudio[spec.id]}
                            >
                                {isGeneratingAudio[spec.id] ? 'Generating...' : 'Generate Audio Snippets'}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSpec(spec.id)}
                            >
                                {expandedSpecs.includes(spec.id) ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </CardHeader>
                    {expandedSpecs.includes(spec.id) && (
                        <CardContent>
                            {spec.parts.map(part => (
                                <div key={part.id} className="mb-4">
                                    <h3 className="font-semibold">{part.type}</h3>
                                    {part.type === 'HOST' && (
                                        <p className="text-sm mt-2">{part.text}</p>
                                    )}
                                    {part.type === 'AUDIO' && (
                                        <div className="space-y-2 mt-2">
                                            {part.audioSegmentUrl && (
                                                <div className="mb-2">
                                                    <a href={part.audioSegmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                                        Listen to Audio Segment
                                                    </a>
                                                    {part.duration && (
                                                        <span className="ml-2 text-sm text-gray-500">
                                                            Duration: {part.duration.toFixed(2)}s
                                                        </span>
                                                    )}
                                                    {part.startTimestamp && part.endTimestamp && (
                                                        <span className="ml-2 text-sm text-gray-500">
                                                            Interval: {part.startTimestamp.toFixed(2)}s - {part.endTimestamp.toFixed(2)}s
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {part.podcastPartAudioUtterances.map(utterance => {
                                                const speakerSegment = getSpeakerSegmentById(utterance.utterance.speakerSegmentId);
                                                const speakerTag = speakerSegment?.speakerTagId ? getSpeakerTag(speakerSegment.speakerTagId) : null;
                                                const person = speakerTag?.personId ? getPerson(speakerTag.personId) : null;
                                                const party = person?.partyId ? getParty(person.partyId) : null;
                                                return (
                                                    <div key={utterance.id} className="flex items-start space-x-2">
                                                        {speakerTag && person && party && (
                                                            <SpeakerBadge
                                                                speakerTag={speakerTag}
                                                                person={person}
                                                                party={party}
                                                                withLeftBorder={true}
                                                            />
                                                        )}
                                                        <p className="text-sm">{utterance.utterance.text}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    )}
                </Card>
            ))}
        </div>
    );
}
