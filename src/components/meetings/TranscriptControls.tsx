import { Play, Pause } from "lucide-react"
import { useVideo } from "./VideoProvider"
import { cn } from "@/lib/utils";
export default function TranscriptControls({ isWide, className, speakerTimes }: { isWide: boolean, className?: string, speakerTimes: { start: number, end: number }[] }) {
    const { isPlaying, togglePlayPause, currentTime, duration, seekTo, videoRef, currentScrollInterval } = useVideo();

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickPosition = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = clickPosition / totalLength;
        seekTo(percentage * duration);
    };
    return (
        <>
            <div className={cn(`fixed ${isWide ? 'bottom-2 left-2 right-2 h-16' : 'top-2 left-2 bottom-2 w-16'} flex ${isWide ? 'flex-row' : 'flex-col'} items-center `, className)}>
                <button
                    onClick={togglePlayPause}
                    className="p-4 bg-background/30 backdrop-blur-sm backdrop-brightness-95 m-2 border h-16 w-16 flex items-center justify-center hover:backdrop-brightness-75"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </button>

                {/* seek slider */}
                <div
                    className={`flex-grow cursor-pointer ${isWide ? 'h-16' : 'w-16'} bg-background/30 backdrop-blur-sm backdrop-brightness-50 m-2 border relative`}
                    onClick={handleSeek}
                >
                    {currentScrollInterval[0] !== currentScrollInterval[1] && (
                        <div
                            className={`absolute bg-background ${isWide ? 'h-full' : 'w-full'}`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(currentScrollInterval[0] / duration) * 100}%`,
                                [isWide ? 'width' : 'height']: `${((currentScrollInterval[1] - currentScrollInterval[0]) / duration) * 100}%`,
                            }}
                        />
                    )}
                    {speakerTimes.map((time, index) => (
                        <div
                            key={index}
                            className={`absolute bg-blue-500/50 ${isWide ? 'h-1/2 top-1/4' : 'w-1/2 left-1/4'}`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(time.start / duration) * 100}%`,
                                [isWide ? 'width' : 'height']: `${((time.end - time.start) / duration) * 100}%`,
                            }}
                        />
                    ))}
                    <div
                        className={`absolute bg-slate-600 ${isWide ? 'w-1 h-full' : 'h-1 w-full'}`}
                        style={{
                            [isWide ? 'left' : 'top']: `${(currentTime / duration) * 100}%`,
                        }}
                    />
                </div>
            </div>

        </>
    )
}
