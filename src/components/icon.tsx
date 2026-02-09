import type { LucideProps } from 'lucide-react';
import {
    BadgeCheck,
    BadgeX,
    Building,
    Building2,
    Bus,
    Calendar,
    Clock,
    FileText,
    GraduationCap,
    Hash,
    Heart,
    Leaf,
    MapPin,
    Music2,
    Recycle,
    Shield,
    Users,
    Wallet,
} from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;

export const iconMap: Record<string, LucideIcon> = {
    BadgeCheck,
    BadgeX,
    Building,
    Building2,
    Bus,
    Calendar,
    Clock,
    FileText,
    GraduationCap,
    Hash,
    Heart,
    Leaf,
    MapPin,
    Music2,
    Recycle,
    Shield,
    Users,
    Wallet,
};

const Icon = ({ name, color, size }: { name: string, color: string, size: number }) => {
    const LucideIcon = iconMap[name];
    if (!LucideIcon) {
        return null;
    }

    return <LucideIcon color={color} size={size} />;
};

export default Icon;
