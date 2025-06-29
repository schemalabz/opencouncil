import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

interface LayerControlsButtonProps {
    isOpen: boolean;
    activeCount: number;
    onToggle: () => void;
}

export default function LayerControlsButton({ isOpen, activeCount, onToggle }: LayerControlsButtonProps) {
    return (
        <Button
            onClick={onToggle}
            variant="secondary"
            size="sm"
            className="absolute top-4 left-4 shadow-lg z-10 bg-gray-900 hover:bg-gray-800 text-white border-gray-900"
        >
            <Layers className="h-4 w-4 mr-2" />
            Επίπεδα
            {!isOpen && (
                <Badge variant="outline" className="ml-2 border-gray-300 text-gray-300">
                    {activeCount}
                </Badge>
            )}
        </Button>
    );
} 