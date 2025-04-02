import React, { useRef } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { cn } from '@/lib/utils';

interface HighlightVideoProps {
    id: string;
    title: string;
    playbackId: string;
    className?: string;
}

export const HighlightVideo: React.FC<HighlightVideoProps> = ({ id, title, playbackId, className }) => {
    const playerRef = useRef<HTMLVideoElement>(null)

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