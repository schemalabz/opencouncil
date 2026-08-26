import React, { useEffect, useMemo, useState, useRef } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { useVideo } from './VideoProvider';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, Minimize2, Move, ArrowDownLeftSquare, Scaling } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

// MuxErrorCode.NETWORK_NOT_READY. playback-core reaches us as a transitive
// dependency, so importing the enum would mean pinning it directly.
const MUX_NETWORK_NOT_READY = 2412000;

// Mux publishes the manifest the moment the asset can play, so re-checking on a
// slow interval costs little and only delays the handover by that much.
const MUX_READY_POLL_MS = 30_000;

type MuxErrorDetail = {
    muxCode?: number;
    data?: { response?: { code?: number } };
};

export const Video: React.FC<{ className?: string, expandable?: boolean, onExpandChange?: (expanded: boolean) => void }> = ({ className, expandable = false, onExpandChange }) => {
    const { playerRef, meeting, isPlaying, currentTime, setIsPlaying, seekTo } = useVideo();
    const [muxFailed, setMuxFailed] = useState(false);
    const [muxStillEncoding, setMuxStillEncoding] = useState(false);
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

    // The original is a single bitrate served straight off storage, so it is only
    // ever a stopgap. While the asset is merely encoding its manifest answers 412
    // and turns 200 the moment it can play: watch for that and hand back, rather
    // than stranding the whole visit on the stopgap.
    useEffect(() => {
        const playbackId = meeting.muxPlaybackId;
        if (!muxFailed || !muxStillEncoding || !playbackId) return;

        let cancelled = false;
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, { method: 'HEAD' });
                if (!cancelled && res.ok) {
                    setMuxStillEncoding(false);
                    setMuxFailed(false);
                }
            } catch {
                // Offline or blocked; the next tick tries again.
            }
        }, MUX_READY_POLL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [muxFailed, muxStillEncoding, meeting.muxPlaybackId]);

    const renderVideoElement = () => {
        return <VideoElement
            id={meeting.id}
            title={meeting.name}
            playbackId={!muxFailed ? meeting.muxPlaybackId : null}
            fallbackSrc={fallbackSrc}
            onMuxError={(stillEncoding) => {
                setMuxStillEncoding(stillEncoding);
                setMuxFailed(true);
            }}
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
    onMuxError: (retryable: boolean) => void;
    isExpanded?: boolean;
}) => {
    const { onSeeked, onSeeking, onTimeUpdate, onLoadedMetadata, playerRef, currentTimeRef } = useVideo();

    // Resume where the swapped-out element left off. This runs in both directions:
    // Mux erroring onto the original, and the asset finishing its encode and
    // taking over again.
    const resumeFromLastPosition = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        if (currentTimeRef.current > 0) {
            e.currentTarget.currentTime = currentTimeRef.current;
        }
        onLoadedMetadata();
    };

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
        onLoadedMetadata: resumeFromLastPosition,
    };

    return (
        <div className="w-full h-full flex items-center justify-center bg-black">
            {playbackId ? (
                <MuxVideo
                    ref={playerRef as any}
                    streamType="on-demand"
                    // Chrome 151 reports canPlayType('application/vnd.apple.mpegurl') as
                    // "maybe" but cannot play HLS: a native <video> on the manifest fails
                    // with MEDIA_ERR_SRC_NOT_SUPPORTED. Mux trusts canPlayType, picks
                    // native playback, errors, and drops us to the multi-GB S3 mp4.
                    // Force hls.js wherever MSE exists; iOS Safari still gets native.
                    preferPlayback="mse"
                    playbackId={playbackId}
                    metadata={{
                        video_id: id,
                        video_title: title,
                    }}
                    onError={(e) => {
                        // playback-core only surfaces fatal errors, so there is nothing
                        // transient to wait out: leave for the original rather than sit
                        // on a black player. A 412 means the asset is still encoding, so
                        // it is worth coming back for once it lands. Only the hls.js path
                        // sets muxCode; the native one carries the bare HTTP status.
                        const detail = (e.nativeEvent as CustomEvent<MuxErrorDetail | undefined>).detail;
                        const stillEncoding = detail?.muxCode === MUX_NETWORK_NOT_READY
                            || detail?.data?.response?.code === 412;

                        if (fallbackSrc) {
                            console.warn(`Mux playback failed for meeting ${id}, falling back to ${fallbackSrc}`, e.nativeEvent);
                            onMuxError(stillEncoding);
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
                />
            )}
        </div>
    );
};