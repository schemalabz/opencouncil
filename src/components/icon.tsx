import { icons } from 'lucide-react';

const Icon = ({ name, color, size }: { name: keyof typeof icons, color: string, size: number }) => {
    const LucideIcon = icons[name];
    if (!LucideIcon) {
        return null;
    }

    return <LucideIcon color={color} size={size} />;
};

export default Icon;