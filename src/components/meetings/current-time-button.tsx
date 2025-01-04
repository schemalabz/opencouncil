import { useVideo } from "@/components/meetings/VideoProvider";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useLayout } from "@/components/meetings/CouncilMeetingWrapper";

export default function CurrentTimeButton() {
    const { currentTime, currentScrollInterval, scrollToUtterance } = useVideo();
    const { isWide } = useLayout();

    if (currentScrollInterval && !(currentTime >= currentScrollInterval[0] && currentTime <= currentScrollInterval[1])) {
        const isScrollingUp = currentTime < currentScrollInterval[0];
        const Icon = isScrollingUp ? ArrowUp : ArrowDown;

        return (
            <Button
                onClick={() => scrollToUtterance(currentTime)}
                className={`fixed ${isWide ? 'bottom-24 left-1/2 transform -translate-x-1/2' : 'bottom-2 left-1/2 transform -translate-x-1/2'} shadow-md`}
                variant="outline"
            >
                <Icon className="w-4 h-4 mr-2" />
                Go to current time
            </Button>
        );
    } else {
        return null;
    }
}