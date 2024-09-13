import React, { useMemo, useState } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { useVideo } from './VideoProvider';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, Minimize2 } from 'lucide-react';
import { motion } from 'framer-motion';

export const Video: React.FC<{ className?: string, expandable?: boolean, onExpandChange?: (expanded: boolean) => void }> = ({ className, expandable = false, onExpandChange }) => {
    const { playerRef, meeting, isPlaying, currentTime, setIsPlaying, seekTo } = useVideo();
    const [isHovered, setIsHovered] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpand = () => {
        const prevState = {
            isPlaying: isPlaying,
            currentTime: playerRef.current?.currentTime,
        }

        setIsExpanded(!isExpanded);
        onExpandChange?.(!isExpanded);
        setIsHovered(false);

        setTimeout(() => {
            setIsPlaying(prevState.isPlaying);
            seekTo(prevState.currentTime ?? 0);
        }, 0);
    };

    const renderVideoElement = () => {
        return <VideoElement id={meeting.id} title={meeting.name} playbackId={meeting.muxPlaybackId!} />
    };

    if (isExpanded) {
        return (
            <motion.div
                drag
                dragMomentum={false}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="fixed z-50 shadow-lg rounded-lg overflow-hidden"
                style={{ width: '320px', height: '180px' }}
            >
                {renderVideoElement()}
                <button
                    onClick={toggleExpand}
                    className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 rounded-full"
                >
                    <ArrowDownLeft className="w-4 h-4 text-white" />
                </button>
            </motion.div>
        );
    }

    return (
        <div className={cn("w-full h-full relative flex items-center justify-center", className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}>
            {renderVideoElement()}
            {
                expandable && isHovered && (
                    <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 flex items-center justify-center" onClick={toggleExpand}>
                        <ArrowUpRight className="w-6 h-6 text-white" />
                    </div>
                )
            }
        </div>
    );
};

const VideoElement = ({ id, title, playbackId }: { id: string; title: string; playbackId: string }) => {
    const { onSeeked, onSeeking, onTimeUpdate, playerRef } = useVideo();
    return (
        <MuxVideo
            ref={playerRef as any}
            streamType="on-demand"
            playbackId={playbackId}
            metadata={{
                video_id: id,
                video_title: title,
            }}
            playsInline
            disablePictureInPicture
            className="max-w-full max-h-full"
            onSeeked={onSeeked}
            onSeeking={onSeeking}
            onTimeUpdate={onTimeUpdate}
        />
    );
}