import Image from "next/image";
import { User } from "lucide-react";
import { getInitials } from "@/lib/formatters/name";
import { topicStyle } from "@/lib/topicStyle";


interface ImageOrInitialsProps {
    imageUrl: string | null;
    width: number;
    height: number;
    name?: string;
    color?: string;
    square?: boolean;
    /**
     * `wash` renders the initials fallback as a washed tile — the entity's
     * colour at chip alpha, an inset ring, ink initials — the same wash/ink
     * derivation the topic chips use. Images render exactly as the default.
     */
    variant?: 'solid' | 'wash';
}
export const ImageOrInitials: React.FC<ImageOrInitialsProps> = ({ imageUrl, width, height, name, color, square, variant = 'solid' }) => {
    const displayInitials = name ? getInitials(name) : '';
    const wash = variant === 'wash' && !imageUrl ? topicStyle(color) : null;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                // 21.5% keeps the wash tile's corner (18px at the 84px header
                // size) proportional at any size.
                borderRadius: square ? (wash ? '21.5%' : '4px') : '50%',
                border: wash ? 'none' : `2px solid ${color ?? '#ccc'}`,
                boxShadow: wash ? `inset 0 0 0 1.5px ${wash.border}` : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontWeight: 'bold',
                color: wash ? wash.icon : '#fff',
                backgroundColor: wash ? wash.background : '#ccc',
                position: 'relative',
                containerType: 'size',
            }}
        >
            {imageUrl ? (
                <Image
                    src={imageUrl}
                    alt={name ?? ''}
                    fill
                    sizes={`${Math.max(width, height)}px`}
                    className={`object-cover ${square ? 'rounded' : 'rounded-full'}`}
                    style={{ objectPosition: 'center center' }}
                />
            ) : displayInitials ? (
                <div className="w-full h-full flex items-center justify-center" style={{ fontSize: wash ? '31cqmin' : '40cqmin' }}>
                    {displayInitials}
                </div>
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <User className="w-[55cqmin] h-[55cqmin]" aria-hidden />
                </div>
            )}
        </div>
    );
};
