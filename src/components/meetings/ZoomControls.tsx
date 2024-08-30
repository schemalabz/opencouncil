import React from "react";
import { Button } from "../ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

interface ZoomControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
}

export default function ZoomControls({ onZoomIn, onZoomOut }: ZoomControlsProps) {
    return (
        <div className="flex flex-col space-y-2">
            <Button onClick={onZoomIn} size="icon" variant="outline">
                <ZoomIn className="h-4 w-4" />
            </Button>
            <Button onClick={onZoomOut} size="icon" variant="outline">
                <ZoomOut className="h-4 w-4" />
            </Button>
        </div>
    );
}