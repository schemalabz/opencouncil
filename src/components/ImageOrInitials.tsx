import Image from "next/image";


interface ImageOrInitialsProps {
    imageUrl: string | null;
    width: number;
    height: number;
    name?: string;
    color?: string;
}
export const ImageOrInitials: React.FC<ImageOrInitialsProps> = ({ imageUrl, width, height, name, color }) => {
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
                borderRadius: '50%',
                border: `2px solid ${color ?? '#ccc'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: '#ccc',
            }}
        >
            {imageUrl ? (
                <Image
                    src={imageUrl}
                    alt={name ?? ''}
                    width={width}
                    height={height}
                    className="object-cover rounded-full no-underline"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-sm">
                    {name && displayInitials}
                </div>
            )}
        </div>
    );
};
