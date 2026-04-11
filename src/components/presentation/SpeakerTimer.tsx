"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatTimerDisplay(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function SpeakerTimer() {
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [pausedElapsed, setPausedElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [countdownFrom, setCountdownFrom] = useState<number | null>(null);

    useEffect(() => {
        if (!running || startedAt === null) return;
        const update = () => {
            const next = pausedElapsed + Math.floor((Date.now() - startedAt) / 1000);
            setElapsed((prev) => (prev === next ? prev : next));
        };
        update();
        const interval = setInterval(update, 250);
        return () => clearInterval(interval);
    }, [running, startedAt, pausedElapsed]);

    const hasStarted = startedAt !== null;
    // During a countdown, show remaining time. Once it reaches zero the timer
    // keeps running and the display flips to a count-up starting from the
    // original countdown duration (e.g. a 1' countdown becomes 1:00, 1:01, …).
    const displayed = countdownFrom !== null && elapsed < countdownFrom
        ? countdownFrom - elapsed
        : elapsed;
    // Red once we enter the final 30s of the countdown and stays red after it ends.
    const isCountdownWarning = countdownFrom !== null && elapsed >= countdownFrom - 30;

    const handleToggle = () => {
        if (running && startedAt !== null) {
            setPausedElapsed(pausedElapsed + Math.floor((Date.now() - startedAt) / 1000));
            setRunning(false);
            return;
        }
        setStartedAt(Date.now());
        if (!hasStarted) setPausedElapsed(0);
        setRunning(true);
    };

    const startCountdown = (minutes: number) => {
        setCountdownFrom(minutes * 60);
        setPausedElapsed(0);
        setElapsed(0);
        setStartedAt(Date.now());
        setRunning(true);
    };

    const handleReset = () => {
        setStartedAt(null);
        setPausedElapsed(0);
        setRunning(false);
        setElapsed(0);
        setCountdownFrom(null);
    };

    const mainLabel = running ? "Παύση" : hasStarted ? "Συνέχεια" : "Έναρξη";

    return (
        <div className="flex items-center gap-[3vw]">
            <div className="text-[1.8vh] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                Χρόνος<br />Ομιλητή
            </div>
            <button
                type="button"
                onClick={handleToggle}
                className={`font-mono tabular-nums font-bold text-[16vh] leading-none tracking-tight hover:opacity-80 active:opacity-70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-4 text-center min-w-[5ch] ${isCountdownWarning ? "text-red-600" : ""}`}
                aria-label={mainLabel}
            >
                {formatTimerDisplay(displayed)}
            </button>
            <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleToggle}
                        className="h-9 px-3 text-sm w-28 justify-start"
                    >
                        {running ? (
                            <>
                                <Pause className="w-4 h-4 mr-1.5" />
                                Παύση
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 mr-1.5" />
                                {hasStarted ? "Συνέχεια" : "Έναρξη"}
                            </>
                        )}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startCountdown(1)}
                        className="h-9 w-12 px-0 text-sm tabular-nums"
                        aria-label="Αντίστροφη μέτρηση 1 λεπτού"
                    >
                        1&apos;
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startCountdown(3)}
                        className="h-9 w-12 px-0 text-sm tabular-nums"
                        aria-label="Αντίστροφη μέτρηση 3 λεπτών"
                    >
                        3&apos;
                    </Button>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReset}
                    disabled={!hasStarted}
                    className="h-9 px-3 text-sm w-28 justify-start"
                >
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    Επαναφορά
                </Button>
            </div>
        </div>
    );
}
