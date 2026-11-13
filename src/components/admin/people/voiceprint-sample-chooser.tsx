"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Pause, Play, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getVoiceprintSamples } from "@/lib/actions/tasks";
import { formatTimestamp } from "@/lib/formatters/time";

type VoiceprintSample = Awaited<ReturnType<typeof getVoiceprintSamples>>[number];

interface VoiceprintSampleChooserProps {
    personId: string;
    onUse: (segmentId: string) => Promise<void>;
}

/**
 * One sample at a time of the audio a person's voiceprint can be cut from. The
 * first is the longest segment; "another one" goes on to the next, usually in
 * another meeting. The sample plays exactly the window the voiceprint uses.
 */
export function VoiceprintSampleChooser({ personId, onUse }: VoiceprintSampleChooserProps) {
    const [samples, setSamples] = useState<VoiceprintSample[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [index, setIndex] = useState(0);
    const [isRequesting, setIsRequesting] = useState(false);
    // The first sample waits for Play; every later one plays as it appears.
    const [autoPlay, setAutoPlay] = useState(false);

    useEffect(() => {
        // A stale answer must not overwrite the dialog that is open now.
        let cancelled = false;
        getVoiceprintSamples(personId)
            .then((result) => { if (!cancelled) setSamples(result); })
            .catch((error) => {
                console.error("Error loading voiceprint samples:", error);
                if (!cancelled) setLoadFailed(true);
            });
        return () => { cancelled = true; };
    }, [personId]);

    if (loadFailed) {
        return <p className='text-sm text-red-600'>Could not load the samples. Close the dialog and open it again.</p>;
    }
    if (!samples) {
        return (
            <div className='flex justify-center py-4'>
                <Loader2 className='h-5 w-5 animate-spin text-slate-400' />
            </div>
        );
    }
    if (samples.length === 0) {
        return (
            <p className='text-sm text-slate-600'>
                This person has no segment that can become a voiceprint: it must be long enough, and its meeting must have audio or video.
            </p>
        );
    }

    const sample = samples[index];
    const use = async () => {
        setIsRequesting(true);
        try {
            await onUse(sample.segmentId);
        } finally {
            setIsRequesting(false);
        }
    };
    return (
        <div className='space-y-3 rounded-md border p-3'>
            <div className='text-sm'>
                <p className='font-medium'>{sample.meetingName}</p>
                <p className='text-slate-500'>
                    {formatTimestamp(sample.startTimestamp)}–{formatTimestamp(sample.endTimestamp)} · sample {index + 1} of {samples.length}
                </p>
            </div>
            {/* The key restarts the player on another sample. */}
            <WindowPlayer key={sample.segmentId} sample={sample} autoPlay={autoPlay} isOnlySample={samples.length === 1} />
            <div className='flex gap-2'>
                <Button onClick={use} disabled={isRequesting} className='flex-1'>
                    {isRequesting
                        ? <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        : <AudioLines className='mr-2 h-4 w-4' />}
                    Use this sample
                </Button>
                <Button
                    variant='outline'
                    onClick={() => {
                        setIndex((index + 1) % samples.length);
                        setAutoPlay(true);
                    }}
                    disabled={isRequesting || samples.length === 1}
                >
                    <SkipForward className='mr-2 h-4 w-4' />
                    Another one
                </Button>
            </div>
        </div>
    );
}

/** Plays the sample's window only: it starts at the window's start every time and stops at its end. */
function WindowPlayer({ sample, autoPlay, isOnlySample }: { sample: VoiceprintSample; autoPlay: boolean; isOnlySample: boolean }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [playFailed, setPlayFailed] = useState(false);
    const length = sample.endTimestamp - sample.startTimestamp;

    const play = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.currentTime < sample.startTimestamp || audio.currentTime >= sample.endTimestamp) {
            audio.currentTime = sample.startTimestamp;
        }
        audio.play().catch((error: unknown) => {
            // A pause before the audio starts rejects the play with an AbortError: not a failure.
            if (error instanceof DOMException && error.name === "AbortError") return;
            console.error("Error playing the voiceprint sample:", error);
            setPlayFailed(true);
        });
    }, [sample.startTimestamp, sample.endTimestamp]);

    useEffect(() => {
        if (autoPlay) play();
    }, [autoPlay, play]);

    const toggle = () => {
        if (isPlaying) {
            audioRef.current?.pause();
            return;
        }
        play();
    };

    const handleTimeUpdate = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.currentTime >= sample.endTimestamp) {
            audio.pause();
            audio.currentTime = sample.startTimestamp;
            setElapsed(0);
            return;
        }
        setElapsed(Math.max(0, audio.currentTime - sample.startTimestamp));
    };

    if (playFailed) {
        return (
            <p className='text-sm text-red-600'>
                {isOnlySample
                    ? "Could not play this sample. Close the dialog and open it again."
                    : "Could not play this sample. Try another one."}
            </p>
        );
    }

    return (
        <div className='flex items-center gap-3'>
            <Button variant='outline' size='sm' onClick={toggle} aria-label={isPlaying ? "Pause the sample" : "Play the sample"}>
                {isPlaying ? <Pause className='h-4 w-4' /> : <Play className='h-4 w-4' />}
            </Button>
            <Progress value={Math.min(100, (elapsed / length) * 100)} className='h-1.5 flex-1' aria-label='Sample progress' />
            <span className='text-xs tabular-nums text-slate-500'>
                {Math.floor(elapsed)}s / {Math.round(length)}s
            </span>
            <audio
                ref={audioRef}
                preload='none'
                // The fragment makes the first request start at the window.
                src={`${sample.mediaUrl}#t=${sample.startTimestamp},${sample.endTimestamp}`}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onError={() => setPlayFailed(true)}
            />
        </div>
    );
}
