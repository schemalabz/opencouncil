import Image from "next/image";


interface ImageOrInitialsProps {
    imageUrl: string | null;
    width: number;
    height: number;
    name?: string;
    color?: string;
    square?: boolean;
}
export const ImageOrInitials: React.FC<ImageOrInitialsProps> = ({ imageUrl, width, height, name, color, square }) => {
    const getInitials = () => {
        if (!name) return '';
        const nameParts = name.split(' ');
        if (nameParts.length <= 2) {
            return nameParts.map(n => n[0]).join('').toUpperCase();
        }
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    };
    const displayInitials = getInitials();

    return (
        <div
            style={{
                width: `${width}px`,
                height: `${height}px`,
                borderRadius: square ? '4px' : '50%',
                border: `2px solid ${color ?? '#ccc'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: Math.min(width, height) * 0.4,
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: '#ccc',
                position: 'relative',
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
                <div className="w-full h-full flex items-center justify-center">
                    {name && displayInitials}
                </div>
            )}
        </div>
    );
};
