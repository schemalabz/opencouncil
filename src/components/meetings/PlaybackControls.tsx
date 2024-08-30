import React from "react";
import { useVideo } from "./VideoProvider";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Play, Pause } from "lucide-react";

export default function PlaybackControls() {
    const { isPlaying, togglePlayPause, playbackSpeed, handleSpeedChange, currentTime, duration } = useVideo();

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="flex flex-col items-center space-y-2">
            <div className="flex items-center space-x-2">
                <Button onClick={togglePlayPause} size="icon">
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Select value={playbackSpeed} onValueChange={handleSpeedChange}>
                    <SelectTrigger className="w-[80px]">
                        <SelectValue placeholder="Speed" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1x</SelectItem>
                        <SelectItem value="1.2">1.2x</SelectItem>
                        <SelectItem value="1.5">1.5x</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="text-sm text-center">
                {formatTime(currentTime)} / {formatTime(duration)}
            </div>
        </div>
    );
}