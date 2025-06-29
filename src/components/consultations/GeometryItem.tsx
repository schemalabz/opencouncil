import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface GeometryItemProps {
    id: string;
    name: string;
    enabled: boolean;
    color: string;
    onToggle: (id: string) => void;
}

export default function GeometryItem({ id, name, enabled, color, onToggle }: GeometryItemProps) {
    return (
        <div className="flex items-center gap-2">
            <div className="relative flex items-center">
                <Checkbox
                    id={`geometry-${id}`}
                    checked={enabled}
                    onCheckedChange={() => onToggle(id)}
                    className="data-[state=checked]:text-current data-[state=checked]:border-current data-[state=checked]:bg-white border-current bg-white"
                    style={{
                        color: color,
                        borderColor: color,
                        backgroundColor: 'white'
                    }}
                />
            </div>
            <Label
                htmlFor={`geometry-${id}`}
                className="text-xs flex-1 cursor-pointer"
            >
                {name}
            </Label>
        </div>
    );
} 