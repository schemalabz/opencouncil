import React, { useRef, useState } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { cn, IS_DEV } from '@/lib/utils';

interface HighlightVideoProps {
    id: string;
    title: string;
    playbackId: string;
    videoUrl?: string;
    className?: string;
}

// Plays the S3 original directly: local development, and the fallback for when
// Mux cannot serve the clip.
const DirectVideoPlayer: React.FC<HighlightVideoProps> = ({ id, title, videoUrl, className }) => {
    const playerRef = useRef<HTMLVideoElement>(null);

    return (
        <div
            className={cn("relative w-full bg-black rounded-lg overflow-hidden", className)}
            onClick={(e) => e.stopPropagation()}
        >
            <video
                ref={playerRef}
                src={videoUrl}
                controls
                playsInline
                disablePictureInPicture
                className="w-full h-full object-contain"
                style={{
                    width: '100%',
                    height: '100%',
                }}
                onError={(e) => {
                    console.warn(`Failed to load video for highlight ${id}: ${videoUrl}`, e);
                }}
            />
        </div>
    );
};

// MUX video player for production
const MuxVideoPlayer: React.FC<HighlightVideoProps & { onMuxError: () => void }> = ({ id, title, playbackId, className, onMuxError }) => {
    const playerRef = useRef<HTMLVideoElement>(null);

    return (
        <div
            className={cn("relative w-full bg-black rounded-lg overflow-hidden", className)}
            onClick={(e) => e.stopPropagation()}
        >
            <MuxVideo
                ref={playerRef}
                streamType="on-demand"
                preferPlayback="mse"
                playbackId={playbackId}
                metadata={{
                    video_id: id,
                    video_title: title,
                }}
                playsInline
                disablePictureInPicture
                className="w-full h-full object-contain"
                style={{
                    width: '100%',
                    height: '100%',
                }}
                controls
                onError={(e) => {
                    // playback-core only surfaces fatal errors, so there is nothing
                    // transient to wait out: swap to the original rather than leave a
                    // black player behind. Covers a still-encoding asset too, which
                    // Mux reports as a 412 on the manifest.
                    console.warn(`Mux playback failed for highlight ${id}`, e.nativeEvent);
                    onMuxError();
                }}
            />
        </div>
    );
};

export const HighlightVideo: React.FC<HighlightVideoProps> = ({
    id,
    title,
    playbackId,
    videoUrl,
    className
}) => {
    const [muxFailed, setMuxFailed] = useState(false);

    // Use local video if in development and videoUrl is from localhost
    const shouldUseLocalVideo = IS_DEV && !!videoUrl?.includes('localhost');

    if (shouldUseLocalVideo || (muxFailed && !!videoUrl)) {
        return <DirectVideoPlayer
            id={id}
            title={title}
            playbackId={playbackId}
            videoUrl={videoUrl}
            className={className}
        />;
    }

    // Otherwise use MUX video (production or non-localhost)
    return <MuxVideoPlayer
        id={id}
        title={title}
        playbackId={playbackId}
        videoUrl={videoUrl}
        className={className}
        onMuxError={() => setMuxFailed(true)}
    />;
};
