import React, { useRef } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { cn, IS_DEV } from '@/lib/utils';

interface HighlightVideoProps {
    id: string;
    title: string;
    playbackId: string;
    videoUrl?: string;
    className?: string;
}

// Local HTML5 video player for development
const LocalVideoPlayer: React.FC<HighlightVideoProps> = ({ id, title, videoUrl, className }) => {
    const playerRef = useRef<HTMLVideoElement>(null);

    return (
        <div 
            className={cn("relative w-full aspect-video bg-black rounded-lg overflow-hidden", className)}
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
                    console.warn(`Failed to load local video: ${videoUrl}`, e);
                }}
            />
        </div>
    );
};

// MUX video player for production
const MuxVideoPlayer: React.FC<HighlightVideoProps> = ({ id, title, playbackId, className }) => {
    const playerRef = useRef<HTMLVideoElement>(null);

    return (
        <div 
            className={cn("relative w-full aspect-video bg-black rounded-lg overflow-hidden", className)}
            onClick={(e) => e.stopPropagation()}
        >
            <MuxVideo
                ref={playerRef}
                streamType="on-demand"
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
    // Use local video if in development and videoUrl is from localhost
    const shouldUseLocalVideo = IS_DEV && videoUrl?.includes('localhost');
    
    if (shouldUseLocalVideo) {
        return <LocalVideoPlayer 
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
    />;
}; 