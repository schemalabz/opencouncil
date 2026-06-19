import Image from "next/image";
import { getInitials } from "@/lib/formatters/name";


interface ImageOrInitialsProps {
    imageUrl: string | null;
    width: number;
    height: number;
    name?: string;
    color?: string;
    square?: boolean;
}
export const ImageOrInitials: React.FC<ImageOrInitialsProps> = ({ imageUrl, width, height, name, color, square }) => {
    const displayInitials = name ? getInitials(name) : '';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                borderRadius: square ? '4px' : '50%',
                border: `2px solid ${color ?? '#ccc'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: '#ccc',
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
            ) : (
                <div className="w-full h-full flex items-center justify-center text-[40cqmin]">
                    {name && displayInitials}
                </div>
            )}
        </div>
    );
};
