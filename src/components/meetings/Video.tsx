import React, { useMemo, useState, useRef } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { useVideo } from './VideoProvider';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, Minimize2, Move, ArrowDownLeftSquare, Scaling } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

export const Video: React.FC<{ className?: string, expandable?: boolean, onExpandChange?: (expanded: boolean) => void }> = ({ className, expandable = false, onExpandChange }) => {
    const { playerRef, meeting, isPlaying, currentTime, setIsPlaying, seekTo } = useVideo();
    const [muxFailed, setMuxFailed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 320, height: 180 });
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const initialMousePos = useRef<{ x: number; y: number } | null>(null);
    const initialDimensions = useRef<{ width: number; height: number } | null>(null);
    const controls = useAnimation();

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

    const handleResize = (e: MouseEvent) => {
        if (!containerRef.current || !initialMousePos.current || !initialDimensions.current) return;

        const deltaX = initialMousePos.current.x - e.clientX;
        const deltaY = e.clientY - initialMousePos.current.y;
        const delta = Math.max(deltaX, deltaY);

        const newWidth = Math.max(320, initialDimensions.current.width + delta);
        const aspectRatio = 16 / 9;
        const newHeight = newWidth / aspectRatio;

        // Ensure the video doesn't get too large
        const maxWidth = window.innerWidth * 0.8;
        const maxHeight = window.innerHeight * 0.8;
        const constrainedWidth = Math.min(newWidth, maxWidth);
        const constrainedHeight = Math.min(newHeight, maxHeight);

        setDimensions({
            width: constrainedWidth,
            height: constrainedHeight
        });
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!containerRef.current) return;

        setIsResizing(true);
        initialMousePos.current = { x: e.clientX, y: e.clientY };
        initialDimensions.current = { ...dimensions };

        const handleMouseMove = (e: MouseEvent) => {
            e.preventDefault();
            handleResize(e);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            initialMousePos.current = null;
            initialDimensions.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // S3 originals to fall back to when the Mux asset can't be played
    // (e.g. the asset was deleted or never provisioned on Mux).
    const fallbackSrc = meeting.videoUrl ?? meeting.audioUrl ?? null;

    const renderVideoElement = () => {
        return <VideoElement
            id={meeting.id}
            title={meeting.name}
            playbackId={!muxFailed ? meeting.muxPlaybackId : null}
            fallbackSrc={fallbackSrc}
            onMuxError={() => setMuxFailed(true)}
            isExpanded={isExpanded}
        />
    };

    if (isExpanded) {
        return (
            <>
                <motion.div
                    ref={containerRef}
                    drag={!isResizing}
                    dragMomentum={false}
                    dragElastic={0.1}
                    whileDrag={!isResizing ? { scale: 1.1 } : undefined}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="fixed z-50 shadow-lg rounded-lg overflow-hidden"
                    style={{ width: dimensions.width, height: dimensions.height }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {renderVideoElement()}
                    <button
                        onClick={toggleExpand}
                        className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 rounded-full z-10"
                    >
                        <ArrowDownLeft className="w-4 h-4 text-white" />
                    </button>
                    {isHovered && !isResizing && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
                        >
                            <Move className="w-6 h-6 text-white" />
                        </motion.div>
                    )}
                </motion.div>
                <motion.div
                    onMouseDown={handleResizeStart}
                    initial={{ opacity: 1 }}
                    whileHover={{ opacity: 1 }}
                    className="fixed w-12 h-12 cursor-sw-resize z-[51] overflow-hidden"
                    style={{
                        left: `${containerRef.current?.getBoundingClientRect().left || 0}px`,
                        top: `${(containerRef.current?.getBoundingClientRect().bottom || 0) - 48}px`,
                    }}
                >
                    <div
                        className="absolute inset-0"
                        style={{
                            background: '#000000',
                            clipPath: 'polygon(0 0, 0% 100%, 100% 100%)'
                        }}
                    />
                    <Scaling
                        className="absolute bottom-2 left-2 w-4 h-4 text-white"
                    />
                </motion.div>
            </>
        );
    }

    return (
        <div className={cn("w-full h-full relative flex items-center justify-center", className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}>
            {renderVideoElement()}
            {
                expandable && isHovered && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-0 left-0 w-full h-full bg-black opacity-50 flex items-center justify-center"
                        onClick={toggleExpand}
                    >
                        <ArrowUpRight className="w-6 h-6 text-white" />
                    </motion.div>
                )
            }
        </div>
    );
};

const VideoElement = ({ id, title, playbackId, fallbackSrc, onMuxError, isExpanded }: {
    id: string;
    title: string;
    playbackId: string | null;
    fallbackSrc: string | null;
    onMuxError: () => void;
    isExpanded?: boolean;
}) => {
    const { onSeeked, onSeeking, onTimeUpdate, onLoadedMetadata, playerRef, currentTimeRef } = useVideo();

    const sharedProps = {
        playsInline: true,
        disablePictureInPicture: true,
        className: cn(
            "w-full h-full object-contain",
            isExpanded && "absolute inset-0"
        ),
        style: {
            width: '100%',
            height: '100%',
        },
        onSeeked,
        onSeeking,
        onTimeUpdate,
        onLoadedMetadata,
    };

    return (
        <div className="w-full h-full flex items-center justify-center bg-black">
            {playbackId ? (
                <MuxVideo
                    ref={playerRef as any}
                    streamType="on-demand"
                    playbackId={playbackId}
                    metadata={{
                        video_id: id,
                        video_title: title,
                    }}
                    onError={() => {
                        if (fallbackSrc) {
                            console.warn(`Mux playback failed for meeting ${id}, falling back to ${fallbackSrc}`);
                            onMuxError();
                        }
                    }}
                    {...sharedProps}
                />
            ) : (
                <video
                    ref={playerRef}
                    src={fallbackSrc ?? undefined}
                    title={title}
                    preload="metadata"
                    {...sharedProps}
                    onLoadedMetadata={(e) => {
                        // Resume from where the Mux player left off before it errored
                        if (currentTimeRef.current > 0) {
                            e.currentTarget.currentTime = currentTimeRef.current;
                        }
                        onLoadedMetadata();
                    }}
                />
            )}
        </div>
    );
};